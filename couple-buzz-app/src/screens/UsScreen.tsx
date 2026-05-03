import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants';
import RitualButton from '../components/RitualButton';
import DailyQuestionCard from '../components/DailyQuestionCard';
import DailySnapCard from '../components/DailySnapCard';
import { useNextDailyRefreshAt } from '../utils/countdown';
import { storage } from '../utils/storage';
import { formatPostmark } from '../utils/postmark';

type Reloadable = { reload: () => Promise<void> };

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const ritualRef = useRef<Reloadable>(null);
  const questionRef = useRef<Reloadable>(null);
  const snapRef = useRef<Reloadable>(null);
  const nextRefreshAt = useNextDailyRefreshAt();
  const [myTz, setMyTz] = useState('Asia/Shanghai');
  // Re-fetch tz on every focus so a Settings tz change is picked up the
  // next time the user navigates back to the daily tab — a one-shot
  // mount-time read would freeze on the boot-time tz forever.
  useFocusEffect(
    useCallback(() => {
      storage.getTimezone().then(tz => { if (tz) setMyTz(tz); }).catch(() => {});
    }, [])
  );
  // Render the daily refresh moment as month-day + hh:mm in the user's
  // tz — e.g. "纽约时间 05-03 19:00". formatPostmark already produces this
  // exact shape, so we reuse it for postmark/refresh consistency.
  const refreshStamp = (() => {
    try {
      return formatPostmark(new Date(nextRefreshAt).toISOString(), myTz);
    } catch {
      return '';
    }
  })();
  // Scroll-bound fade: invisible at rest (so the topmost card's edge is
  // fully visible), fades in to mask content as the user scrolls up.
  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeOpacity = scrollY.interpolate({
    inputRange: [0, 12],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

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
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.kiss}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <RitualButton ref={ritualRef} />
        <DailyQuestionCard ref={questionRef} />
        <DailySnapCard ref={snapRef} />
        <Text style={styles.refreshHint}>
          {refreshStamp ? `下次更新于 ${refreshStamp}` : ''}
        </Text>
      </Animated.ScrollView>
      {/* Scroll-bound fade: invisible at rest, fades in once the user
          scrolls so content sliding up under the safe area dissolves
          smoothly into the bg instead of meeting a hard cut. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: insets.top + 12,
          height: 24,
          opacity: fadeOpacity,
        }}
      >
        <LinearGradient
          colors={[COLORS.background, 'rgba(255, 245, 245, 0)']}
          style={{ flex: 1 }}
        />
      </Animated.View>
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
