import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, ACTION_EMOJI } from '../constants';
import { api, WeeklyReportResponse } from '../services/api';

export default function WeeklyReportCard() {
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const result = await api.getWeeklyReport();
          setData(result);
        } catch {}
        setLoading(false);
      })();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  if (!data || data.total === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.header}>恋爱周报 📊</Text>
        <Text style={styles.empty}>本周还没有数据</Text>
      </View>
    );
  }

  const changeIcon = data.change_percent > 0 ? '↑' : data.change_percent < 0 ? '↓' : '';
  const changeColor = data.change_percent > 0 ? '#4CD964' : data.change_percent < 0 ? '#FF6B6B' : COLORS.textLight;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>恋爱周报 📊</Text>

      <View style={styles.tempRow}>
        <Text style={styles.tempScore}>{data.temperature}</Text>
        <Text style={styles.tempLabel}>{data.temperature_label}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{data.total}</Text>
          <Text style={styles.statLabel}>互动</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: changeColor }]}>
            {changeIcon}{Math.abs(data.change_percent)}%
          </Text>
          <Text style={styles.statLabel}>vs 上周</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>🔥{data.streak}</Text>
          <Text style={styles.statLabel}>连续</Text>
        </View>
      </View>

      {data.top_actions.length > 0 && (
        <View style={styles.topRow}>
          {data.top_actions.slice(0, 3).map((a) => (
            <Text key={a.action_type} style={styles.topEmoji}>
              {ACTION_EMOJI[a.action_type] || '?'} {a.count}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.ratesRow}>
        <Text style={styles.rateText}>问答 {data.daily_question_rate}</Text>
        <Text style={styles.rateText}>早安 {data.ritual_morning_rate}</Text>
        <Text style={styles.rateText}>晚安 {data.ritual_evening_rate}</Text>
      </View>
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
    paddingVertical: 12,
  },
  tempRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  tempScore: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.kiss,
  },
  tempLabel: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  topEmoji: {
    fontSize: 14,
    color: COLORS.text,
  },
  ratesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  rateText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
});
