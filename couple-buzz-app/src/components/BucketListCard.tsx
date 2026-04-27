import React, { useState, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { api, BucketItemResponse } from '../services/api';
import { storage } from '../utils/storage';

// Brand colors per side: kiss-pink for the current user, soft blue for the
// partner. Used as a 4px left bar + chip on each item so we can tell at a
// glance who added a wish.
const MINE_COLOR = COLORS.kiss;
const PARTNER_COLOR = '#7AB8D6';

const CATEGORIES = [
  { value: null, label: '全部' },
  { value: 'travel', label: '旅行' },
  { value: 'food', label: '美食' },
  { value: 'activity', label: '活动' },
  { value: 'other', label: '其他' },
];

interface Props {
  onCelebrate?: () => void;
}

const BucketListCard = forwardRef<{ reload: () => Promise<void> }, Props>(({ onCelebrate }, ref) => {
  const [items, setItems] = useState<BucketItemResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    storage.getUserId().then(setMyUserId);
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await api.getBucket();
      setItems(result.items);
      setTotal(result.total);
      setCompletedCount(result.completed_count);
    } catch {}
    setLoading(false);
  }, []);

  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try {
      await api.createBucketItem(newTitle.trim(), newCategory || undefined);
      setNewTitle('');
      setNewCategory(null);
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert('', e.message);
    }
  };

  const completeWithCelebration = async (item: BucketItemResponse) => {
    try {
      await api.completeBucketItem(item.id);
      await load();
      onCelebrate?.();
    } catch (e: any) {
      Alert.alert('', e.message || '操作失败');
    }
  };

  const handleToggle = (item: BucketItemResponse) => {
    if (item.completed) {
      Alert.alert('取消完成？', `把"${item.title}"标记为未完成？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '取消完成',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.uncompleteBucketItem(item.id);
              await load();
            } catch (e: any) {
              Alert.alert('', e.message || '操作失败');
            }
          },
        },
      ]);
      return;
    }
    Alert.alert('完成心愿？', `确定完成"${item.title}"？`, [
      { text: '取消', style: 'cancel' },
      { text: '完成 🎉', onPress: () => completeWithCelebration(item) },
    ]);
  };

  const handleDelete = (item: BucketItemResponse) => {
    Alert.alert('删除', `确定删除"${item.title}"？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { await api.deleteBucketItem(item.id); await load(); } },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  const filtered = filter ? items.filter(i => i.category === filter) : items;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>心愿清单 ✨</Text>

      <Text style={styles.summary}>{completedCount}/{total} 已完成</Text>

      <View style={styles.filterRow}>
        {CATEGORIES.map(c => (
          <TouchableOpacity
            key={c.label}
            style={[styles.filterChip, filter === c.value && styles.filterChipActive]}
            onPress={() => setFilter(c.value)}
          >
            <Text style={[styles.filterText, filter === c.value && styles.filterTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.map(item => {
        const mine = !!myUserId && item.created_by === myUserId;
        const accent = mine ? MINE_COLOR : PARTNER_COLOR;
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.itemRow}
            onPress={() => handleToggle(item)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={[styles.accentBar, { backgroundColor: accent }]} />
            <Text style={styles.checkbox}>{item.completed ? '✅' : '⬜'}</Text>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, !!item.completed && styles.itemTitleDone]}>{item.title}</Text>
              {item.category ? <Text style={styles.itemCategory}>{item.category}</Text> : null}
            </View>
            <View style={[styles.authorChip, { borderColor: accent }]}>
              <Text style={[styles.authorChipText, { color: accent }]}>{mine ? '我' : 'ta'}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {showAdd ? (
        <View style={styles.addForm}>
          <TextInput
            style={styles.input}
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="心愿名称"
            placeholderTextColor={COLORS.textLight}
            maxLength={50}
            autoFocus
          />
          <View style={styles.catRow}>
            {CATEGORIES.slice(1).map(c => (
              <TouchableOpacity
                key={c.value}
                style={[styles.catChip, newCategory === c.value && styles.catChipActive]}
                onPress={() => setNewCategory(newCategory === c.value ? null : c.value)}
              >
                <Text style={[styles.catText, newCategory === c.value && styles.catTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
              <Text style={styles.cancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, !newTitle.trim() && styles.submitDisabled]}
              onPress={handleAdd}
              disabled={!newTitle.trim()}
            >
              <Text style={styles.submitText}>添加</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addLink} onPress={() => setShowAdd(true)}>
          <Text style={styles.addLinkText}>+ 添加心愿</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default BucketListCard;

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  header: { fontSize: 13, fontWeight: '600', color: COLORS.textLight, marginBottom: 8 },
  summary: { fontSize: 16, fontWeight: '600', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.kiss, borderColor: COLORS.kiss },
  filterText: { fontSize: 12, color: COLORS.textLight },
  filterTextActive: { color: COLORS.white, fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, position: 'relative' },
  accentBar: { position: 'absolute', left: 0, top: 6, bottom: 6, width: 4, borderRadius: 2 },
  checkbox: { fontSize: 18 },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 15, color: COLORS.text },
  itemTitleDone: { textDecorationLine: 'line-through', color: COLORS.textLight },
  itemCategory: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  authorChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: COLORS.white,
  },
  authorChipText: { fontSize: 11, fontWeight: '700' },
  addForm: { marginTop: 12, gap: 8 },
  input: { backgroundColor: COLORS.background, borderRadius: 12, paddingHorizontal: 16, height: 44, fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  catRow: { flexDirection: 'row', gap: 6 },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  catChipActive: { borderColor: COLORS.kiss, backgroundColor: '#FFF0F3' },
  catText: { fontSize: 12, color: COLORS.textLight },
  catTextActive: { color: COLORS.kiss },
  addActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelText: { fontSize: 14, color: COLORS.textLight },
  submitBtn: { flex: 1, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.kiss },
  submitDisabled: { opacity: 0.4 },
  submitText: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  addLink: { height: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 10, marginTop: 8 },
  addLinkText: { fontSize: 13, color: COLORS.textLight },
});
