import React, { useState, useCallback, useRef } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import MailboxCard from '../components/MailboxCard';
import TimeCapsuleCard from '../components/TimeCapsuleCard';
import InboxScreen, { InboxHandle } from './InboxScreen';
import TrashScreen, { TrashHandle } from './TrashScreen';

type Reloadable = { reload: () => Promise<void> };

export default function MailboxScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const mailboxRef = useRef<Reloadable>(null);
  const capsuleRef = useRef<Reloadable>(null);
  const inboxRef = useRef<InboxHandle>(null);
  const trashRef = useRef<TrashHandle>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        mailboxRef.current?.reload(),
        capsuleRef.current?.reload(),
        inboxRef.current?.reload(),
        trashRef.current?.reload(),
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
          style={styles.entry}
          onPress={() => setInboxOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.entryEmoji}>📬</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryTitle}>收件箱</Text>
            <Text style={styles.entrySub}>已送达的次日达 · 已开启的择日达</Text>
          </View>
          <Text style={styles.entryArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.entry}
          onPress={() => setTrashOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.entryEmoji}>🗑️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryTitle}>垃圾篓</Text>
            <Text style={styles.entrySub}>从收件箱删除的信件可以在这里恢复</Text>
          </View>
          <Text style={styles.entryArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      <InboxScreen ref={inboxRef} visible={inboxOpen} onClose={() => setInboxOpen(false)} />
      <TrashScreen
        ref={trashRef}
        visible={trashOpen}
        onClose={() => setTrashOpen(false)}
        onAfterRestore={() => inboxRef.current?.reload()}
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
  entry: {
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
  entryEmoji: {
    fontSize: 28,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  entrySub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  entryArrow: {
    fontSize: 22,
    color: COLORS.textLight,
    fontWeight: '300',
  },
});
