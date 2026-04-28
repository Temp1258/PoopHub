import React, { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
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
import { storage } from '../utils/storage';
import SealAnimation from './SealAnimation';
import EnvelopeOpenAnimation from './EnvelopeOpenAnimation';
import { SpringPressable } from './SpringPressable';

type Visibility = 'self' | 'partner';

interface RevealMeta {
  from: string;
  to: string;
  date: string;
  kindLabel: string;
  content: string;
}

const TimeCapsuleCard = forwardRef<{ reload: () => Promise<void> }>((_props, ref) => {
  const [capsules, setCapsules] = useState<CapsuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [content, setContent] = useState('');
  const [unlockDate, setUnlockDate] = useState<Date | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('partner');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Seal animation state — runs after a successful create.
  const [sealing, setSealing] = useState(false);
  const [sealedPreview, setSealedPreview] = useState('');
  // Open animation state — runs when an unlockable capsule is tapped.
  const [revealAnim, setRevealAnim] = useState<RevealMeta | null>(null);
  const [names, setNames] = useState<{ me: string; ta: string }>({ me: '我', ta: 'ta' });

  useEffect(() => {
    (async () => {
      const [myName, remark, partnerName] = await Promise.all([
        storage.getUserName(),
        storage.getPartnerRemark(),
        storage.getPartnerName(),
      ]);
      setNames({
        me: myName || '我',
        ta: (remark && remark.trim()) || partnerName || 'ta',
      });
    })();
  }, []);

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
    const text = content.trim();
    setSubmitting(true);
    try {
      await api.createCapsule(text, dateStr, visibility);
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert('', e.message);
      return;
    }
    setSubmitting(false);
    setSealedPreview(text);
    setContent('');
    setUnlockDate(null);
    setVisibility('partner');
    setShowCreate(false);
    setShowDatePicker(false);
    setSealing(true);
  };

  const handleSealComplete = async () => {
    setSealing(false);
    setSealedPreview('');
    await load();
  };

  // Day+hour granularity matches the backend push body the partner gets,
  // so the UI stays consistent with the notification text.
  const formatCountdown = (dateStr: string): string => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const target = new Date(y, mo - 1, d, 0, 0, 0);
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return '已可开启';
    const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days === 0) return `${hours}小时`;
    return `${days}天${hours}小时`;
  };

  const handleOpen = async (capsule: CapsuleItem) => {
    try {
      const result = await api.openCapsule(capsule.id);
      let from = names.me;
      let to = names.ta;
      let kindLabel = '择日达';
      if (capsule.author === 'me') {
        if (capsule.visibility === 'self') {
          from = names.me; to = names.me;
          kindLabel = '择日达 · 给自己';
        } else {
          from = names.me; to = names.ta;
          kindLabel = '择日达 · 给 ta';
        }
      } else {
        from = names.ta; to = names.me;
        kindLabel = '择日达 · 来自 ta';
      }
      setRevealAnim({
        from,
        to,
        date: capsule.unlock_date,
        kindLabel,
        content: result.content,
      });
      // Refresh in background so the card moves out of "unlockable" state
      // once the open modal closes.
      load();
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

  return (
    <View style={styles.card}>
      <Text style={styles.header}>择日达 💌</Text>

      {sealing ? (
        <SealAnimation preview={sealedPreview} onComplete={handleSealComplete} />
      ) : (
        <>
          {capsules.length === 0 && !showCreate ? (
            <Text style={styles.empty}>还没有信，写一封给未来的吧</Text>
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
                          信件将在 {formatCountdown(c.unlock_date)}后送达
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
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
            <View style={styles.composePillContainer}>
              <SpringPressable
                onPress={() => setShowCreate(true)}
                scaleTo={1.08}
                style={styles.composePill}
              >
                <Text style={styles.composePillText}>写信</Text>
              </SpringPressable>
            </View>
          )}
        </>
      )}

      <EnvelopeOpenAnimation
        visible={!!revealAnim}
        kindLabel={revealAnim?.kindLabel}
        from={revealAnim?.from}
        to={revealAnim?.to}
        date={revealAnim?.date}
        content={revealAnim?.content ?? ''}
        onClose={() => setRevealAnim(null)}
      />
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
  composePillContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  composePill: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 26,
    backgroundColor: COLORS.kiss,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  composePillText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
