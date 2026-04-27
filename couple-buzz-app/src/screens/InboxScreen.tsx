import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { api, CapsuleItem } from '../services/api';
import { storage } from '../utils/storage';
import EnvelopeOpenAnimation from '../components/EnvelopeOpenAnimation';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export interface InboxHandle {
  reload: () => Promise<void>;
}

type LetterKind = 'mailbox' | 'capsule';

interface LetterCard {
  key: string;
  kind: LetterKind;
  sortAt: string;
  date: string;
  from: string;
  to: string;
  body: string;
  kindLabel: string;
  accent: string;
}

const MAILBOX_ACCENT = '#FFB5C2';
const CAPSULE_ACCENT = '#C3AED6';

// Layout interval — drives snapping. Cards lay out at i*SNAP_INTERVAL apart.
const CARD_HEIGHT = 220;
const CARD_GAP = 16;
const SNAP_INTERVAL = CARD_HEIGHT + CARD_GAP;

// Visual stacking offset — how much each peek card sticks out beyond the
// centered card. Smaller = tighter stack (more Apple Wallet-like).
const STACK_OFFSET = 40;

const InboxScreen = forwardRef<InboxHandle, Props>(({ visible, onClose }, ref) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<LetterCard[]>([]);
  const [revealAnim, setRevealAnim] = useState<LetterCard | null>(null);
  const [listHeight, setListHeight] = useState(0);
  const [centerIdx, setCenterIdx] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [myName, partnerRemark, partnerName, mailbox, capsules] = await Promise.all([
        storage.getUserName(),
        storage.getPartnerRemark(),
        storage.getPartnerName(),
        api.getMailboxArchive(50).catch(() => ({ weeks: [] })),
        api.getCapsules().catch(() => ({ capsules: [] as CapsuleItem[] })),
      ]);
      const me = myName || '我';
      const ta = (partnerRemark && partnerRemark.trim()) || partnerName || 'ta';

      const out: LetterCard[] = [];

      for (const w of mailbox.weeks || []) {
        if (!w.partner_content) continue;
        out.push({
          key: `m-${w.week_key}`,
          kind: 'mailbox',
          sortAt: w.week_key,
          date: formatMailboxDate(w.week_key),
          from: ta,
          to: me,
          body: w.partner_content,
          kindLabel: '次日达 · 来自 ta',
          accent: MAILBOX_ACCENT,
        });
      }

      for (const c of capsules.capsules || []) {
        if (!c.opened_at || !c.content) continue;
        if (c.author === 'me' && c.visibility === 'partner') continue;

        let from = me;
        let to = ta;
        let kindLabel = '择日达';
        if (c.author === 'me' && c.visibility === 'self') {
          from = me; to = me;
          kindLabel = '择日达 · 给自己';
        } else if (c.author === 'partner') {
          from = ta; to = me;
          kindLabel = '择日达 · 来自 ta';
        }
        out.push({
          key: `c-${c.id}`,
          kind: 'capsule',
          sortAt: c.opened_at,
          date: c.unlock_date,
          from,
          to,
          body: c.content,
          kindLabel,
          accent: CAPSULE_ACCENT,
        });
      }

      out.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
      setCards(out);
      setCenterIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    load();
  }, [visible, load]);

  const verticalPad = listHeight > 0 ? Math.max(0, (listHeight - CARD_HEIGHT) / 2) : 0;

  // Native-driven scroll → drives transforms. JS listener also runs to update
  // dynamic zIndex (which can't be animated by the native driver).
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / SNAP_INTERVAL);
        const clamped = Math.max(0, Math.min(cards.length - 1, idx));
        if (clamped !== centerIdx) setCenterIdx(clamped);
      },
    }
  );

  const handleCardPress = (index: number, card: LetterCard) => {
    if (index === centerIdx) {
      setRevealAnim(card);
    } else {
      // Tapping a peek card brings it to center first; user taps again to open.
      scrollViewRef.current?.scrollTo({ y: index * SNAP_INTERVAL, animated: true });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📬 收件箱</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
            <Text style={styles.closeBtn}>完成</Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.listWrap}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        >
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={COLORS.kiss} />
            </View>
          ) : cards.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>💌</Text>
              <Text style={styles.emptyTitle}>还没有收到信</Text>
              <Text style={styles.emptySub}>已送达的次日达和已开启的择日达都会出现在这里</Text>
            </View>
          ) : listHeight > 0 ? (
            <Animated.ScrollView
              ref={scrollViewRef as any}
              contentContainerStyle={[
                styles.stackContainer,
                { paddingTop: verticalPad, paddingBottom: verticalPad },
              ]}
              showsVerticalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
              onScroll={onScroll}
              scrollEventThrottle={16}
            >
              {cards.map((card, index) => {
                const cardScrollAtCenter = index * SNAP_INTERVAL;
                // translateY pulls the card from its natural paging position
                // toward a tight stack around the centered card. relativeIndex
                // ≈ +1 → card is one slot below; we shift it up by (SNAP -
                // STACK) so it's only STACK_OFFSET below center.
                const translateY = scrollY.interpolate({
                  inputRange: [
                    cardScrollAtCenter - SNAP_INTERVAL,
                    cardScrollAtCenter,
                    cardScrollAtCenter + SNAP_INTERVAL,
                  ],
                  outputRange: [
                    STACK_OFFSET - SNAP_INTERVAL, // far-below relative slots: pulled up
                    0,                             // centered: no shift
                    SNAP_INTERVAL - STACK_OFFSET,  // far-above relative slots: pushed down
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
                const opacity = scrollY.interpolate({
                  inputRange: [
                    cardScrollAtCenter - 3 * SNAP_INTERVAL,
                    cardScrollAtCenter - 2 * SNAP_INTERVAL,
                    cardScrollAtCenter - SNAP_INTERVAL,
                    cardScrollAtCenter,
                    cardScrollAtCenter + SNAP_INTERVAL,
                    cardScrollAtCenter + 2 * SNAP_INTERVAL,
                    cardScrollAtCenter + 3 * SNAP_INTERVAL,
                  ],
                  outputRange: [0, 0.4, 0.85, 1, 0.85, 0.4, 0],
                  extrapolate: 'clamp',
                });

                // Centered card on top, then nearest neighbors, etc.
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
                        opacity,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handleCardPress(index, card)}
                      style={[styles.card, { backgroundColor: card.accent }]}
                    >
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardKind}>{card.kindLabel}</Text>
                        <Text style={styles.cardDate}>{card.date}</Text>
                      </View>
                      <View style={styles.cardFromTo}>
                        <Text style={styles.cardFromToText} numberOfLines={1}>
                          {card.from} → {card.to}
                        </Text>
                      </View>
                      <View style={styles.cardSnippetWrap}>
                        <Text style={styles.cardSnippet} numberOfLines={3}>
                          {card.body}
                        </Text>
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.cardCta}>
                          {index === centerIdx ? '轻点开启 →' : '轻点居中'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>
          ) : null}
        </View>

        <EnvelopeOpenAnimation
          visible={!!revealAnim}
          wrapInModal={false}
          skipEnvelope
          kindLabel={revealAnim?.kindLabel}
          from={revealAnim?.from}
          to={revealAnim?.to}
          date={revealAnim?.date}
          content={revealAnim?.body ?? ''}
          onClose={() => setRevealAnim(null)}
        />
      </View>
    </Modal>
  );
});

export default InboxScreen;

function formatMailboxDate(weekKey: string): string {
  const date = weekKey.slice(0, 10);
  const phase = weekKey.slice(11);
  return `${date} ${phase === 'AM' ? '上半场' : '下半场'}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.kiss,
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
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    justifyContent: 'space-between',
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
    letterSpacing: 0.5,
  },
  cardDate: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  cardFromTo: {
    marginTop: 4,
  },
  cardFromToText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
  cardSnippetWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 4,
  },
  cardSnippet: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.95)',
  },
  cardFooter: {
    alignItems: 'flex-end',
  },
  cardCta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
});
