import React, { useEffect, useState, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
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
  PanResponder,
  Dimensions,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { api, CapsuleItem } from '../services/api';
import { storage } from '../utils/storage';
import EnvelopeOpenAnimation from '../components/EnvelopeOpenAnimation';
import IslandToast, { IslandToastHandle } from '../components/IslandToast';

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
  refId: number;
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
const SCREEN_W = Dimensions.get('window').width;

// Layout interval — drives snapping. Cards lay out at i*SNAP_INTERVAL apart.
const CARD_HEIGHT = 220;
const CARD_GAP = 16;
const SNAP_INTERVAL = CARD_HEIGHT + CARD_GAP;

// Visual stacking offset — peek cards expose 25% (55pt of CARD_HEIGHT 220pt),
// so each card overlaps the previous by 75%.
const STACK_OFFSET = 55;

// Right-swipe threshold to trigger deletion (~38% of screen width).
const SWIPE_THRESHOLD = SCREEN_W * 0.38;

const InboxScreen = forwardRef<InboxHandle, Props>(({ visible, onClose }, ref) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<LetterCard[]>([]);
  const [revealAnim, setRevealAnim] = useState<LetterCard | null>(null);
  const [listHeight, setListHeight] = useState(0);
  const [centerIdx, setCenterIdx] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const toastRef = useRef<IslandToastHandle>(null);

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
        if (!w.partner_content || !w.partner_message_id) continue;
        out.push({
          key: `m-${w.partner_message_id}`,
          kind: 'mailbox',
          refId: w.partner_message_id,
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
          refId: c.id,
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
      scrollViewRef.current?.scrollTo({ y: index * SNAP_INTERVAL, animated: true });
    }
  };

  const handleSwipeOut = useCallback(async (card: LetterCard) => {
    // Optimistic removal — remove from local state immediately, fire API.
    // If the API fails, reload from server to restore the truth.
    setCards(prev => prev.filter(c => c.key !== card.key));
    toastRef.current?.show('已移到垃圾篓 · 可在垃圾篓恢复');
    try {
      await api.trashInboxItem(card.kind, card.refId);
    } catch {
      toastRef.current?.show('移到垃圾篓失败');
      load();
    }
  }, [load]);

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
                    <SwipeableCard
                      enabled={index === centerIdx}
                      onSwipeOut={() => handleSwipeOut(card)}
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
                            {index === centerIdx ? '轻点开启 · 右划删除' : '轻点居中'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </SwipeableCard>
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

        <IslandToast ref={toastRef} top={insets.top + 8} />
      </View>
    </Modal>
  );
});

export default InboxScreen;

// Wraps a card with a horizontal pan gesture that swipes the card off to the
// right when released past SWIPE_THRESHOLD. Vertical motion is yielded to the
// ScrollView. Only enabled for the centered card so peek cards can't be
// accidentally dismissed.
function SwipeableCard({
  children,
  onSwipeOut,
  enabled,
}: {
  children: React.ReactNode;
  onSwipeOut: () => void;
  enabled: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => {
          if (!enabled) return false;
          // Claim the gesture only when horizontal motion clearly dominates,
          // so vertical scrolling stays with the parent ScrollView.
          return Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6;
        },
        onMoveShouldSetPanResponderCapture: (_, g) => {
          if (!enabled) return false;
          return Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 2.2;
        },
        onPanResponderMove: (_, g) => {
          // Only follow rightward swipes; clamp leftward motion at 0.
          translateX.setValue(Math.max(0, g.dx));
          // Slight opacity falloff as the card moves away.
          opacity.setValue(Math.max(0.4, 1 - g.dx / SCREEN_W));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx >= SWIPE_THRESHOLD) {
            Animated.parallel([
              Animated.timing(translateX, {
                toValue: SCREEN_W * 1.1,
                duration: 220,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start(() => onSwipeOut());
          } else {
            Animated.parallel([
              Animated.spring(translateX, { toValue: 0, friction: 7, tension: 70, useNativeDriver: true }),
              Animated.spring(opacity, { toValue: 1, friction: 7, useNativeDriver: true }),
            ]).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, friction: 7, tension: 70, useNativeDriver: true }),
            Animated.spring(opacity, { toValue: 1, friction: 7, useNativeDriver: true }),
          ]).start();
        },
      }),
    [enabled, onSwipeOut, translateX, opacity]
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.swipeWrap, { transform: [{ translateX }], opacity }]}
    >
      {children}
    </Animated.View>
  );
}

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
  swipeWrap: {
    flex: 1,
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
