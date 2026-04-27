import React, { useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
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

// Wallet cascade metrics — each card peeks ~110pt under the next when at
// rest, and Sticky behavior makes whichever card sits at the top fully
// visible during scroll.
const CARD_HEIGHT = 200;
const CARD_PEEK = 110;

const InboxScreen = forwardRef<InboxHandle, Props>(({ visible, onClose }, ref) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<LetterCard[]>([]);
  const [revealAnim, setRevealAnim] = useState<LetterCard | null>(null);

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

      // Inbox = letters I *received*. Mailbox: only the partner's side of
      // each round. (My own outgoing content is a sent-mail concept and
      // doesn't belong in the inbox.)
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

      // Capsules: keep partner-authored ones (received) and self capsules
      // (the user explicitly said opened self capsules count). Skip outgoing
      // capsules I sent to ta.
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

  // Every card index is a sticky header — RN's multi-sticky behavior is
  // exactly the Wallet cascade: as a card scrolls to the top, it docks; the
  // next sticky card pushes it off when *its* layout y crosses the scroll
  // offset. So the topmost visible card is always fully shown.
  const stickyIndices = useMemo(
    () => cards.map((_, i) => i),
    [cards]
  );

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
        ) : (
          <ScrollView
            contentContainerStyle={[styles.stackContainer, { paddingBottom: insets.bottom + 60 }]}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={stickyIndices}
          >
            {cards.map((card, index) => (
              <TouchableOpacity
                key={card.key}
                activeOpacity={0.85}
                onPress={() => setRevealAnim(card)}
                style={[
                  styles.card,
                  {
                    backgroundColor: card.accent,
                    marginTop: index === 0 ? 0 : -CARD_PEEK,
                  },
                ]}
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
                  <Text style={styles.cardSnippet} numberOfLines={2}>
                    {card.body}
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardCta}>轻点开启 →</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <EnvelopeOpenAnimation
          visible={!!revealAnim}
          wrapInModal={false}
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
    paddingTop: 4,
  },
  // Layout: each card spans CARD_HEIGHT, but consumes only (CARD_HEIGHT - CARD_PEEK)
  // of vertical space via a negative top margin (applied per-card except the
  // first via inline style). At rest this gives the Wallet peek look; while
  // scrolling, sticky behavior keeps the active top card fully visible.
  card: {
    height: CARD_HEIGHT,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
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
