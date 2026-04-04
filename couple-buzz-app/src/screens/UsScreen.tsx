import React from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import DailyQuestionCard from '../components/DailyQuestionCard';
import WeeklyChallengeCard from '../components/WeeklyChallengeCard';
import MailboxCard from '../components/MailboxCard';
import DailySnapCard from '../components/DailySnapCard';
import TimeCapsuleCard from '../components/TimeCapsuleCard';
import BucketListCard from '../components/BucketListCard';
import WeeklyReportCard from '../components/WeeklyReportCard';
import StatsCard from '../components/StatsCard';
import MoodCalendar from '../components/MoodCalendar';

export default function UsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>我们</Text>
      <DailyQuestionCard />
      <WeeklyChallengeCard />
      <MailboxCard />
      <DailySnapCard />
      <TimeCapsuleCard />
      <BucketListCard />
      <WeeklyReportCard />
      <StatsCard />
      <MoodCalendar />
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
