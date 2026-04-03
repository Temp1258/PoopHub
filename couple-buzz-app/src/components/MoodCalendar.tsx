import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, ACTION_EMOJI } from '../constants';
import { api, CalendarDay } from '../services/api';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getMonthStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function getOpacity(count: number, maxCount: number): number {
  if (count === 0 || maxCount === 0) return 0;
  return 0.2 + (count / maxCount) * 0.8;
}

export default function MoodCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<Map<string, CalendarDay>>(new Map());
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  const loadMonth = useCallback(async (y: number, m: number) => {
    try {
      const result = await api.getCalendar(getMonthStr(y, m));
      const map = new Map<string, CalendarDay>();
      for (const d of result.days) {
        map.set(d.date, d);
      }
      setDays(map);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMonth(year, month);
    }, [year, month, loadMonth])
  );

  const goPrev = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
    setSelectedDay(null);
  };

  const goNext = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
    setSelectedDay(null);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const maxCount = Math.max(...Array.from(days.values()).map(d => d.count), 1);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  return (
    <View style={styles.card}>
      <Text style={styles.header}>心情日历</Text>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goPrev} style={styles.navButton}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{year}年{month}月</Text>
        <TouchableOpacity onPress={goNext} style={styles.navButton}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekDay}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) {
            return <View key={`e${i}`} style={styles.cell} />;
          }
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const data = days.get(dateStr);
          const hasData = !!data && data.count > 0;
          const isSelected = selectedDay?.date === dateStr;

          return (
            <TouchableOpacity
              key={day}
              style={[styles.cell, isSelected && styles.cellSelected]}
              onPress={() => setSelectedDay(data || null)}
              disabled={!hasData}
            >
              {hasData && (
                <View
                  style={[
                    styles.cellBg,
                    { opacity: getOpacity(data.count, maxCount) },
                  ]}
                />
              )}
              <Text style={[styles.cellText, hasData && styles.cellTextActive]}>
                {day}
              </Text>
              {hasData && data.top_action && (
                <Text style={styles.cellEmoji}>
                  {ACTION_EMOJI[data.top_action] || ''}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedDay && (
        <View style={styles.detail}>
          <Text style={styles.detailDate}>{selectedDay.date}</Text>
          <Text style={styles.detailText}>
            总计 {selectedDay.count} 次 · 我 {selectedDay.my_count} · ta {selectedDay.partner_count}
          </Text>
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
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    gap: 16,
  },
  navButton: {
    padding: 4,
  },
  navText: {
    fontSize: 24,
    color: COLORS.textLight,
    fontWeight: '300',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cellSelected: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.kiss,
  },
  cellBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.kiss,
    borderRadius: 8,
  },
  cellText: {
    fontSize: 13,
    color: COLORS.textLight,
    zIndex: 1,
  },
  cellTextActive: {
    color: COLORS.text,
    fontWeight: '500',
  },
  cellEmoji: {
    fontSize: 10,
    position: 'absolute',
    bottom: 2,
    zIndex: 1,
  },
  detail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    alignItems: 'center',
  },
  detailDate: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  detailText: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
  },
});
