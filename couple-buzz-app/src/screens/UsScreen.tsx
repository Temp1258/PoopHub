import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants';
import RitualButton from '../components/RitualButton';
import DailyQuestionCard from '../components/DailyQuestionCard';
import DailySnapCard from '../components/DailySnapCard';
import { useBeijing7amCountdown } from '../utils/countdown';

type Reloadable = { reload: () => Promise<void> };

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const ritualRef = useRef<Reloadable>(null);
  const questionRef = useRef<Reloadable>(null);
  const snapRef = useRef<Reloadable>(null);
  const cd = useBeijing7amCountdown();

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
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
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
        <Text style={styles.refreshHint}>
          {cd.done ? '即将刷新' : `距下次刷新 ${cd.hh}:${cd.mm}:${cd.ss}`}
        </Text>
      </ScrollView>
      {/* Soft fade at the top of the scroll area: bg-opaque at the top of
          the safe area, transparent ~24pt down. Lets content scroll into
          the header zone smoothly instead of meeting a hard horizontal cut. */}
      <LinearGradient
        colors={[COLORS.background, 'rgba(255, 245, 245, 0)']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: insets.top + 12,
          height: 24,
        }}
        pointerEvents="none"
      />
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
  refreshHint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
});
