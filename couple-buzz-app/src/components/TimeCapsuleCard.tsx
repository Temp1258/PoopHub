import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { COLORS } from '../constants';
import { api, CapsuleItem } from '../services/api';

type Visibility = 'self' | 'partner';

const TimeCapsuleCard = forwardRef<{ reload: () => Promise<void> }>((_props, ref) => {
  const [capsules, setCapsules] = useState<CapsuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [content, setContent] = useState('');
  const [unlockDate, setUnlockDate] = useState<Date | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('partner');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getCapsules();
      setCapsules(result.capsules);
    } catch {}
    setLoading(false);
  }, []);

  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setUnlockDate(selectedDate);
  };

  const formatDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleCreate = async () => {
    if (!content.trim() || !unlockDate) return;
    const dateStr = formatDate(unlockDate);
    setSubmitting(true);
    try {
      await api.createCapsule(content.trim(), dateStr, visibility);
      setContent('');
      setUnlockDate(null);
      setVisibility('partner');
      setShowCreate(false);
      setShowDatePicker(false);
      await load();
    } catch (e: any) {
      Alert.alert('', e.message);
    }
    setSubmitting(false);
  };

  const formatCountdown = (dateStr: string): string => {
    // Same day+hour granularity as the backend's push body so the UI matches
    // what the partner sees in their notification.
    const [y, mo, d] = dateStr.split('-').map(Number);
    const target = new Date(y, mo - 1, d, 0, 0, 0);
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return '已可开启';
    const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days === 0) return `${hours}小时后`;
    return `${days}天${hours}小时后`;
  };

  const handleOpen = async (capsule: CapsuleItem) => {
    try {
      const result = await api.openCapsule(capsule.id);
      Alert.alert('💌 时间胶囊', result.content);
      await load();
    } catch (e: any) {
      Alert.alert('', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  const waiting = capsules.filter(c => !c.opened_at && !c.is_unlockable);
  const unlockable = capsules.filter(c => c.is_unlockable);
  const opened = capsules.filter(c => c.opened_at);
  const nearest = waiting.length > 0 ? waiting[0] : null;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>时间胶囊 💌</Text>

      {capsules.length === 0 && !showCreate ? (
        <Text style={styles.empty}>还没有胶囊，写一封给未来的信吧</Text>
      ) : (
        <View>
          {unlockable.length > 0 && (
            <View style={styles.section}>
              {unlockable.map(c => (
                <TouchableOpacity key={c.id} style={styles.unlockableItem} onPress={() => handleOpen(c)}>
                  <Text style={styles.unlockableEmoji}>💌</Text>
                  <Text style={styles.unlockableText}>来自{c.author === 'me' ? '我' : 'ta'}的信 · 点击开启</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {waiting.length > 0 && (
            <View style={styles.waitingBlock}>
              <Text style={styles.waitingText}>
                {waiting.length} 个胶囊等待中{nearest ? ` · 最近: ${formatCountdown(nearest.unlock_date)}` : ''}
              </Text>
              {waiting.map(c => (
                <View key={c.id} style={styles.waitingItem}>
                  <Text style={styles.waitingItemEmoji}>
                    {c.author === 'me' ? (c.visibility === 'self' ? '🔒' : '💌') : '🎁'}
                  </Text>
                  <View style={styles.waitingItemBody}>
                    <Text style={styles.waitingItemTitle}>
                      {c.author === 'me'
                        ? (c.visibility === 'self' ? '给自己的信' : '给 ta 的信')
                        : 'ta 埋下的信'}
                    </Text>
                    <Text style={styles.waitingItemSub}>
                      {c.unlock_date} · {formatCountdown(c.unlock_date)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {expanded && opened.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>已开启</Text>
              {opened.map(c => (
                <View key={c.id} style={styles.openedItem}>
                  <Text style={styles.openedDate}>{c.unlock_date} · {c.author === 'me' ? '我' : 'ta'}</Text>
                  <Text style={styles.openedContent}>{c.content}</Text>
                </View>
              ))}
            </View>
          )}

          {opened.length > 0 && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.toggleLink}>
              <Text style={styles.toggleText}>{expanded ? '收起' : `查看已开启 (${opened.length})`}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {showCreate ? (
        <View style={styles.createForm}>
          <TextInput
            style={styles.input}
            value={content}
            onChangeText={setContent}
            placeholder="写给未来的话..."
            placeholderTextColor={COLORS.textLight}
            maxLength={1000}
            multiline
          />
          <View style={styles.visRow}>
            <TouchableOpacity
              style={[styles.visChip, visibility === 'self' && styles.visChipActive]}
              onPress={() => setVisibility('self')}
            >
              <Text style={[styles.visEmoji]}>🔒</Text>
              <Text style={[styles.visLabel, visibility === 'self' && styles.visLabelActive]}>给自己看</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.visChip, visibility === 'partner' && styles.visChipActive]}
              onPress={() => setVisibility('partner')}
            >
              <Text style={[styles.visEmoji]}>💌</Text>
              <Text style={[styles.visLabel, visibility === 'partner' && styles.visLabelActive]}>给对方看</Text>
            </TouchableOpacity>
          </View>
          {visibility === 'partner' && (
            <Text style={styles.visHint}>
              ta 会立刻收到提醒：你埋下了一个胶囊 + 开启倒计时
            </Text>
          )}
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={[styles.dateButtonText, !unlockDate && styles.dateButtonPlaceholder]}>
              {unlockDate ? `开启日期: ${formatDate(unlockDate)}` : '选择开启日期'}
            </Text>
            <Text style={styles.dateButtonArrow}>📅</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={unlockDate || tomorrow}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
              minimumDate={tomorrow}
              onChange={handleDateChange}
              locale="zh-CN"
            />
          )}
          <View style={styles.createActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => {
              setShowCreate(false);
              setShowDatePicker(false);
              setUnlockDate(null);
              setContent('');
              setVisibility('partner');
            }}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, (!content.trim() || !unlockDate || submitting) && styles.submitDisabled]}
              onPress={handleCreate}
              disabled={!content.trim() || !unlockDate || submitting}
            >
              <Text style={styles.submitText}>{submitting ? '...' : '封存 🔒'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.addText}>+ 创建新胶囊</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default TimeCapsuleCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 12,
  },
  empty: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingVertical: 8,
  },
  section: { gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: COLORS.textLight },
  unlockableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F3',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.kiss,
  },
  unlockableEmoji: { fontSize: 24 },
  unlockableText: { fontSize: 15, fontWeight: '500', color: COLORS.kiss },
  waitingBlock: { gap: 6 },
  waitingText: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', paddingVertical: 8 },
  waitingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  waitingItemEmoji: { fontSize: 20 },
  waitingItemBody: { flex: 1 },
  waitingItemTitle: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  waitingItemSub: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  visRow: { flexDirection: 'row', gap: 8 },
  visChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  visChipActive: {
    borderColor: COLORS.kiss,
    backgroundColor: '#FFF0F3',
  },
  visEmoji: { fontSize: 16 },
  visLabel: { fontSize: 14, color: COLORS.textLight, fontWeight: '500' },
  visLabelActive: { color: COLORS.kiss, fontWeight: '600' },
  visHint: {
    fontSize: 12,
    color: COLORS.kiss,
    textAlign: 'center',
    marginTop: -4,
  },
  openedItem: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  openedDate: { fontSize: 11, color: COLORS.textLight, marginBottom: 4 },
  openedContent: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  toggleLink: { alignItems: 'center', marginTop: 4 },
  toggleText: { fontSize: 13, color: COLORS.textLight },
  createForm: { marginTop: 8, gap: 10 },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateButton: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateButtonText: {
    fontSize: 16,
    color: COLORS.text,
  },
  dateButtonPlaceholder: {
    color: COLORS.textLight,
  },
  dateButtonArrow: {
    fontSize: 18,
  },
  createActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: { fontSize: 15, color: COLORS.textLight },
  submitBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.kiss,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  addBtn: {
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addText: { fontSize: 14, color: COLORS.textLight },
});
