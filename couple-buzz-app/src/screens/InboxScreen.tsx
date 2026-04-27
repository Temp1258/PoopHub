import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { api, CapsuleItem } from '../services/api';
import EnvelopeOpenAnimation from '../components/EnvelopeOpenAnimation';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type LetterKind = 'mailbox' | 'capsule';

interface LetterCard {
  key: string;
  kind: LetterKind;
  // Sort key — ISO datetime string
  sortAt: string;
  title: string;
  subtitle: string;
  // Either a single body (capsule) or two-side body (mailbox AM/PM session).
  body?: string;
  bothSides?: { mine: string | null; partner: string | null };
  accent: string;
}

// Mailbox vs capsule color tokens — Wallet passes are visually distinct per
// type, so the two letter sources read at a glance.
const MAILBOX_ACCENT = '#FFB5C2';
const CAPSULE_ACCENT = '#C3AED6';

// Stack metrics — each card peeks ~120pt above the next, mimicking Wallet.
const CARD_HEIGHT = 220;
const CARD_PEEK = 120;

export default function InboxScreen({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState<LetterCard[]>([]);
  const [revealAnim, setRevealAnim] = useState<{ title: string; content: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [mailbox, capsules] = await Promise.all([
        api.getMailboxArchive(50).catch(() => ({ weeks: [] })),
        api.getCapsules().catch(() => ({ capsules: [] as CapsuleItem[] })),
      ]);

      const mailboxCards: LetterCard[] = (mailbox.weeks || [])
        .filter(w => w.my_content || w.partner_content)
        .map(w => ({
          key: `m-${w.week_key}`,
          kind: 'mailbox',
          sortAt: w.week_key,
          title: formatMailboxTitle(w.week_key),
          subtitle: '次日达',
          bothSides: { mine: w.my_content, partner: w.partner_content },
          accent: MAILBOX_ACCENT,
        }));

      const capsuleCards: LetterCard[] = (capsules.capsules || [])
        .filter(c => c.opened_at && c.content)
        .map(c => ({
          key: `c-${c.id}`,
          kind: 'capsule',
          sortAt: c.opened_at || c.unlock_date,
          title: c.unlock_date,
          subtitle: c.author === 'me'
            ? (c.visibility === 'self' ? '择日达 · 给自己' : '择日达 · 给 ta')
            : '择日达 · 来自 ta',
          body: c.content || '',
          accent: CAPSULE_ACCENT,
        }));

      const merged = [...mailboxCards, ...capsuleCards].sort((a, b) =>
        a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0
      );
      setCards(merged);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    load();
  }, [visible, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const handleOpenCard = (card: LetterCard) => {
    if (card.kind === 'capsule') {
      setRevealAnim({ title: card.subtitle, content: card.body || '' });
      return;
    }
    // Mailbox: prefer partner side as the "letter to me", but show both if
    // partner skipped.
    const both = card.bothSides!;
    const content = both.partner
      ? both.partner
      : (both.mine || '这场没有内容');
    const title = both.partner ? `${card.title} · ta 写的` : `${card.title} · 我写的`;
    setRevealAnim({ title, content });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
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
            <Text style={styles.emptySub}>已揭晓的次日达和已开启的择日达都会出现在这里</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.stackContainer, { paddingBottom: insets.bottom + 60 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.kiss} />
            }
          >
            {cards.map((card, index) => (
              <TouchableOpacity
                key={card.key}
                activeOpacity={0.85}
                onPress={() => handleOpenCard(card)}
                style={[
                  styles.card,
                  {
                    backgroundColor: card.accent,
                    marginTop: index === 0 ? 0 : -CARD_PEEK,
                    // Newest on top — invert z-stack so older cards peek
                    // out from underneath instead of covering the newer.
                    zIndex: cards.length - index,
                    elevation: cards.length - index,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardKind}>{card.subtitle}</Text>
                  <Text style={styles.cardDate}>{card.title}</Text>
                </View>
                <View style={styles.cardSnippetWrap}>
                  <Text style={styles.cardSnippet} numberOfLines={3}>
                    {previewOf(card)}
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
          title={revealAnim?.title}
          content={revealAnim?.content ?? ''}
          onClose={() => setRevealAnim(null)}
        />
      </View>
    </Modal>
  );
}

function formatMailboxTitle(weekKey: string): string {
  // Format: YYYY-MM-DD-AM / -PM
  const date = weekKey.slice(0, 10);
  const phase = weekKey.slice(11);
  return `${date} ${phase === 'AM' ? '上半场' : '下半场'}`;
}

function previewOf(card: LetterCard): string {
  if (card.kind === 'capsule') return card.body || '';
  const both = card.bothSides!;
  if (both.partner && both.mine) return `ta: ${both.partner}`;
  return both.partner || both.mine || '这场没有内容';
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
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  cardDate: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  cardSnippetWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cardSnippet: {
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.white,
    fontWeight: '500',
  },
  cardFooter: {
    alignItems: 'flex-end',
  },
  cardCta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
});
