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
  Easing,
  Alert,
  Pressable,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';
import { api, StickyView, StickyTemp } from '../services/api';
import { subscribe } from '../services/socket';
import StickyNote, { INK_MINE } from '../components/StickyNote';
import { SpringPressable } from '../components/SpringPressable';

// Wood-color base: warm light pine, applied as a flat backgroundColor on the
// container. We dropped the earlier 5-stop horizontal stripe gradient — even
// though it added a hint of grain, the title region (above the title-edge
// fade) showed a different slice of the stripes than the fade band right
// below it, making the header feel disconnected from the wall. A single solid
// color reads as one continuous wood surface.
const WOOD_BASE = '#D4B68C';

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
  // Sticky id that should play the "drop onto wall" entry animation on its
  // next mount. Set right after a successful post; cleared after the
  // animation duration passes so the same id doesn't replay if React happens
  // to re-render the item.
  const [justPostedId, setJustPostedId] = useState<number | null>(null);
  // Sticky id currently mid tear-off. Set when the user confirms 撕下来; the
  // StickyNote runs a short rip animation, then the parent fires the API +
  // reload after the animation completes (otherwise the row vanishes from
  // state mid-animation and the visual cuts off).
  const [tearingOffId, setTearingOffId] = useState<number | null>(null);
  // Keyboard visibility — drives the 2-step "tap outside" semantic: first
  // tap dismisses the keyboard so the toolbar pills become reachable; only
  // when the keyboard is already down does a tap outside actually close the
  // editor (preserving the draft on server). Without this gate, tapping
  // outside while typing would close the editor before the user could see
  // the 贴上去 / 就这样 pill that's hidden behind the keyboard.
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timer that clears the just-posted entry-animation flag. Kept in a ref
  // so a fast modal close can cancel it on unmount instead of firing
  // setState into a void.
  const justPostedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timer that gates the actual delete API behind the tear animation. Same
  // unmount-safety reason as above.
  const tearOffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUnreadChangeRef = useRef(onUnreadChange);
  onUnreadChangeRef.current = onUnreadChange;
  // Last-tap tracker for sticky double-tap shortcut → 跟个帖. Records
  // {id, time} on each tap; if the next tap on the same sticky lands within
  // 300ms, we treat it as a double-tap and open the comment editor.
  const lastStickyTapRef = useRef<{ id: number; time: number } | null>(null);
  // Mirror of editor + editorText so reload() (which has [] deps for
  // stability) can read the latest values without stale-closure pitfalls.
  const editorRef = useRef<EditorMode>(null);
  const editorTextRef = useRef('');

  const reload = useCallback(async () => {
    try {
      const res = await api.getStickies();
      setWall(res.stickies);
      setMyTemp(res.my_temp);
      onUnreadChangeRef.current?.(res.stickies.some(s => s.unread));

      const currentEditor = editorRef.current;
      // If we're mid-comment on a sticky and the partner just tore it off,
      // close the editor with a heads-up. Without this guard the user would
      // hit "就这样" and bounce off a 404 — and lose whatever they'd typed.
      if (currentEditor?.kind === 'comment') {
        const stillExists = res.stickies.some(s => s.id === currentEditor.stickyId);
        if (!stillExists) {
          const draftText = editorTextRef.current.trim();
          setEditor(null);
          setEditorText('');
          const tail = draftText.length > 60 ? `${draftText.slice(0, 60)}…` : draftText;
          Alert.alert(
            '对方撕掉了这张便利贴',
            draftText
              ? `你刚才写的内容：\n\n${tail}\n\n（编辑器已关闭，复制走可以贴到新便利贴里）`
              : '编辑器已关闭。'
          );
          return; // skip auto-open below — there's no editor to resume
        }
      }

      // Auto-open editor only when there's NO active editor — otherwise we'd
      // overwrite whatever the user is currently typing. Initial open has
      // editor=null; subsequent reloads (socket sticky_update etc.) keep
      // the user's in-progress draft intact.
      if (!currentEditor) {
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
      }
    } catch {}
    setLoading(false);
  }, []);

  useImperativeHandle(ref, () => ({ reload }), [reload]);

  // Keep refs in sync so reload()'s closure can read the latest values
  // without re-creating the callback on every keystroke.
  editorRef.current = editor;
  editorTextRef.current = editorText;

  // Track keyboard visibility (iOS willShow/willHide are pre-animation, so
  // the state is correct by the time tap handlers run).
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Unmount cleanup — clear any pending timers so they don't fire setState
  // after the modal closes. React 18 silent-no-ops these, but explicit
  // cleanup is cheaper and signals intent.
  useEffect(() => () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (headerHideTimer.current) clearTimeout(headerHideTimer.current);
    if (justPostedClearTimer.current) clearTimeout(justPostedClearTimer.current);
    if (tearOffTimer.current) clearTimeout(tearOffTimer.current);
  }, []);

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

  // Soft dismiss — closes the editor visually but **keeps the temp on the
  // server**, so the next 来一帖 / 跟个帖 (or auto-reopen on tab focus)
  // restores whatever the user had typed. Used by tap-on-background, pageSheet
  // swipe-down, etc. Force-flushes a save before closing so the last few
  // characters typed within the autosave debounce window aren't lost.
  const closeEditorPreserveDraft = useCallback(() => {
    if (!editor) return;
    const current = editor;
    const text = editorText;
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (current.kind === 'new') {
      api.saveStickyTemp(text).catch(() => {});
    } else {
      api.saveStickyComment(current.stickyId, text).catch(() => {});
    }
    setEditor(null);
    setEditorText('');
  }, [editor, editorText]);

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
        const r = await api.postSticky(text);
        setMyTemp(null);
        // "Slap" haptic and prime the entry animation for the new sticky's
        // next mount. The thump fires now (mid-flight) so it lines up with
        // the user's expectation of pressing 贴上去 → felt impact → seeing
        // the sticky land.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setJustPostedId(r.sticky_id);
        // Clear the entry-anim flag well after the animation finishes so a
        // late re-render doesn't replay it. Stored in a ref so an unmount
        // before 1.2s elapses can clean it up.
        if (justPostedClearTimer.current) clearTimeout(justPostedClearTimer.current);
        justPostedClearTimer.current = setTimeout(() => setJustPostedId(null), 1200);
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

  // Single close path used by Modal's onRequestClose (= pageSheet swipe-down)
  // and the explicit 关闭 button. While writing, treats close as cancel
  // (deletes the temp) — matches the spec's "下拉关掉每日一帖墙" semantic.
  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    if (editor) cancelEditor();
    onClose();
  }, [editor, cancelEditor, onClose]);

  // ── Sticky tap → mark seen + select; double-tap → 跟个帖 ────────────────

  const DOUBLE_TAP_MS = 300;

  const handleStickyTap = useCallback(async (sticky: StickyView) => {
    const now = Date.now();
    const last = lastStickyTapRef.current;
    const isDoubleTap = !!last && last.id === sticky.id && now - last.time < DOUBLE_TAP_MS;

    if (isDoubleTap) {
      // Reset the tracker, drop the just-set selection (so the brief 1.04
      // scale doesn't linger when the editor opens), and dive straight into
      // the comment editor. Saves the user one tap on a frequent action.
      lastStickyTapRef.current = null;
      setSelectedId(null);
      startComment(sticky.id);
      return;
    }

    lastStickyTapRef.current = { id: sticky.id, time: now };

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
  }, [selectedId, wall, startComment]);

  // Central handler for any tap on the background (anywhere not a sticky,
  // pill, or the editor sheet itself). Two-step semantics so the user can
  // still reach the toolbar pills while typing:
  //   1. Keyboard up → just dismiss it (pills become reachable below)
  //   2. Keyboard down + editor open → close editor + preserve draft
  //   3. Editor closed + a sticky selected → deselect
  //   4. Otherwise → close the wall
  const onBackgroundTap = useCallback(() => {
    if (keyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    if (editor) {
      closeEditorPreserveDraft();
      return;
    }
    if (selectedId !== null) {
      setSelectedId(null);
      return;
    }
    handleClose();
  }, [keyboardVisible, editor, selectedId, closeEditorPreserveDraft, handleClose]);

  const selectedSticky = useMemo(
    () => (selectedId ? wall.find(s => s.id === selectedId) ?? null : null),
    [selectedId, wall]
  );

  // 撕下来 — confirm with a destructive alert before hard-deleting. The
  // sticky and all its committed blocks vanish for both sides immediately
  // via socket update; there is no trash recovery (per spec), so the
  // confirmation is the user's only safety net. The tear-off animation
  // plays first (~360ms), THEN the API + reload — without that delay the
  // row would vanish from state mid-animation and the visual would cut off.
  const handleTearOff = useCallback(() => {
    if (!selectedSticky) return;
    Alert.alert(
      '撕下来这张便利贴？',
      '撕下来后无法恢复，所有跟帖也会一起消失。',
      [
        { text: '不撕了', style: 'cancel' },
        {
          text: '撕下来',
          style: 'destructive',
          onPress: () => {
            const id = selectedSticky.id;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setTearingOffId(id);
            // Stored in a ref so an unmount before 360ms cleans it up.
            if (tearOffTimer.current) clearTimeout(tearOffTimer.current);
            tearOffTimer.current = setTimeout(async () => {
              try {
                await api.deleteSticky(id);
                setSelectedId(null);
                setTearingOffId(null);
                await reload();
              } catch (e: any) {
                setTearingOffId(null);
                Alert.alert('', e.message || '撕除失败');
              }
            }, 360);
          },
        },
      ]
    );
  }, [selectedSticky, reload]);

  // ── Render ─────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: StickyView }) => {
    const writingComment = editor?.kind === 'comment' && editor.stickyId === item.id;
    return (
      <View style={styles.itemRow}>
        <StickyNote
          sticky={item}
          selected={selectedId === item.id}
          writingComment={writingComment}
          justPosted={justPostedId === item.id}
          tearingOff={tearingOffId === item.id}
          onPress={() => handleStickyTap(item)}
        />
      </View>
    );
  }, [selectedId, editor, handleStickyTap, justPostedId, tearingOffId]);

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
              {submitting ? '保存中...' : editor.kind === 'new' ? '贴上去' : '就这样'}
            </Text>
          </SpringPressable>
        </View>
      );
    }
    if (selectedSticky) {
      return (
        <View style={styles.toolbar}>
          <SpringPressable onPress={handleTearOff} style={[styles.pill, styles.pillSecondary]}>
            <Text style={styles.pillSecondaryText}>撕下来</Text>
          </SpringPressable>
          <SpringPressable onPress={() => startComment(selectedSticky.id)} style={[styles.pill, styles.pillPrimary]}>
            <Text style={styles.pillPrimaryText}>跟个帖</Text>
          </SpringPressable>
        </View>
      );
    }
    // Browse mode — same two-pill layout as the editor states so the close
    // ("不看了") + start ("来一帖") buttons stay anchored at exactly the same
    // screen position as 不写了/贴上去 etc., not jumping around per state.
    return (
      <View style={styles.toolbar}>
        <SpringPressable onPress={handleClose} style={[styles.pill, styles.pillSecondary]}>
          <Text style={styles.pillSecondaryText}>不看了</Text>
        </SpringPressable>
        <SpringPressable onPress={startNewSticky} style={[styles.pill, styles.pillPrimary]}>
          <Text style={styles.pillPrimaryText}>来一帖</Text>
        </SpringPressable>
      </View>
    );
  };

  // Render the in-flight editor as a centered sticky-paper sheet over the
  // wall. Both 'new' and 'comment' modes use the same fresh-page UI — no
  // existing blocks shown — so a long thread doesn't crowd out the writing
  // surface ("更帖过多导致没有位置写新内容的问题"). Each commit appends a
  // new paper to the thread; the user only writes one block at a time and
  // doesn't need the running history in their face while writing it.
  const renderEditor = () => {
    if (!editor) return null;
    const inkColor = INK_MINE; // editor is always "me"
    // Both the dim backdrop and the editor paper itself dismiss the keyboard
    // on tap. The TextInput naturally captures its own touches, so tapping
    // the input keeps focus while tapping anywhere else (paper padding,
    // count text, dimmed area) hides the keyboard. This is the only way the
    // user can preview/post their note while the keyboard is up.
    return (
      <View
        style={[styles.editorOverlay, { top: insets.top + 48, bottom: insets.bottom + 96 }]}
        pointerEvents="box-none"
      >
        {/* Tap on the dim backdrop runs the same 2-step "background tap"
            handler used by the wall area: keyboard up → just dismiss it,
            keyboard down → soft-close the editor (preserving the draft on
            server so the user can resume next time they tap 来一帖/跟个帖). */}
        <Pressable style={styles.editorBackdrop} onPress={onBackgroundTap} />
        {/* Sheet is a centered, mid-sized sticky paper — not full-bleed, so
            the wall (and its wood texture) breathes around it. Tapping the
            sheet padding (the cream paper around the input) only dismisses
            the keyboard; it does NOT close the editor — the spec excludes
            the "帖子编辑区" itself from the close-on-tap target. */}
        <Pressable style={styles.editorSheet} onPress={Keyboard.dismiss}>
          <TextInput
            value={editorText}
            onChangeText={setEditorText}
            placeholder="点这里开始写..."
            placeholderTextColor="rgba(92, 64, 51, 0.4)"
            multiline
            maxLength={1000}
            style={[styles.editorInput, { color: inkColor }]}
          />
          <Text style={styles.editorCount}>{editorText.length} / 1000</Text>
        </Pressable>
      </View>
    );
  };

  // pageSheet (matches InboxScreen) is the iOS native sheet modal: native
  // slide-up + native swipe-down dismiss + a small top gap that reveals the
  // tab beneath. onRequestClose fires for both the system swipe and any
  // explicit close call, so we route both through handleClose to honor the
  // "下拉关掉墙 = 删 temp（如在写）" semantic in one place.
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* One outer Pressable wraps both the title row and the wall area
            so tapping ANYWHERE on the modal that isn't a sticky / pill /
            editor sheet routes through the same `onBackgroundTap` handler.
            That gives the user a consistent "tap outside" semantic across
            the whole screen (header, wall, toolbar empty area), and lets
            the editor close softly while preserving the draft. */}
        <Pressable style={styles.wallTapTarget} onPress={onBackgroundTap}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>📝 每日一帖</Text>
          </View>
          <View style={styles.wallArea}>
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
              contentContainerStyle={{ paddingTop: 64, paddingBottom: 140 + insets.bottom }}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
            />
          )}
          </View>
        </Pressable>

        {/* Title-edge soft fade — anchored right at the title's bottom edge so
            the blur reads as continuous with the title instead of detached.
            Multi-stop gradient (solid → half → transparent) gives a softer
            dissolve than a single 2-stop ramp; rendered after the wall so it
            sits visually above the stickies as they scroll under it. */}
        <LinearGradient
          colors={[
            WOOD_BASE,
            WOOD_BASE,
            'rgba(212, 182, 140, 0.6)',
            'rgba(212, 182, 140, 0.2)',
            'rgba(212, 182, 140, 0)',
          ]}
          locations={[0, 0.15, 0.5, 0.8, 1]}
          pointerEvents="none"
          style={styles.titleEdgeFade}
        />

        {/* Floating date label rendered AFTER the FlatList + title-edge fade
            so scrolling stickies pass behind everything. Apple-Photos style:
            pinned to upper-left, fades out 1.4s after the user stops
            scrolling. */}
        {!!headerLabel && (
          <Animated.View
            pointerEvents="none"
            style={[styles.floatingDate, { opacity: headerOpacity }]}
          >
            <Text style={styles.floatingDateText}>{headerLabel}</Text>
          </Animated.View>
        )}

        {renderEditor()}

        <View style={[styles.toolbarSlot, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
          {renderToolbar()}
        </View>
      </View>
    </Modal>
  );
});

export default StickyWallScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WOOD_BASE,
  },
  // Title centered in the header. The close affordance moved to a "不看了"
  // pill in the bottom toolbar so the header is title-only now.
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    minHeight: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3D2A19',
    textAlign: 'center',
    // Subtle dark drop-shadow softens the text edges against the solid wood
    // bg without coloring outside the lines.
    textShadowColor: 'rgba(60, 40, 22, 0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Outer Pressable that owns "tap outside" semantics for the whole modal
  // body (header + wall area). flex:1 fills the space between the modal's
  // top safe-area and the absolute-positioned toolbar at the bottom.
  wallTapTarget: {
    flex: 1,
  },
  wallArea: {
    flex: 1,
  },
  // Soft wood-to-transparent fade anchored right under the title so the blur
  // reads as a continuous extension of the title boundary. Header is ~48pt
  // tall (paddingTop 14 + ~24pt title + paddingBottom 10), so top:36 sits at
  // the bottom of the title text; height 70 gives a long, gentle dissolve.
  titleEdgeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 36,
    height: 70,
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
    top: 56,
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

  // Sits below the header row and above the toolbar so the title + 完成
  // stay reachable while the editor is open. The overlay centers its sheet
  // child so the paper floats in the middle of the wall instead of filling
  // edge-to-edge.
  editorOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Backdrop is invisible — the wall stays fully visible behind the editor.
  // The Pressable still mounts so taps outside the TextInput dismiss the
  // keyboard. To prevent stickies from being tappable through the backdrop
  // while writing, the backdrop blocks pointer events of the wall items.
  editorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  // Mid-sized sticky paper, not full-bleed. Soft 18pt radius + subtle shadow
  // keeps the "handwritten note" feel; held upright (no tilt) so the writing
  // surface reads cleanly while you type.
  editorSheet: {
    width: '82%',
    minHeight: 260,
    maxHeight: '94%',
    backgroundColor: '#FFFBE6',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10,
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
