import React, { useState, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import MailboxCard from '../components/MailboxCard';
import TimeCapsuleCard from '../components/TimeCapsuleCard';
import BucketListCard from '../components/BucketListCard';

type Reloadable = { reload: () => Promise<void> };

export default function MailboxScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const mailboxRef = useRef<Reloadable>(null);
  const capsuleRef = useRef<Reloadable>(null);
  const bucketRef = useRef<Reloadable>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        mailboxRef.current?.reload(),
        capsuleRef.current?.reload(),
        bucketRef.current?.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

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
        <MailboxCard ref={mailboxRef} />
        <TimeCapsuleCard ref={capsuleRef} />
        <BucketListCard ref={bucketRef} />
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
