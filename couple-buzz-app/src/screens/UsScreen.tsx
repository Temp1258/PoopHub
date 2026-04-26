import React, { useState, useCallback, useRef } from 'react';
import { Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import RitualButton from '../components/RitualButton';
import DailyQuestionCard from '../components/DailyQuestionCard';
import DailySnapCard from '../components/DailySnapCard';

type Reloadable = { reload: () => Promise<void> };

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const ritualRef = useRef<Reloadable>(null);
  const questionRef = useRef<Reloadable>(null);
  const snapRef = useRef<Reloadable>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        ritualRef.current?.reload(),
        questionRef.current?.reload(),
        snapRef.current?.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.kiss} />
      }
    >
      <Text style={styles.title}>每日</Text>
      <RitualButton ref={ritualRef} />
      <DailyQuestionCard ref={questionRef} />
      <DailySnapCard ref={snapRef} />
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
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
});
