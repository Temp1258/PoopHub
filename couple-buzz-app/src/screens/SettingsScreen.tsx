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
import { api } from '../services/api';
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
      })();
    }, [])
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
});
