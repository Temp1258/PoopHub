import React, { useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, ACTION_EMOJI } from '../constants';
import { api, HistoryAction } from '../services/api';
import { storage } from '../utils/storage';
import ActionRecord from '../components/ActionRecord';
import ReactionPicker from '../components/ReactionPicker';

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

export default function HistoryScreen({ onLatestSeen }: { onLatestSeen?: (id: number) => void }) {
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

      // Load current profile for remark saving
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

  const handleItemPress = useCallback((item: HistoryAction) => {
    setSelectedItem(item);
    setEditingRemark(partnerRemark);
  }, [partnerRemark]);

  const handleReactionLongPress = useCallback((item: HistoryAction) => {
    if (item.user_id === myUserId) return;
    setSelectedItem(null); // Close detail modal if open
    setReactionTarget(item);
  }, [myUserId]);

  const handleReactionSelect = useCallback(async (actionType: string) => {
    if (!reactionTarget) return;
    setReactionTarget(null);
    try {
      await api.sendReaction(reactionTarget.id, actionType);
      // Refresh to show the reaction
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
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.list}
        stickySectionHeadersEnabled={false}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  list: {
    paddingTop: 16,
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
