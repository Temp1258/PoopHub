import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, ACTION_EMOJI } from '../constants';
import { api, StatsResponse } from '../services/api';

export default function StatsCard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await api.getStats();
      setStats(result);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  if (!stats || stats.total_actions === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.header}>互动统计</Text>
        <Text style={styles.empty}>还没有互动数据</Text>
      </View>
    );
  }

  const maxCount = stats.top_actions[0]?.count ?? 1;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>互动统计</Text>

      <View style={styles.totalRow}>
        <Text style={styles.totalNumber}>{stats.total_actions}</Text>
        <Text style={styles.totalLabel}>次互动</Text>
      </View>

      {stats.first_action_date && (
        <Text style={styles.since}>从 {stats.first_action_date} 开始</Text>
      )}

      <View style={styles.compareRow}>
        <View style={styles.compareItem}>
          <Text style={styles.compareNumber}>{stats.my_actions}</Text>
          <Text style={styles.compareLabel}>我</Text>
        </View>
        <View style={styles.compareDivider} />
        <View style={styles.compareItem}>
          <Text style={styles.compareNumber}>{stats.partner_actions}</Text>
          <Text style={styles.compareLabel}>ta</Text>
        </View>
      </View>

      {stats.top_actions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>最爱表情 Top 5</Text>
          {stats.top_actions.slice(0, 5).map((item) => (
            <View key={item.action_type} style={styles.barRow}>
              <Text style={styles.barEmoji}>
                {ACTION_EMOJI[item.action_type] || '?'}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(item.count / maxCount) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.barCount}>{item.count}</Text>
            </View>
          ))}
        </View>
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
    marginBottom: 16,
  },
  empty: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  totalNumber: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.kiss,
  },
  totalLabel: {
    fontSize: 16,
    color: COLORS.textLight,
  },
  since: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    gap: 24,
  },
  compareItem: {
    alignItems: 'center',
  },
  compareNumber: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
  },
  compareLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  compareDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  barEmoji: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: COLORS.background,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: COLORS.kiss,
    borderRadius: 6,
    minWidth: 4,
  },
  barCount: {
    fontSize: 13,
    color: COLORS.textLight,
    width: 32,
    textAlign: 'right',
  },
});
