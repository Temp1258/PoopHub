import React, { useState, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
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

  // Outer View pushes the ScrollView (and therefore the refresh spinner)
  // below the safe area; spinner ends up roughly between screen top and the
  // first card. Cards no longer need their own paddingTop.
  return (
    <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.kiss}
          />
        }
      >
        <RitualButton ref={ritualRef} />
        <DailyQuestionCard ref={questionRef} />
        <DailySnapCard ref={snapRef} />
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
    gap: 16,
  },
});
