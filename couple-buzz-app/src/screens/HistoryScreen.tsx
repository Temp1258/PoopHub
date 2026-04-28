import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SectionList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS, ACTION_EMOJI, ACTION_CATEGORIES, ActionConfig } from '../constants';
import { api, HistoryAction } from '../services/api';
import { storage } from '../utils/storage';
import ActionRecord from '../components/ActionRecord';
import ReactionPicker from '../components/ReactionPicker';
import { SpringPressable } from '../components/SpringPressable';
import { useToolbarSlot } from '../utils/toolbarSlot';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const TOOLBAR_HEIGHT = 56;
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.5 - TOOLBAR_HEIGHT;
// Panel sits above the toolbar (`bottom: TOOLBAR_HEIGHT`). To fully hide it
// off-screen we need to translate by panel height + toolbar height; otherwise
// the dragHandle and the first row of the emoji grid peek out above the pill.
const PANEL_HIDDEN = PANEL_HEIGHT + TOOLBAR_HEIGHT;
const COLUMNS = 5;
const PANEL_PADDING_X = 12;
const COL_GAP = 8;
const ROW_GAP = 8;

const TIMEZONE_LABELS: Record<string, string> = {
  'Asia/Shanghai': '北京时间 (UTC+8)',
  'Asia/Hong_Kong': '香港 (UTC+8)',
  'Asia/Taipei': '台北 (UTC+8)',
  'Asia/Tokyo': '东京 (UTC+9)',
  'Asia/Seoul': '首尔 (UTC+9)',
  'Asia/Singapore': '新加坡 (UTC+8)',
  'America/New_York': '纽约 (UTC-5)',
  'America/Los_Angeles': '洛杉矶 (UTC-8)',
  'America/Chicago': '芝加哥 (UTC-6)',
  'Europe/London': '伦敦 (UTC+0)',
  'Europe/Paris': '巴黎 (UTC+1)',
  'Europe/Berlin': '柏林 (UTC+1)',
  'Australia/Sydney': '悉尼 (UTC+11)',
  'Pacific/Auckland': '奥克兰 (UTC+13)',
};

interface Section {
  title: string;
  data: HistoryAction[];
}

interface Props {
  partnerName: string;
  onLatestSeen?: (id: number) => void;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function CompactActionButton({ action, onPress }: { action: ActionConfig; onPress: (t: string) => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    onPress(action.type);
  }, [action.type, onPress, scaleAnim]);

  return (
    <Animated.View style={[styles.compactWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[styles.compactButton, { backgroundColor: action.color }]}
        onPress={handle}
        activeOpacity={0.7}
      >
        <Text style={styles.compactEmoji}>{action.emoji}</Text>
        <Text style={styles.compactLabel} numberOfLines={1}>{action.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function formatTimeInZone(dateStr: string, timezone: string): string {
  const date = new Date(dateStr + 'Z');
  try {
    return date.toLocaleTimeString('zh-CN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Asia/Shanghai';
  }
}

function groupByDate(actions: HistoryAction[]): Section[] {
  const groups: Record<string, HistoryAction[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  for (const action of actions) {
    const dateStr = action.created_at.slice(0, 10);
    let label: string;

    if (dateStr === todayStr) {
      label = '今天';
    } else if (dateStr === yesterdayStr) {
      label = '昨天';
    } else {
      label = dateStr;
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(action);
  }

  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

export default function HistoryScreen({ partnerName, onLatestSeen }: Props) {
  const insets = useSafeAreaInsets();
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState('');
  const [myTz, setMyTz] = useState(getDeviceTimezone());
  const [partnerTz, setPartnerTz] = useState('Asia/Shanghai');
  const [partnerRemark, setPartnerRemark] = useState('');
  const [selectedItem, setSelectedItem] = useState<HistoryAction | null>(null);
  const [editingRemark, setEditingRemark] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [reactions, setReactions] = useState<Record<number, HistoryAction[]>>({});
  const [reactionTarget, setReactionTarget] = useState<HistoryAction | null>(null);
  const listRef = useRef<SectionList>(null);
  const onLatestSeenRef = useRef(onLatestSeen);
  onLatestSeenRef.current = onLatestSeen;
  const prevLatestIdRef = useRef(0);

  // For saving remark we need current profile values
  const [myName, setMyName] = useState('');
  const [myTimezone, setMyTimezone] = useState('');
  const [myPartnerTz, setMyPartnerTz] = useState('');

  // Bottom emoji panel
  const [panelOpen, setPanelOpen] = useState(false);
  const panY = useRef(new Animated.Value(PANEL_HIDDEN)).current;
  const scrollYRef = useRef(0);
  const panelOpenRef = useRef(false);
  panelOpenRef.current = panelOpen;

  // Flip the React state immediately so the toolbar pill text ("先停停" ↔
  // "甩表情") swaps the moment the user taps. The spring still plays
  // out, but UI labels reflect intent, not animation completion.
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    Animated.spring(panY, { toValue: PANEL_HIDDEN, friction: 9, tension: 80, useNativeDriver: true }).start();
  }, [panY]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    Animated.spring(panY, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }).start();
  }, [panY]);

  const togglePanel = useCallback(() => {
    if (panelOpen) closePanel();
    else openPanel();
  }, [panelOpen, openPanel, closePanel]);

  // Toolbar pill: swipe up to peek/open the panel; tap is handled by inner TouchableOpacity.
  const toolbarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        !panelOpenRef.current && g.dy < -5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        setPanelOpen(true);
      },
      onPanResponderMove: (_, g) => {
        if (g.dy < 0) {
          const progress = Math.min(-g.dy, PANEL_HIDDEN);
          panY.setValue(PANEL_HIDDEN - progress);
        } else {
          panY.setValue(PANEL_HIDDEN);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -50 || g.vy < -0.5) {
          Animated.spring(panY, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }).start();
        } else {
          setPanelOpen(false);
          Animated.spring(panY, { toValue: PANEL_HIDDEN, friction: 9, tension: 80, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Push the toolbar pill into the App-level overlay slot so it renders ABOVE
  // the bottom bar (and its transparent gradient) instead of being veiled by
  // it. Slot is cleared when this tab loses focus or unmounts.
  const toolbarSlot = useToolbarSlot();
  const isFocused = useIsFocused();
  const { width: screenW } = useWindowDimensions();
  // All vector: bar height = pillH + paddings (each is a fraction of width),
  // plus bottom safe-area inset. Pill itself sits one "lift" above the bar.
  const barH = screenW * 0.175 + insets.bottom;
  const toolbarLift = screenW * 0.03;
  useEffect(() => {
    if (!isFocused) {
      toolbarSlot.set(null);
      return;
    }
    toolbarSlot.set(
      <View
        style={[styles.toolbarRow, { bottom: barH + toolbarLift }]}
        pointerEvents="box-none"
      >
        <View {...toolbarPanResponder.panHandlers}>
          <SpringPressable
            onPress={togglePanel}
            scaleTo={1.08}
            style={styles.toolbar}
          >
            <Text style={styles.toolbarIcon}>{panelOpen ? '▾' : '💌'}</Text>
            <Text style={styles.toolbarHint}>
              {panelOpen ? '先停停' : '甩表情'}
            </Text>
          </SpringPressable>
        </View>
      </View>
    );
    return () => toolbarSlot.set(null);
  }, [isFocused, panelOpen, togglePanel, toolbarPanResponder, toolbarSlot, barH, toolbarLift]);

  // Capture-phase responder: when ScrollView is at top and user drags down,
  // intercept the gesture from the ScrollView and use it to close the panel.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => {
        return scrollYRef.current <= 0 && g.dy > 8 && g.dy > Math.abs(g.dx);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) panY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          setPanelOpen(false);
          Animated.spring(panY, { toValue: PANEL_HIDDEN, friction: 9, tension: 80, useNativeDriver: true }).start();
        } else {
          Animated.spring(panY, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const scrollToBottom = useCallback(() => {
    if (sections.length === 0) return;
    setTimeout(() => {
      (listRef.current as any)?.getScrollResponder?.()?.scrollToEnd?.({ animated: false });
    }, 100);
  }, [sections]);

  const loadHistory = useCallback(async () => {
    try {
      const userId = await storage.getUserId();
      setMyUserId(userId || '');
      const savedTz = await storage.getTimezone();
      const savedPartnerTz = await storage.getPartnerTimezone();
      const savedRemark = await storage.getPartnerRemark();
      if (savedTz) setMyTz(savedTz);
      if (savedPartnerTz) setPartnerTz(savedPartnerTz);
      setPartnerRemark(savedRemark || '');

      const savedName = await storage.getUserName();
      setMyName(savedName || '');
      setMyTimezone(savedTz || getDeviceTimezone());
      setMyPartnerTz(savedPartnerTz || 'Asia/Shanghai');

      const result = await api.getHistory(100);
      const reversed = [...result.actions].reverse();
      setSections(groupByDate(reversed));
      setReactions(result.reactions || {});
      const latestId = reversed.length > 0 ? reversed[reversed.length - 1].id : 0;
      prevLatestIdRef.current = latestId;
      if (latestId > 0) onLatestSeenRef.current?.(latestId);
    } catch (error) {
      console.warn('Failed to load history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
      const interval = setInterval(async () => {
        try {
          const result = await api.getHistory(100);
          const reversed = [...result.actions].reverse();
          const latestId = reversed.length > 0 ? reversed[reversed.length - 1].id : 0;
          if (latestId !== prevLatestIdRef.current) {
            setSections(groupByDate(reversed));
            setReactions(result.reactions || {});
            prevLatestIdRef.current = latestId;
            if (latestId > 0) onLatestSeenRef.current?.(latestId);
          }
        } catch {}
      }, 5000);
      return () => clearInterval(interval);
    }, [loadHistory])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  const handleSendAction = useCallback(async (actionType: string) => {
    try {
      await api.sendAction(actionType);
      const result = await api.getHistory(100);
      const reversed = [...result.actions].reverse();
      setSections(groupByDate(reversed));
      setReactions(result.reactions || {});
      const latestId = reversed.length > 0 ? reversed[reversed.length - 1].id : 0;
      prevLatestIdRef.current = latestId;
      if (latestId > 0) onLatestSeenRef.current?.(latestId);
    } catch {}
  }, []);

  const handleItemPress = useCallback((item: HistoryAction) => {
    setSelectedItem(item);
    setEditingRemark(partnerRemark);
  }, [partnerRemark]);

  const handleReactionLongPress = useCallback((item: HistoryAction) => {
    if (item.user_id === myUserId) return;
    setSelectedItem(null);
    setReactionTarget(item);
  }, [myUserId]);

  const handleReactionSelect = useCallback(async (actionType: string) => {
    if (!reactionTarget) return;
    setReactionTarget(null);
    try {
      await api.sendReaction(reactionTarget.id, actionType);
      const result = await api.getHistory(100);
      const reversed = [...result.actions].reverse();
      setSections(groupByDate(reversed));
      setReactions(result.reactions || {});
    } catch {}
  }, [reactionTarget]);

  const handleSaveRemark = useCallback(async () => {
    setSavingRemark(true);
    try {
      const result = await api.updateProfile(myName, myTimezone, myPartnerTz, editingRemark);
      await storage.setPartnerRemark(result.partner_remark);
      setPartnerRemark(result.partner_remark);
      setSelectedItem(null);
    } catch (error: any) {
      Alert.alert('保存失败', error.message);
    } finally {
      setSavingRemark(false);
    }
  }, [myName, myTimezone, myPartnerTz, editingRemark]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.kiss} />
      </View>
    );
  }

  const selectedIsMine = selectedItem ? selectedItem.user_id === myUserId : false;
  const selectedTz = selectedItem
    ? (selectedIsMine ? myTz : partnerTz)
    : '';
  const selectedTzLabel = TIMEZONE_LABELS[selectedTz] || selectedTz;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>香宝聚集地 💕</Text>
        <Text style={styles.headerSubtitle}>与 {partnerName} 已连接</Text>
      </View>

      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        onContentSizeChange={scrollToBottom}
        renderItem={({ item }) => {
          const isMine = item.user_id === myUserId;
          const myTime = formatTimeInZone(item.created_at, myTz);
          const pTime = !isMine ? formatTimeInZone(item.created_at, partnerTz) : undefined;
          return (
            <ActionRecord
              userName={item.user_name}
              actionType={item.action_type}
              time={myTime}
              partnerTime={pTime}
              isMine={isMine}
              remark={!isMine ? partnerRemark : undefined}
              reactions={reactions[item.id]}
              onPress={() => handleItemPress(item)}
              onLongPress={!isMine ? () => handleReactionLongPress(item) : undefined}
            />
          );
        }}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.kiss} />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>还没有记录，快去按按钮吧～</Text>
          </View>
        }
        contentContainerStyle={
          sections.length === 0
            ? styles.emptyContainer
            : [styles.list, { paddingBottom: TOOLBAR_HEIGHT + 16 }]
        }
        stickySectionHeadersEnabled={false}
      />

      {panelOpen && (
        <Pressable
          style={[styles.tapToClose, { bottom: TOOLBAR_HEIGHT + PANEL_HEIGHT }]}
          onPress={closePanel}
        />
      )}

      {reactionTarget && (
        <ReactionPicker
          onSelect={handleReactionSelect}
          onClose={() => setReactionTarget(null)}
        />
      )}

      {selectedItem && (
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedItem(null)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1}>
            <View style={styles.modalBody}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>表情</Text>
                <Text style={styles.detailValue}>
                  {ACTION_EMOJI[selectedItem.action_type] || '?'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>昵称</Text>
                <Text style={styles.detailValue}>{selectedItem.user_name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>时区</Text>
                <Text style={styles.detailValue}>{selectedTzLabel}</Text>
              </View>

              {!selectedIsMine && (
                <>
                  <Text style={styles.remarkLabel}>备注</Text>
                  <TextInput
                    style={styles.remarkInput}
                    value={editingRemark}
                    onChangeText={setEditingRemark}
                    placeholder="给 ta 起个备注"
                    placeholderTextColor={COLORS.textLight}
                    maxLength={20}
                  />
                  <TouchableOpacity
                    style={[styles.saveButton, savingRemark && styles.saveButtonDisabled]}
                    onPress={handleSaveRemark}
                    disabled={savingRemark}
                  >
                    <Text style={styles.saveButtonText}>
                      {savingRemark ? '保存中...' : '保存备注'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <Animated.View
        pointerEvents={panelOpen ? 'auto' : 'none'}
        style={[styles.panel, { transform: [{ translateY: panY }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.dragHandleArea}>
          <View style={styles.dragHandle} />
        </View>
        <ScrollView
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
        >
          {ACTION_CATEGORIES.map((category) => {
            const rows = chunkArray(category.actions, COLUMNS);
            return (
              <View key={category.title} style={styles.categoryBlock}>
                <Text style={styles.categoryTitle}>{category.title}</Text>
                {rows.map((row, ri) => {
                  const isLast = ri === rows.length - 1;
                  const padTotal = COLUMNS - row.length;
                  // Center the last partial row when category opts in (e.g. "找你"),
                  // otherwise pad on the right so earlier rows stay left-aligned.
                  const padLeft = isLast && category.centerLastRow ? Math.floor(padTotal / 2) : 0;
                  const padRight = padTotal - padLeft;
                  return (
                    <View key={ri} style={styles.gridRow}>
                      {Array.from({ length: padLeft }).map((_, i) => (
                        <View key={`padL-${i}`} style={styles.gridCell} />
                      ))}
                      {row.map((action) => (
                        <View key={action.type} style={styles.gridCell}>
                          <CompactActionButton
                            action={action}
                            onPress={handleSendAction}
                          />
                        </View>
                      ))}
                      {Array.from({ length: padRight }).map((_, i) => (
                        <View key={`padR-${i}`} style={styles.gridCell} />
                      ))}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
  },
  list: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textLight,
  },
  tapToClose: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    zIndex: 50,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: TOOLBAR_HEIGHT,
    height: PANEL_HEIGHT,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    zIndex: 60,
  },
  dragHandleArea: {
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  panelContent: {
    paddingHorizontal: PANEL_PADDING_X,
    paddingBottom: 12,
  },
  categoryBlock: {
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 8,
    marginLeft: 2,
  },
  gridRow: {
    flexDirection: 'row',
    gap: COL_GAP,
    marginBottom: ROW_GAP,
  },
  gridCell: {
    flex: 1,
    aspectRatio: 1,
  },
  compactWrapper: {
    width: '100%',
    height: '100%',
  },
  compactButton: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactEmoji: {
    fontSize: 22,
    marginBottom: 2,
  },
  compactLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.text,
    paddingHorizontal: 2,
  },
  toolbarRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 70,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 26,
    backgroundColor: COLORS.kiss,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  toolbarIcon: {
    fontSize: 18,
  },
  toolbarHint: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    width: '72%',
    maxWidth: 300,
    paddingBottom: 16,
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {
    fontSize: 15,
    color: COLORS.textLight,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  remarkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 16,
    marginBottom: 8,
  },
  remarkInput: {
    height: 44,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  saveButton: {
    height: 44,
    backgroundColor: COLORS.kiss,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
});
