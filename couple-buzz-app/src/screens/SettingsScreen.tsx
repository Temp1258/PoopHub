import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { api, ImportantDate } from '../services/api';
import { storage } from '../utils/storage';

const TIMEZONES = [
  { value: 'Asia/Shanghai', label: '北京时间', offset: 'UTC+8' },
  { value: 'Asia/Hong_Kong', label: '香港', offset: 'UTC+8' },
  { value: 'Asia/Taipei', label: '台北', offset: 'UTC+8' },
  { value: 'Asia/Tokyo', label: '东京', offset: 'UTC+9' },
  { value: 'Asia/Seoul', label: '首尔', offset: 'UTC+9' },
  { value: 'Asia/Singapore', label: '新加坡', offset: 'UTC+8' },
  { value: 'America/New_York', label: '纽约', offset: 'UTC-5' },
  { value: 'America/Los_Angeles', label: '洛杉矶', offset: 'UTC-8' },
  { value: 'America/Chicago', label: '芝加哥', offset: 'UTC-6' },
  { value: 'Europe/London', label: '伦敦', offset: 'UTC+0' },
  { value: 'Europe/Paris', label: '巴黎', offset: 'UTC+1' },
  { value: 'Europe/Berlin', label: '柏林', offset: 'UTC+1' },
  { value: 'Australia/Sydney', label: '悉尼', offset: 'UTC+11' },
  { value: 'Pacific/Auckland', label: '奥克兰', offset: 'UTC+13' },
];

type ModalTarget = 'my' | 'partner' | null;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [partnerTimezone, setPartnerTimezone] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [originalTimezone, setOriginalTimezone] = useState('');
  const [originalPartnerTz, setOriginalPartnerTz] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalTarget, setModalTarget] = useState<ModalTarget>(null);
  const [userId, setUserId] = useState('');
  const [dates, setDates] = useState<ImportantDate[]>([]);
  const [newDateTitle, setNewDateTitle] = useState('');
  const [newDateValue, setNewDateValue] = useState('');
  const [newDateRecurring, setNewDateRecurring] = useState(false);
  const [showAddDate, setShowAddDate] = useState(false);

  const loadDates = useCallback(async () => {
    try {
      const result = await api.getDates();
      setDates(result.dates);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const status = await api.getStatus();
          setName(status.name);
          setTimezone(status.timezone);
          setPartnerTimezone(status.partner_timezone);
          setOriginalName(status.name);
          setOriginalTimezone(status.timezone);
          setOriginalPartnerTz(status.partner_timezone);
        } catch {
          const localName = await storage.getUserName();
          if (localName) setName(localName);
        }
        const id = await storage.getUserId();
        if (id) setUserId(id);
      })();
      loadDates();
    }, [loadDates])
  );

  const hasChanges = name.trim() !== originalName || timezone !== originalTimezone || partnerTimezone !== originalPartnerTz;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('', '昵称不能为空');
      return;
    }

    setSaving(true);
    try {
      const currentRemark = await storage.getPartnerRemark() || '';
      const result = await api.updateProfile(trimmed, timezone, partnerTimezone, currentRemark);
      await storage.setUserName(result.name);
      await storage.setTimezone(result.timezone);
      await storage.setPartnerTimezone(result.partner_timezone);
      setOriginalName(result.name);
      setOriginalTimezone(result.timezone);
      setOriginalPartnerTz(result.partner_timezone);
      setName(result.name);
      setTimezone(result.timezone);
      setPartnerTimezone(result.partner_timezone);
      Alert.alert('', '保存成功');
    } catch (error: any) {
      Alert.alert('保存失败', error.message);
    } finally {
      setSaving(false);
    }
  };

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);

  const handleAddDate = async () => {
    const title = newDateTitle.trim();
    if (!title) { Alert.alert('', '请输入标题'); return; }
    if (!newDateValue) { Alert.alert('', '请选择日期'); return; }

    try {
      await api.createDate(title, newDateValue, newDateRecurring);
      setNewDateTitle('');
      setNewDateValue('');
      setNewDateRecurring(false);
      setShowAddDate(false);
      loadDates();
    } catch (e: any) {
      Alert.alert('添加失败', e.message);
    }
  };

  const handlePinDate = async (id: number) => {
    try {
      await api.pinDate(id);
      loadDates();
    } catch {}
  };

  const handleDeleteDate = (id: number, title: string) => {
    Alert.alert('删除纪念日', `确定删除"${title}"？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          try { await api.deleteDate(id); loadDates(); } catch {}
        },
      },
    ]);
  };

  const formatTzDisplay = (tz: string) => {
    const found = TIMEZONES.find(t => t.value === tz);
    return found ? `${found.label} (${found.offset})` : tz;
  };

  const activeValue = modalTarget === 'my' ? timezone : partnerTimezone;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <Text style={styles.screenTitle}>设置</Text>

      {userId ? (
        <View style={styles.idRow}>
          <Text style={styles.idLabel}>我的 ID</Text>
          <Text style={styles.idValue}>{userId}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>昵称</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={20}
        placeholder="输入昵称"
        placeholderTextColor={COLORS.textLight}
      />

      <Text style={styles.sectionTitle}>我的时区</Text>
      <TouchableOpacity style={styles.timezoneButton} onPress={() => setModalTarget('my')}>
        <Text style={styles.timezoneText}>{formatTzDisplay(timezone)}</Text>
        <Text style={styles.timezoneArrow}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>对方时区</Text>
      <TouchableOpacity style={styles.timezoneButton} onPress={() => setModalTarget('partner')}>
        <Text style={styles.timezoneText}>{formatTzDisplay(partnerTimezone)}</Text>
        <Text style={styles.timezoneArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!hasChanges || saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? '保存中...' : '保存'}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 40 }]}>纪念日管理</Text>
      {dates.map((d) => (
        <View key={d.id} style={[styles.dateRow, d.pinned ? styles.dateRowPinned : null]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateTitle}>
              {d.pinned ? '📌 ' : ''}{d.title}{d.recurring ? ' 🔁' : ''}
            </Text>
            <Text style={styles.dateValue}>{d.date}</Text>
          </View>
          <TouchableOpacity
            style={[styles.pinBtn, d.pinned ? styles.pinBtnActive : undefined]}
            onPress={() => handlePinDate(d.id)}
          >
            <Text style={[styles.pinBtnText, d.pinned ? styles.pinBtnTextActive : undefined]}>
              {d.pinned ? '已置顶' : '置顶'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteDate(d.id, d.title)}>
            <Text style={styles.dateDelete}>删除</Text>
          </TouchableOpacity>
        </View>
      ))}

      {showAddDate ? (
        <View style={styles.addDateForm}>
          <TextInput
            style={styles.input}
            value={newDateTitle}
            onChangeText={setNewDateTitle}
            placeholder="标题（如：纪念日）"
            placeholderTextColor={COLORS.textLight}
            maxLength={20}
          />
          <View style={styles.calNav}>
            <TouchableOpacity onPress={() => { if (calMonth === 1) { setCalYear(calYear - 1); setCalMonth(12); } else setCalMonth(calMonth - 1); }}>
              <Text style={styles.calNavText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calNavLabel}>{calYear}年{calMonth}月</Text>
            <TouchableOpacity onPress={() => { if (calMonth === 12) { setCalYear(calYear + 1); setCalMonth(1); } else setCalMonth(calMonth + 1); }}>
              <Text style={styles.calNavText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.calWeekRow}>
            {['日','一','二','三','四','五','六'].map(d => (
              <Text key={d} style={styles.calWeekDay}>{d}</Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {Array.from({ length: new Date(calYear, calMonth - 1, 1).getDay() }, (_, i) => (
              <View key={`e${i}`} style={styles.calCell} />
            ))}
            {Array.from({ length: new Date(calYear, calMonth, 0).getDate() }, (_, i) => {
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = newDateValue === dateStr;
              return (
                <TouchableOpacity key={day} style={[styles.calCell, isSelected && styles.calCellSelected]} onPress={() => setNewDateValue(dateStr)}>
                  <Text style={[styles.calCellText, isSelected && styles.calCellTextSelected]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {newDateValue ? <Text style={styles.calSelected}>已选: {newDateValue}</Text> : null}
          <TouchableOpacity
            style={styles.recurringToggle}
            onPress={() => setNewDateRecurring(!newDateRecurring)}
          >
            <Text style={styles.recurringText}>
              {newDateRecurring ? '✅ 每年重复' : '⬜ 每年重复'}
            </Text>
          </TouchableOpacity>
          <View style={styles.addDateActions}>
            <TouchableOpacity style={styles.addDateCancel} onPress={() => setShowAddDate(false)}>
              <Text style={styles.addDateCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addDateConfirm} onPress={handleAddDate}>
              <Text style={styles.addDateConfirmText}>添加</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addDateButton} onPress={() => setShowAddDate(true)}>
          <Text style={styles.addDateButtonText}>+ 添加纪念日</Text>
        </TouchableOpacity>
      )}

      <Modal visible={modalTarget !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalTarget === 'my' ? '我的时区' : '对方时区'}
              </Text>
              <TouchableOpacity onPress={() => setModalTarget(null)}>
                <Text style={styles.modalClose}>完成</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={TIMEZONES}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.tzItem, item.value === activeValue && styles.tzItemActive]}
                  onPress={() => {
                    if (modalTarget === 'my') setTimezone(item.value);
                    else setPartnerTimezone(item.value);
                    setModalTarget(null);
                  }}
                >
                  <Text style={[styles.tzLabel, item.value === activeValue && styles.tzLabelActive]}>
                    {item.label}
                  </Text>
                  <Text style={styles.tzOffset}>{item.offset}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 32,
    textAlign: 'center',
  },
  idRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  idLabel: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  idValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.kiss,
    letterSpacing: 3,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    height: 52,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timezoneButton: {
    height: 52,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timezoneText: {
    fontSize: 16,
    color: COLORS.text,
  },
  timezoneArrow: {
    fontSize: 22,
    color: COLORS.textLight,
  },
  saveButton: {
    height: 52,
    backgroundColor: COLORS.kiss,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.kiss,
  },
  tzItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  tzItemActive: {
    backgroundColor: '#FFF0F3',
  },
  tzLabel: {
    fontSize: 16,
    color: COLORS.text,
  },
  tzLabelActive: {
    color: COLORS.kiss,
    fontWeight: '600',
  },
  tzOffset: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  dateTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  dateValue: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  pinBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
  },
  pinBtnActive: {
    backgroundColor: '#FFF0F3',
    borderColor: COLORS.kiss,
  },
  pinBtnText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  pinBtnTextActive: {
    color: COLORS.kiss,
    fontWeight: '600',
  },
  dateDelete: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  addDateForm: {
    marginTop: 8,
  },
  recurringToggle: {
    marginTop: 10,
    paddingVertical: 6,
  },
  recurringText: {
    fontSize: 15,
    color: COLORS.text,
  },
  addDateActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  addDateCancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addDateCancelText: {
    fontSize: 15,
    color: COLORS.textLight,
  },
  addDateConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.kiss,
  },
  addDateConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  dateRowPinned: {
    borderColor: COLORS.kiss,
    backgroundColor: '#FFF5F8',
  },
  calNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  calNavText: {
    fontSize: 24,
    color: COLORS.textLight,
    fontWeight: '300',
    paddingHorizontal: 8,
  },
  calNavLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    paddingVertical: 4,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calCellSelected: {
    backgroundColor: COLORS.kiss,
    borderRadius: 20,
  },
  calCellText: {
    fontSize: 14,
    color: COLORS.text,
  },
  calCellTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
  calSelected: {
    fontSize: 13,
    color: COLORS.kiss,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  addDateButton: {
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addDateButtonText: {
    fontSize: 15,
    color: COLORS.textLight,
  },
});
