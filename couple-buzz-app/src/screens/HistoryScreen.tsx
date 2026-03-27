import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../constants';
import { api, HistoryAction } from '../services/api';
import { storage } from '../utils/storage';
import ActionRecord from '../components/ActionRecord';

interface Section {
  title: string;
  data: HistoryAction[];
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr + 'Z'); // treat as UTC
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
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

export default function HistoryScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myName, setMyName] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const userId = await storage.getUserId();
      const userName = await storage.getUserName();
      if (!userId) return;

      setMyName(userName || '');
      const result = await api.getHistory(userId, 100);
      setSections(groupByDate(result.actions));
    } catch (error) {
      console.warn('Failed to load history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.kiss} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <ActionRecord
            userName={item.user_name}
            actionType={item.action_type}
            time={formatTime(item.created_at)}
            isMine={item.user_name === myName}
          />
        )}
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
});
