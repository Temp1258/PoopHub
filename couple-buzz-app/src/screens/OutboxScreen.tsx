import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';
import { api, OutboxCapsuleItem, OutboxMailboxItem } from '../services/api';
import { storage } from '../utils/storage';
import { normalizeIso } from '../utils/inboxUnread';
import { formatPostmark } from '../utils/postmark';
import { SpringPressable } from '../components/SpringPressable';

const SCREEN_H = Dimensions.get('window').height;

interface Props {
  visible: boolean;
  onClose: () => void;
  partnerName?: string;
}

export interface OutboxHandle {
  reload: () => Promise<void>;
}

type LetterKind = 'mailbox' | 'capsule';

interface OutboxCard {
  key: string;
  kind: LetterKind;
  // Used to sort newest-last (matches inbox flow: scroll up = older).
  sortAt: string;
  kindLabel: string;
  accent: string;
  // Wall-clock postmarks rendered in the writer/recipient timezones.
  writtenLine: string;
  arriveLineMine: string;
  arriveLineTheirs: string;
  recipientLabel: string;
  charCount: number;
}

const MAILBOX_ACCENT = '#FFB5C2';
const CAPSULE_ACCENT = '#C3AED6';
const CARD_HEIGHT = 220;
const CARD_GAP = 16;
const SNAP_INTERVAL = CARD_HEIGHT + CARD_GAP;
const STACK_OFFSET = 55;

const OutboxScreen = forwardRef<OutboxHandle, Props>(({ visible, onClose, partnerName }, ref) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<OutboxCard[]>([]);
  // listHeight seeded with a screen-derived guess for the same reason
  // InboxScreen does — the pageSheet slide-in can defer onLayout.
  const [listHeight, setListHeight] = useState(SCREEN_H * 0.7);
  const [centerIdx, setCenterIdx] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTickedIdxRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const [myName, partnerRemark, partnerNameStorage, myTz, partnerTz, outbox] = await Promise.all([
        storage.getUserName(),
        storage.getPartnerRemark(),
        storage.getPartnerName(),
        storage.getTimezone(),
        storage.getPartnerTimezone(),
        api.getOutbox().catch(() => ({ mailbox_pending: [] as OutboxMailboxItem[], capsule_pending: [] as OutboxCapsuleItem[] })),
      ]);
      const me = myName || '我';
      const ta = (partnerRemark && partnerRemark.trim()) || partnerName || partnerNameStorage || 'ta';
      const myZone = myTz || 'Asia/Shanghai';
      const partnerZone = partnerTz || 'Asia/Shanghai';

      const out: OutboxCard[] = [];

      for (const m of outbox.mailbox_pending || []) {
        const writtenIso = normalizeIso(m.created_at);
        const revealIso = normalizeIso(m.reveal_at);
        out.push({
          key: `m-${m.id}`,
          kind: 'mailbox',
          sortAt: revealIso,
          kindLabel: '次日达 · 寄给 ' + ta,
          accent: MAILBOX_ACCENT,
          writtenLine: `写于 ${formatPostmark(writtenIso, myZone)}`,
          arriveLineMine: `送达 ${formatPostmark(revealIso, myZone)}`,
          arriveLineTheirs: `ta 那边收到时 ${formatPostmark(revealIso, partnerZone)}`,
          recipientLabel: `${me} → ${ta}`,
          charCount: (m.content || '').length,
        });
      }

      for (const c of outbox.capsule_pending || []) {
        const writtenIso = normalizeIso(c.created_at);
        const unlockIso = normalizeIso(c.unlock_at);
        const recipient = c.visibility === 'self' ? me : ta;
        const recipientZone = c.visibility === 'self' ? myZone : partnerZone;
        out.push({
          key: `c-${c.id}`,
          kind: 'capsule',
          sortAt: unlockIso,
          kindLabel: c.visibility === 'self' ? '择日达 · 给自己' : `择日达 · 寄给 ${ta}`,
          accent: CAPSULE_ACCENT,
          writtenLine: `写于 ${formatPostmark(writtenIso, myZone)}`,
          arriveLineMine: `送达 ${formatPostmark(unlockIso, myZone)}`,
          arriveLineTheirs: c.visibility === 'self'
            ? `（仅自己可见）`
            : `ta 那边收到时 ${formatPostmark(unlockIso, recipientZone)}`,
          recipientLabel: `${me} → ${recipient}`,
          charCount: (c.content || '').length,
        });
      }

      // Newest-last: scrolling up reveals older items, matching InboxScreen.
      out.sort((a, b) => (a.sortAt < b.sortAt ? -1 : a.sortAt > b.sortAt ? 1 : 0));
      setCards(out);
    } finally {
      setLoading(false);
    }
  }, [partnerName]);

  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  const cardsLengthRef = useRef(0);
  cardsLengthRef.current = cards.length;
  useEffect(() => {
    if (!visible) return;
    if (cardsLengthRef.current === 0) setLoading(true);
    load();
  }, [visible, load]);

  const verticalPad = Math.max(0, (listHeight - CARD_HEIGHT) / 2);

  // Initial scroll-to-latest, mirrors InboxScreen.
  const initialScrolledRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      initialScrolledRef.current = false;
      return;
    }
    if (loading || cards.length === 0 || initialScrolledRef.current) return;
    const targetIdx = cards.length - 1;
    const targetY = targetIdx * SNAP_INTERVAL;
    scrollY.setValue(targetY);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: targetY, animated: false });
      setCenterIdx(targetIdx);
      lastTickedIdxRef.current = targetIdx;
      initialScrolledRef.current = true;
    });
  }, [visible, loading, cards.length, scrollY]);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / SNAP_INTERVAL);
        const clamped = Math.max(0, Math.min(cards.length - 1, idx));
        if (clamped !== lastTickedIdxRef.current) {
          Haptics.selectionAsync();
          lastTickedIdxRef.current = clamped;
          setCenterIdx(clamped);
        }
      },
    }
  );

  // Tap a peek card to bring it to focus — matches the inbox UX so the
  // user can jump between letters by tap as well as flick.
  const handleCardPress = (index: number) => {
    if (index === centerIdx) return;
    scrollViewRef.current?.scrollTo({ y: index * SNAP_INTERVAL, animated: true });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={[styles.container, { paddingTop: 24 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📤 发件箱</Text>
        </View>

        {/* Same close-on-background-tap pattern as InboxScreen — taps on
            list padding bubble up; cards capture their own. */}
        <Pressable
          style={styles.listWrap}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          onPress={onClose}
        >
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={COLORS.kiss} />
            </View>
          ) : cards.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>✉️</Text>
              <Text style={styles.emptyTitle}>没有在途的信件</Text>
              <Text style={styles.emptySub}>
                次日达和择日达寄出后会在这里展示，{'\n'}送达后自动从这里消失
              </Text>
            </View>
          ) : (
            <Animated.ScrollView
              ref={scrollViewRef as any}
              contentContainerStyle={[
                styles.stackContainer,
                { paddingTop: verticalPad, paddingBottom: verticalPad },
              ]}
              showsVerticalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="normal"
              onScroll={onScroll}
              scrollEventThrottle={16}
            >
              {cards.map((card, index) => {
                const cardScrollAtCenter = index * SNAP_INTERVAL;
                const translateY = scrollY.interpolate({
                  inputRange: [
                    cardScrollAtCenter - SNAP_INTERVAL,
                    cardScrollAtCenter,
                    cardScrollAtCenter + SNAP_INTERVAL,
                  ],
                  outputRange: [
                    STACK_OFFSET - SNAP_INTERVAL,
                    0,
                    SNAP_INTERVAL - STACK_OFFSET,
                  ],
                  extrapolate: 'extend',
                });
                const scale = scrollY.interpolate({
                  inputRange: [
                    cardScrollAtCenter - 2 * SNAP_INTERVAL,
                    cardScrollAtCenter - SNAP_INTERVAL,
                    cardScrollAtCenter,
                    cardScrollAtCenter + SNAP_INTERVAL,
                    cardScrollAtCenter + 2 * SNAP_INTERVAL,
                  ],
                  outputRange: [0.86, 0.93, 1, 0.93, 0.86],
                  extrapolate: 'clamp',
                });

                const dist = Math.abs(index - centerIdx);
                const zIdx = cards.length - dist;

                return (
                  <Animated.View
                    key={card.key}
                    style={[
                      styles.cardSlot,
                      index === cards.length - 1 ? null : { marginBottom: CARD_GAP },
                      {
                        zIndex: zIdx,
                        elevation: zIdx,
                        transform: [{ translateY }, { scale }],
                      },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handleCardPress(index)}
                      style={[styles.card, { backgroundColor: card.accent }]}
                    >
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardKind}>{card.kindLabel}</Text>
                        <View style={styles.transitPill}>
                          <Text style={styles.transitPillText}>在途</Text>
                        </View>
                      </View>
                      <View style={styles.cardDivider} />
                      <Text style={styles.cardRecipient}>{card.recipientLabel}</Text>
                      <View style={styles.cardBody}>
                        <Text style={styles.cardLine}>{card.writtenLine}</Text>
                        <Text style={styles.cardLine}>{card.arriveLineMine}</Text>
                        <Text style={styles.cardLineMuted}>{card.arriveLineTheirs}</Text>
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.cardCount}>{card.charCount} 字</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>
          )}
        </Pressable>

        {/* "收起" pill at bottom-center — same pattern as InboxScreen. */}
        <View style={[styles.pillSlot, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
          <SpringPressable onPress={onClose} style={styles.dismissPill} scaleTo={1.06}>
            <Text style={styles.dismissPillText}>收起</Text>
          </SpringPressable>
        </View>
      </View>
    </Modal>
  );
});

export default OutboxScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    minHeight: 32,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  pillSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  dismissPill: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: COLORS.kiss,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
    minWidth: 132,
    alignItems: 'center',
  },
  dismissPillText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  listWrap: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  emptySub: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 19 },
  stackContainer: {
    paddingHorizontal: 16,
  },
  cardSlot: {
    height: CARD_HEIGHT,
  },
  card: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardKind: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  transitPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  transitPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.kiss,
    letterSpacing: 0.4,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginTop: 10,
    marginBottom: 6,
  },
  cardRecipient: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 8,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  cardLine: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  cardLineMuted: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.85)',
    fontVariant: ['tabular-nums'],
  },
  cardFooter: {
    alignItems: 'flex-end',
  },
  cardCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
