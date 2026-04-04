import React, { useState, useCallback } from 'react';
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

export default function TimeCapsuleCard() {
  const [capsules, setCapsules] = useState<CapsuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [content, setContent] = useState('');
  const [unlockDate, setUnlockDate] = useState<Date | null>(null);
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
      await api.createCapsule(content.trim(), dateStr);
      setContent('');
      setUnlockDate(null);
      setShowCreate(false);
      setShowDatePicker(false);
      await load();
    } catch (e: any) {
      Alert.alert('', e.message);
    }
    setSubmitting(false);
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
  const daysUntil = nearest ? Math.ceil((new Date(nearest.unlock_date).getTime() - Date.now()) / 86400000) : 0;

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
            <Text style={styles.waitingText}>
              {waiting.length} 个胶囊等待中{nearest ? ` · 最近: ${daysUntil}天后` : ''}
            </Text>
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
}

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
  waitingText: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', paddingVertical: 8 },
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
