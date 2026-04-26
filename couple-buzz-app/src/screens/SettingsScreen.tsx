import React, { useState, useCallback, useRef } from 'react';
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
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { api, ImportantDate } from '../services/api';
import { storage } from '../utils/storage';
import WeeklyReportCard from '../components/WeeklyReportCard';
import StatsCard from '../components/StatsCard';

type Reloadable = { reload: () => Promise<void> };

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
  const [partnerRemark, setPartnerRemark] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [originalTimezone, setOriginalTimezone] = useState('');
  const [originalPartnerTz, setOriginalPartnerTz] = useState('');
  const [originalPartnerRemark, setOriginalPartnerRemark] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalTarget, setModalTarget] = useState<ModalTarget>(null);
  const [userId, setUserId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [dates, setDates] = useState<ImportantDate[]>([]);
  const [newDateTitle, setNewDateTitle] = useState('');
  const [newDateRecurring, setNewDateRecurring] = useState(false);
  const [showAddDate, setShowAddDate] = useState(false);

  const loadDates = useCallback(async () => {
    try {
      const result = await api.getDates();
      setDates(result.dates);
    } catch {}
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const status = await api.getStatus();
      setName(status.name);
      setTimezone(status.timezone);
      setPartnerTimezone(status.partner_timezone);
      setPartnerRemark(status.partner_remark || '');
      setOriginalName(status.name);
      setOriginalTimezone(status.timezone);
      setOriginalPartnerTz(status.partner_timezone);
      setOriginalPartnerRemark(status.partner_remark || '');
      await storage.setPartnerRemark(status.partner_remark || '');
      if (status.partner_id) {
        setPartnerId(status.partner_id);
        await storage.setPartnerId(status.partner_id);
      }
    } catch {
      const localName = await storage.getUserName();
      if (localName) setName(localName);
      const cachedRemark = await storage.getPartnerRemark();
      if (cachedRemark) {
        setPartnerRemark(cachedRemark);
        setOriginalPartnerRemark(cachedRemark);
      }
      const cachedPid = await storage.getPartnerId();
      if (cachedPid) setPartnerId(cachedPid);
    }
    const id = await storage.getUserId();
    if (id) setUserId(id);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const weeklyRef = useRef<Reloadable>(null);
  const statsRef = useRef<Reloadable>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadStatus(),
        loadDates(),
        weeklyRef.current?.reload(),
        statsRef.current?.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus, loadDates]);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
      loadDates();
    }, [loadStatus, loadDates])
  );

  const hasNameChange = name.trim() !== originalName && name.trim().length > 0;

  const persistProfile = async (next: { name?: string; timezone?: string; partnerTimezone?: string; partnerRemark?: string }): Promise<void> => {
    const result = await api.updateProfile(
      next.name ?? (name.trim() || originalName),
      next.timezone ?? timezone,
      next.partnerTimezone ?? partnerTimezone,
      next.partnerRemark ?? partnerRemark,
    );
    await Promise.all([
      storage.setUserName(result.name),
      storage.setTimezone(result.timezone),
      storage.setPartnerTimezone(result.partner_timezone),
      storage.setPartnerRemark(result.partner_remark),
    ]);
    setName(result.name);
    setTimezone(result.timezone);
    setPartnerTimezone(result.partner_timezone);
    setPartnerRemark(result.partner_remark);
    setOriginalName(result.name);
    setOriginalTimezone(result.timezone);
    setOriginalPartnerTz(result.partner_timezone);
    setOriginalPartnerRemark(result.partner_remark);
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('', '昵称不能为空');
      return;
    }
    setSaving(true);
    try {
      await persistProfile({ name: trimmed });
      Alert.alert('', '昵称已保存');
    } catch (error: any) {
      Alert.alert('保存失败', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePickTimezone = async (tz: string) => {
    const target = modalTarget;
    setModalTarget(null);
    if (!target) return;
    try {
      if (target === 'my') {
        await persistProfile({ timezone: tz });
      } else {
        await persistProfile({ partnerTimezone: tz });
      }
    } catch (error: any) {
      Alert.alert('保存失败', error.message);
    }
  };

  const handleSaveRemark = async () => {
    setSavingRemark(true);
    try {
      await persistProfile({ partnerRemark: partnerRemark.trim() });
      Alert.alert('', '备注已保存');
    } catch (error: any) {
      Alert.alert('保存失败', error.message);
    } finally {
      setSavingRemark(false);
    }
  };

  // Year/month/day state for the new date picker. Default to today; the user
  // changes any field via a modal scrolling list (better than a calendar grid
  // for picking dates decades ago — e.g. anniversaries, parents' birthdays).
  const todayInit = new Date();
  const [pickYear, setPickYear] = useState(todayInit.getFullYear());
  const [pickMonth, setPickMonth] = useState(todayInit.getMonth() + 1);
  const [pickDay, setPickDay] = useState(todayInit.getDate());
  const [datePart, setDatePart] = useState<'year' | 'month' | 'day' | null>(null);

  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
  const clampDay = (y: number, m: number, d: number) => Math.min(d, daysInMonth(y, m));

  const composedDate = `${pickYear}-${String(pickMonth).padStart(2, '0')}-${String(clampDay(pickYear, pickMonth, pickDay)).padStart(2, '0')}`;

  const handleAddDate = async () => {
    const title = newDateTitle.trim();
    if (!title) { Alert.alert('', '请输入标题'); return; }

    try {
      await api.createDate(title, composedDate, newDateRecurring);
      setNewDateTitle('');
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
    <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.kiss}
        />
      }
    >
      {userId ? (
        <View style={styles.coupleIdRow}>
          <View style={styles.idCard}>
            <Text style={styles.idLabel}>我的 ID</Text>
            <Text style={styles.idValue}>{userId}</Text>
          </View>
          <View style={styles.idLink}>
            <Text style={styles.idLinkHeart}>💞</Text>
            <Text style={styles.idLinkArrow}>⇄</Text>
          </View>
          <View style={styles.idCard}>
            <Text style={styles.idLabel}>ta 的 ID</Text>
            <Text style={[styles.idValue, !partnerId && styles.idValueEmpty]}>
              {partnerId || '— —'}
            </Text>
          </View>
        </View>
      ) : null}

      <WeeklyReportCard ref={weeklyRef} />
      <StatsCard ref={statsRef} />

      <Text style={styles.sectionTitle}>昵称</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={20}
        placeholder="输入昵称"
        placeholderTextColor={COLORS.textLight}
      />
      <TouchableOpacity
        style={[styles.saveButton, (!hasNameChange || saving) && styles.saveButtonDisabled]}
        onPress={handleSaveName}
        disabled={!hasNameChange || saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? '保存中...' : '保存昵称'}
        </Text>
      </TouchableOpacity>

      {partnerId ? (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 40 }]}>对 ta 的备注</Text>
          <TextInput
            style={styles.input}
            value={partnerRemark}
            onChangeText={setPartnerRemark}
            placeholder="给 ta 起个昵称（仅自己可见）"
            placeholderTextColor={COLORS.textLight}
            maxLength={20}
          />
          <TouchableOpacity
            style={[
              styles.remarkSaveBtn,
              (partnerRemark.trim() === originalPartnerRemark.trim() || savingRemark) && styles.saveButtonDisabled,
            ]}
            onPress={handleSaveRemark}
            disabled={partnerRemark.trim() === originalPartnerRemark.trim() || savingRemark}
          >
            <Text style={styles.remarkSaveText}>
              {savingRemark ? '保存中...' : '保存备注'}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}

      <Text style={[styles.sectionTitle, { marginTop: 40 }]}>时区</Text>
      <View style={styles.tzPairRow}>
        <TouchableOpacity style={styles.tzCard} onPress={() => setModalTarget('my')}>
          <Text style={styles.tzCardLabel}>我的时区</Text>
          <Text style={styles.tzCardValue} numberOfLines={1}>{formatTzDisplay(timezone)}</Text>
        </TouchableOpacity>
        <View style={styles.tzPairLink}>
          <Text style={styles.tzPairLinkIcon}>🕐</Text>
        </View>
        <TouchableOpacity style={styles.tzCard} onPress={() => setModalTarget('partner')}>
          <Text style={styles.tzCardLabel}>ta 的时区</Text>
          <Text style={styles.tzCardValue} numberOfLines={1}>{formatTzDisplay(partnerTimezone)}</Text>
        </TouchableOpacity>
      </View>

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
          <View style={styles.dpRow}>
            <TouchableOpacity style={styles.dpField} onPress={() => setDatePart('year')}>
              <Text style={styles.dpLabel}>年</Text>
              <Text style={styles.dpValue}>{pickYear}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dpField} onPress={() => setDatePart('month')}>
              <Text style={styles.dpLabel}>月</Text>
              <Text style={styles.dpValue}>{pickMonth}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dpField} onPress={() => setDatePart('day')}>
              <Text style={styles.dpLabel}>日</Text>
              <Text style={styles.dpValue}>{clampDay(pickYear, pickMonth, pickDay)}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.calSelected}>已选: {composedDate}</Text>
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
                  onPress={() => handlePickTimezone(item.value)}
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

      <Modal visible={datePart !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {datePart === 'year' ? '选择年份' : datePart === 'month' ? '选择月份' : '选择日'}
              </Text>
              <TouchableOpacity onPress={() => setDatePart(null)}>
                <Text style={styles.modalClose}>完成</Text>
              </TouchableOpacity>
            </View>
            {datePart && (
              <FlatList
                data={(() => {
                  if (datePart === 'year') {
                    const cur = new Date().getFullYear();
                    // 1900 → cur+10 covers grandparent birthdays through far-future capsules
                    return Array.from({ length: cur + 10 - 1900 + 1 }, (_, i) => 1900 + i).reverse();
                  }
                  if (datePart === 'month') {
                    return Array.from({ length: 12 }, (_, i) => i + 1);
                  }
                  return Array.from({ length: daysInMonth(pickYear, pickMonth) }, (_, i) => i + 1);
                })()}
                keyExtractor={(item) => String(item)}
                initialScrollIndex={(() => {
                  if (datePart === 'year') {
                    const cur = new Date().getFullYear();
                    return Math.max(0, (cur + 10) - pickYear);
                  }
                  if (datePart === 'month') return Math.max(0, pickMonth - 1);
                  return Math.max(0, clampDay(pickYear, pickMonth, pickDay) - 1);
                })()}
                getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
                renderItem={({ item }) => {
                  const active = datePart === 'year'
                    ? item === pickYear
                    : datePart === 'month'
                      ? item === pickMonth
                      : item === clampDay(pickYear, pickMonth, pickDay);
                  return (
                    <TouchableOpacity
                      style={[styles.tzItem, active && styles.tzItemActive]}
                      onPress={() => {
                        if (datePart === 'year') {
                          setPickYear(item);
                          setPickDay(d => clampDay(item, pickMonth, d));
                        } else if (datePart === 'month') {
                          setPickMonth(item);
                          setPickDay(d => clampDay(pickYear, item, d));
                        } else {
                          setPickDay(item);
                        }
                        setDatePart(null);
                      }}
                    >
                      <Text style={[styles.tzLabel, active && styles.tzLabelActive]}>
                        {item}{datePart === 'year' ? '年' : datePart === 'month' ? '月' : '日'}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
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
  coupleIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  idCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  idLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  idValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.kiss,
    letterSpacing: 2,
    marginTop: 4,
  },
  idValueEmpty: {
    color: COLORS.textLight,
    letterSpacing: 4,
  },
  idLink: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  idLinkHeart: {
    fontSize: 22,
  },
  idLinkArrow: {
    fontSize: 16,
    color: COLORS.kiss,
    fontWeight: '700',
    marginTop: -2,
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
  tzPairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tzCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  tzCardLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  tzCardValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 6,
  },
  tzPairLink: {
    paddingHorizontal: 4,
  },
  tzPairLinkIcon: {
    fontSize: 18,
  },
  dpRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  dpField: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  dpLabel: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  dpValue: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 4,
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
  remarkSaveBtn: {
    height: 44,
    backgroundColor: COLORS.kiss,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  remarkSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
});
