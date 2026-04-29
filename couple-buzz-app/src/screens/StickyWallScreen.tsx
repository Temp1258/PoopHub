import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Animated,
  PanResponder,
  Easing,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';
import { api, StickyView, StickyTemp } from '../services/api';
import { subscribe } from '../services/socket';
import StickyNote, { INK_MINE, INK_PARTNER } from '../components/StickyNote';
import { SpringPressable } from '../components/SpringPressable';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Parent fires this when the wall reports back a fresh "any unread?"
  // signal (post-mark-seen, post-refresh) so the entry card 小红旗 stays
  // in lockstep without an extra fetch round-trip.
  onUnreadChange?: (hasUnread: boolean) => void;
}

export interface StickyWallHandle {
  reload: () => Promise<void>;
}

type EditorMode =
  | { kind: 'new' }
  | { kind: 'comment'; stickyId: number }
  | null;

const AUTOSAVE_DELAY_MS = 1200;

function formatStickyDate(iso: string): string {
  // Render the floating header label in BJT-equivalent local form. Today /
  // yesterday wording matches Apple Photos' grouping affordance.
  const d = new Date(iso);
  const now = new Date();
  const yyyymmdd = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const today = yyyymmdd(now);
  const yest = new Date(now.getTime() - 86400000);
  const yKey = yyyymmdd(yest);
  const dKey = yyyymmdd(d);
  if (dKey === today) return '今天';
  if (dKey === yKey) return '昨天';
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const StickyWallScreen = forwardRef<StickyWallHandle, Props>(({ visible, onClose, onUnreadChange }, ref) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [wall, setWall] = useState<StickyView[]>([]);
  const [myTemp, setMyTemp] = useState<StickyTemp | null>(null);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [editorText, setEditorText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [headerLabel, setHeaderLabel] = useState<string>('');

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUnreadChangeRef = useRef(onUnreadChange);
  onUnreadChangeRef.current = onUnreadChange;

  const reload = useCallback(async () => {
    try {
      const res = await api.getStickies();
      setWall(res.stickies);
      setMyTemp(res.my_temp);
      onUnreadChangeRef.current?.(res.stickies.some(s => s.unread));
      // Auto-open editor in this priority: an unposted new sticky first,
      // then any in-flight comment. Both kinds resume seamlessly after a
      // tab switch / app background, per the "still on the unfinished
      // sticky's screen" requirement.
      if (res.my_temp) {
        setEditor({ kind: 'new' });
        setEditorText(res.my_temp.content);
      } else {
        const stickyWithTempBlock = res.stickies.find(s => s.my_temp_block);
        if (stickyWithTempBlock) {
          setEditor({ kind: 'comment', stickyId: stickyWithTempBlock.id });
          setEditorText(stickyWithTempBlock.my_temp_block!.content);
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  useImperativeHandle(ref, () => ({ reload }), [reload]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    reload();
  }, [visible, reload]);

  // Live update from partner: post / append. Sender's own client filters
  // itself out via `from`.
  useEffect(() => {
    if (!visible) return;
    return subscribe('sticky_update', (data?: { from?: string }) => {
      // We refresh on every event regardless of `from` because the wall row's
      // own state (e.g. layout_x assigned by server) is only known after the
      // round trip; sender benefits from the fresh server-canonical view too.
      reload();
    });
  }, [visible, reload]);

  // Autosave whatever the user types — but only when an editor is open. The
  // server enforces "must already have a temp", so the first POST is done
  // when the user taps 来一帖 / 再写点.
  useEffect(() => {
    if (!editor) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      (async () => {
        try {
          if (editor.kind === 'new') {
            await api.saveStickyTemp(editorText);
          } else {
            await api.saveStickyComment(editor.stickyId, editorText);
          }
        } catch {}
      })();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [editorText, editor]);

  // Floating date label fade-in/out, Apple-Photos style. Pinned to the
  // top-left over the scroll content; surfaces while scrolling, fades out
  // ~1.4s after the user stops.
  const showHeader = useCallback(() => {
    if (headerHideTimer.current) clearTimeout(headerHideTimer.current);
    Animated.timing(headerOpacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    headerHideTimer.current = setTimeout(() => {
      Animated.timing(headerOpacity, { toValue: 0, duration: 480, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }, 1400);
  }, [headerOpacity]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems || viewableItems.length === 0) return;
    const top = viewableItems[0]?.item as StickyView | undefined;
    if (!top || !top.posted_at) return;
    const label = formatStickyDate(top.posted_at);
    setHeaderLabel(label);
    showHeader();
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;

  // ── Editor lifecycle ────────────────────────────────────────────────────

  const startNewSticky = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const temp = await api.startStickyTemp();
      setMyTemp(temp);
      setEditor({ kind: 'new' });
      setEditorText(temp.content);
    } catch (e: any) {
      Alert.alert('', e.message || '无法开始');
    }
  }, []);

  const startComment = useCallback(async (stickyId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const r = await api.startStickyComment(stickyId);
      setEditor({ kind: 'comment', stickyId });
      setEditorText(r.content);
    } catch (e: any) {
      Alert.alert('', e.message || '无法开始留言');
    }
  }, []);

  const cancelEditor = useCallback(async () => {
    if (!editor) return;
    const current = editor;
    // Optimistic close: hide editor first so the UI doesn't feel stuck while
    // the DELETE round-trips.
    setEditor(null);
    setEditorText('');
    try {
      if (current.kind === 'new') {
        await api.cancelStickyTemp();
        setMyTemp(null);
      } else {
        await api.cancelStickyComment(current.stickyId);
      }
    } catch {}
    reload();
  }, [editor, reload]);

  const submitEditor = useCallback(async () => {
    if (!editor || submitting) return;
    const text = editorText.trim();
    if (!text) {
      Alert.alert('', '写点东西再贴吧～');
      return;
    }
    const current = editor;
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      if (current.kind === 'new') {
        await api.postSticky(text);
        setMyTemp(null);
      } else {
        await api.commitStickyComment(current.stickyId, text);
      }
      setEditor(null);
      setEditorText('');
      reload();
    } catch (e: any) {
      Alert.alert('', e.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  }, [editor, submitting, editorText, reload]);

  // Single close path used by both the pull-down gesture and the explicit
  // 关闭 button. While writing, treats close as cancel (deletes the temp) —
  // matches the spec's "下拉关掉每日一帖墙" semantic.
  const handleClose = useCallback(() => {
    if (editor) cancelEditor();
    onClose();
  }, [editor, cancelEditor, onClose]);

  // Top-of-screen pull handle — tug down to dismiss. If we're mid-write the
  // close path also deletes the temp, matching the spec ("下拉关掉每日一帖
  // 墙 = 删除该临时便利贴").
  const dragY = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) dragY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 110) {
            Animated.timing(dragY, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => {
              dragY.setValue(0);
              if (editor) cancelEditor();
              onClose();
            });
          } else {
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
          }
        },
      }),
    [dragY, editor, cancelEditor, onClose]
  );

  // ── Sticky tap → mark seen + select ────────────────────────────────────

  const handleStickyTap = useCallback(async (sticky: StickyView) => {
    if (selectedId === sticky.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(sticky.id);
    if (sticky.unread) {
      try {
        await api.markStickySeen(sticky.id);
        // Optimistic local update so the unread island disappears now;
        // background reload syncs the canonical state.
        setWall(prev => prev.map(s => s.id === sticky.id ? { ...s, unread: false } : s));
        onUnreadChangeRef.current?.(wall.filter(s => s.id !== sticky.id).some(s => s.unread));
      } catch {}
    }
  }, [selectedId, wall]);

  const selectedSticky = useMemo(
    () => (selectedId ? wall.find(s => s.id === selectedId) ?? null : null),
    [selectedId, wall]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: StickyView }) => {
    const writingComment = editor?.kind === 'comment' && editor.stickyId === item.id;
    return (
      <View style={styles.itemRow}>
        <StickyNote
          sticky={item}
          selected={selectedId === item.id}
          writingComment={writingComment}
          onPress={() => handleStickyTap(item)}
        />
      </View>
    );
  }, [selectedId, editor, handleStickyTap]);

  const renderToolbar = () => {
    if (editor) {
      return (
        <View style={styles.toolbar}>
          <SpringPressable onPress={cancelEditor} style={[styles.pill, styles.pillSecondary]}>
            <Text style={styles.pillSecondaryText}>
              {editor.kind === 'new' ? '不写了' : '取消'}
            </Text>
          </SpringPressable>
          <SpringPressable
            onPress={submitEditor}
            style={[styles.pill, styles.pillPrimary, submitting && styles.pillDisabled]}
          >
            <Text style={styles.pillPrimaryText}>
              {submitting ? '保存中...' : editor.kind === 'new' ? '贴上去' : '先写这么多'}
            </Text>
          </SpringPressable>
        </View>
      );
    }
    if (selectedSticky) {
      return (
        <View style={styles.toolbar}>
          <SpringPressable onPress={() => setSelectedId(null)} style={[styles.pill, styles.pillSecondary]}>
            <Text style={styles.pillSecondaryText}>取消</Text>
          </SpringPressable>
          <SpringPressable onPress={() => startComment(selectedSticky.id)} style={[styles.pill, styles.pillPrimary]}>
            <Text style={styles.pillPrimaryText}>再写点</Text>
          </SpringPressable>
        </View>
      );
    }
    return (
      <View style={styles.toolbar}>
        <SpringPressable onPress={startNewSticky} style={[styles.pill, styles.pillPrimary, styles.pillWide]}>
          <Text style={styles.pillPrimaryText}>来一帖</Text>
        </SpringPressable>
      </View>
    );
  };

  // Render the in-flight editor as a centered sticky-paper sheet over the
  // wall. Comment mode shows the existing committed blocks above the input
  // so the writer has context for what they're appending to.
  const renderEditor = () => {
    if (!editor) return null;
    const targetSticky = editor.kind === 'comment' ? wall.find(s => s.id === editor.stickyId) : null;
    const inkColor = INK_MINE; // editor is always "me"
    return (
      <View style={[styles.editorOverlay, { top: insets.top + 56, bottom: insets.bottom + 96 }]} pointerEvents="box-none">
        <View style={styles.editorBackdrop} />
        <View style={styles.editorSheet}>
          {targetSticky && (
            <View style={styles.editorContextBlock}>
              {targetSticky.blocks.map((b, i) => (
                <View key={b.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <Text style={[styles.editorContextText, { color: b.author_role === 'me' ? INK_MINE : INK_PARTNER }]} numberOfLines={3}>
                    {b.content}
                  </Text>
                </View>
              ))}
              <View style={styles.divider} />
            </View>
          )}
          <TextInput
            value={editorText}
            onChangeText={setEditorText}
            placeholder={editor.kind === 'new' ? '在这里写下你想说的...' : '继续往下写...'}
            placeholderTextColor="rgba(92, 64, 51, 0.4)"
            multiline
            maxLength={1000}
            style={[styles.editorInput, { color: inkColor }]}
            autoFocus
          />
          <Text style={styles.editorCount}>{editorText.length} / 1000</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      <Animated.View
        style={[styles.container, { transform: [{ translateY: dragY }] }]}
      >
        <View style={[styles.dragArea, { paddingTop: insets.top }]} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>📝 每日一帖</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeBtn}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Floating date label, Apple-Photos style */}
        {!!headerLabel && (
          <Animated.View
            pointerEvents="none"
            style={[styles.floatingDate, { top: insets.top + 56, opacity: headerOpacity }]}
          >
            <Text style={styles.floatingDateText}>{headerLabel}</Text>
          </Animated.View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.kiss} />
          </View>
        ) : wall.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>🧷</Text>
            <Text style={styles.emptyTitle}>墙上还空着</Text>
            <Text style={styles.emptySub}>按下方「来一帖」开始写第一张</Text>
          </View>
        ) : (
          <FlatList
            data={wall}
            keyExtractor={s => String(s.id)}
            renderItem={renderItem}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 140 + insets.bottom }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {renderEditor()}

        <View style={[styles.toolbarSlot, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
          {renderToolbar()}
        </View>
      </Animated.View>
    </Modal>
  );
});

export default StickyWallScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF1E6',
  },
  dragArea: {
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(92, 64, 51, 0.18)',
    marginTop: 6,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  itemRow: {
    paddingVertical: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  emptySub: { fontSize: 13, color: COLORS.textLight },

  floatingDate: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(14, 14, 16, 0.78)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  floatingDateText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  toolbarSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 12,
  },
  pill: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
    minWidth: 96,
    alignItems: 'center',
  },
  pillWide: {
    minWidth: 140,
  },
  pillPrimary: {
    backgroundColor: COLORS.kiss,
  },
  pillDisabled: {
    opacity: 0.55,
  },
  pillPrimaryText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pillSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillSecondaryText: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: '600',
  },

  // Sits below the dragArea (top inset + 56pt) and above the toolbar (bottom
  // inset + 96pt) so the drag handle + 关闭 button stay tappable while the
  // editor is open. The backdrop fills only this region — the dragArea
  // visually covers the wall above on its own.
  editorOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  editorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  editorSheet: {
    flex: 1,
    marginHorizontal: 20,
    marginVertical: 16,
    backgroundColor: '#FFFBE6',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 12,
  },
  editorContextBlock: {
    paddingBottom: 4,
  },
  editorContextText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(92, 64, 51, 0.22)',
    marginVertical: 8,
  },
  editorInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 26,
    fontStyle: 'italic',
    fontWeight: '600',
    textAlignVertical: 'top',
    paddingTop: 6,
  },
  editorCount: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 6,
  },
});
