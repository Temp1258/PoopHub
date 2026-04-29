import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, RefreshControl, Animated, AppState as RNAppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants';
import MailboxCard from '../components/MailboxCard';
import TimeCapsuleCard from '../components/TimeCapsuleCard';
import InboxScreen, { InboxHandle } from './InboxScreen';
import TrashScreen, { TrashHandle } from './TrashScreen';
import { hasUnreadInboxItems } from '../utils/inboxUnread';

type Reloadable = { reload: () => Promise<void> };

export default function MailboxScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [inboxHasUnread, setInboxHasUnread] = useState(false);
  const mailboxRef = useRef<Reloadable>(null);
  const capsuleRef = useRef<Reloadable>(null);
  const inboxRef = useRef<InboxHandle>(null);
  const trashRef = useRef<TrashHandle>(null);

  const refreshUnreadFlag = useCallback(async () => {
    setInboxHasUnread(await hasUnreadInboxItems());
  }, []);

  // Refresh on every focus + when the app comes back to foreground. Both
  // matter: the flag should pop on if a new letter arrived while the tab
  // was off-screen, and should clear after a quick visit to the inbox
  // (which advances INBOX_LAST_SEEN).
  useFocusEffect(
    useCallback(() => {
      refreshUnreadFlag();
    }, [refreshUnreadFlag])
  );

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') refreshUnreadFlag();
    });
    return () => sub.remove();
  }, [refreshUnreadFlag]);
  // Scroll-bound fade — see UsScreen for the same pattern + rationale.
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
        mailboxRef.current?.reload(),
        capsuleRef.current?.reload(),
        inboxRef.current?.reload(),
        trashRef.current?.reload(),
        refreshUnreadFlag(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshUnreadFlag]);

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
          {inboxHasUnread && <Text style={styles.unreadFlag}>🚩</Text>}
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
      </Animated.ScrollView>
      {/* Scroll-bound top fade — see UsScreen for rationale. */}
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

      <InboxScreen
        ref={inboxRef}
        visible={inboxOpen}
        onClose={() => {
          setInboxOpen(false);
          // Inbox open advances INBOX_LAST_SEEN to "now", so the flag should
          // clear immediately after the user closes it.
          refreshUnreadFlag();
        }}
      />
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
  unreadFlag: {
    fontSize: 18,
    marginRight: 6,
  },
});
