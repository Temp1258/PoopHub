import React, { useState, useCallback, useRef } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import MailboxCard from '../components/MailboxCard';
import TimeCapsuleCard from '../components/TimeCapsuleCard';
import InboxScreen, { InboxHandle } from './InboxScreen';

type Reloadable = { reload: () => Promise<void> };

export default function MailboxScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const mailboxRef = useRef<Reloadable>(null);
  const capsuleRef = useRef<Reloadable>(null);
  const inboxRef = useRef<InboxHandle>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Pull-to-refresh on the mailbox screen also reloads the inbox so the
      // user only has one place to refresh from. The inbox itself has no
      // RefreshControl on purpose.
      await Promise.all([
        mailboxRef.current?.reload(),
        capsuleRef.current?.reload(),
        inboxRef.current?.reload(),
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

        <TouchableOpacity
          style={styles.inboxEntry}
          onPress={() => setInboxOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.inboxEmoji}>📬</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.inboxTitle}>收件箱</Text>
            <Text style={styles.inboxSub}>已送达的次日达 · 已开启的择日达</Text>
          </View>
          <Text style={styles.inboxArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      <InboxScreen ref={inboxRef} visible={inboxOpen} onClose={() => setInboxOpen(false)} />
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
  inboxEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  inboxEmoji: {
    fontSize: 28,
  },
  inboxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  inboxSub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  inboxArrow: {
    fontSize: 22,
    color: COLORS.textLight,
    fontWeight: '300',
  },
});
