import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  Easing,
  Alert,
  Pressable,
  Keyboard,
  TouchableOpacity,
  Dimensions,
  InputAccessoryView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';
import { api } from '../services/api';
import { SpringPressable } from '../components/SpringPressable';
import { storage } from '../utils/storage';
import { formatPostmark } from '../utils/postmark';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Used in the date-pick stage to label the "给对方" recipient option.
  partnerName?: string;
}

// Multi-stage flow: 写 (compose) → 选送达方式 (kind) → 择日达细节 (only if
// capsule) → 投递 (animation + API). All four stages live in one Modal so the
// transition stays inside a single sheet — the user never feels like they
// jumped to a different screen mid-write.
type Stage = 'write' | 'kind' | 'capsuleDetails' | 'sending';

type Recipient = 'self' | 'partner';

// Preset future-date offsets keep the flow OTA-able (no native datepicker
// dependency). Covers the typical "future letter" cadence — same-week
// surprise, near-month milestone, anniversary-distance.
const DAY_PRESETS = [
  { label: '明天', days: 1 },
  { label: '3 天后', days: 3 },
  { label: '一周后', days: 7 },
  { label: '半个月后', days: 14 },
  { label: '一个月后', days: 30 },
  { label: '三个月后', days: 90 },
  { label: '半年后', days: 180 },
  { label: '一年后', days: 365 },
];

const SCREEN_H = Dimensions.get('window').height;
// nativeID linking the editor's TextInput to its iOS InputAccessoryView. The
// accessory bar shows above the keyboard with a "完成" button so the user
// can dismiss the keyboard from a fixed location no matter where they're
// looking on the page.
const KB_ACCESSORY_ID = 'writeLetterDoneBar';

// Compute YYYY-MM-DD `daysAhead` days from today. Server validates the
// unlock_date is strictly in the future, so days >= 1 is required.
function computeFutureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

// Pretty form for the date pill on the picker — "2026-05-07 · 一周后".
function formatPickerDate(daysAhead: number): string {
  const date = computeFutureDate(daysAhead);
  const preset = DAY_PRESETS.find(p => p.days === daysAhead);
  return preset ? `${date} · ${preset.label}` : date;
}

export default function WriteLetterScreen({ visible, onClose, partnerName }: Props) {
  const insets = useSafeAreaInsets();

  const [stage, setStage] = useState<Stage>('write');
  const [content, setContent] = useState('');
  const [daysAhead, setDaysAhead] = useState<number>(7);
  const [recipient, setRecipient] = useState<Recipient>('partner');
  const [submitting, setSubmitting] = useState(false);

  // User-side data for the formal letter heading + footer signature. Pulled
  // from local storage on each open so a fresh nickname / timezone / partner
  // remark immediately reflects in the letter.
  const [myName, setMyName] = useState('');
  const [myTz, setMyTz] = useState('Asia/Shanghai');
  const [partnerRemark, setPartnerRemark] = useState('');
  // 1-minute tick so the footer time keeps up with the wall clock if the
  // user lingers in the editor. Uses a state stub since we only need a
  // re-render trigger, not the value.
  const [, setNowTick] = useState(0);

  // Reset stage + per-letter state every time the modal opens, but DO load
  // the persisted draft body from AsyncStorage so an accidental exit doesn't
  // throw away the user's typing. The draft is cleared on successful submit
  // (in runSubmit) — anything else (close, swipe-down) preserves it.
  useEffect(() => {
    if (visible) {
      setStage('write');
      setDaysAhead(7);
      setRecipient('partner');
      setSubmitting(false);
      // Reset animated values so the next sending stage starts fresh.
      letterY.setValue(0);
      letterScale.setValue(1);
      letterRotate.setValue(0);
      letterOpacity.setValue(1);
      mailboxBounce.setValue(0);

      // Load saved draft + sender/partner identity bits.
      Promise.all([
        storage.getWriteLetterDraft(),
        storage.getUserName(),
        storage.getTimezone(),
        storage.getPartnerRemark(),
      ]).then(([savedDraft, n, tz, r]) => {
        setContent(savedDraft || '');
        if (n) setMyName(n);
        if (tz) setMyTz(tz);
        if (r) setPartnerRemark(r);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Debounced draft autosave. Without this, content typed quickly before
  // the user accidentally closes the modal (e.g. swipe-down within 500ms of
  // typing) wouldn't make it to AsyncStorage.
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!visible) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      storage.setWriteLetterDraft(content).catch(() => {});
    }, 400);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [content, visible]);

  // 1-minute tick to refresh the footer's "now" timestamp while the user
  // is composing.
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNowTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [visible]);

  // ── Animation values for the "letter into mailbox" delivery ───────────
  const letterY = useRef(new Animated.Value(0)).current;
  const letterScale = useRef(new Animated.Value(1)).current;
  const letterRotate = useRef(new Animated.Value(0)).current;
  const letterOpacity = useRef(new Animated.Value(1)).current;
  const mailboxBounce = useRef(new Animated.Value(0)).current;

  const runDeliveryAnimation = useCallback(
    (): Promise<void> =>
      new Promise<void>((resolve) => {
        const direction = Math.random() > 0.5 ? 1 : -1;
        // Phase 1: the letter falls toward the mailbox while shrinking
        // (~520ms). Phase 2: a small mailbox bounce as it "swallows" the
        // letter (~180ms). Total ~700ms — short enough to feel snappy.
        Animated.sequence([
          Animated.parallel([
            Animated.timing(letterY, {
              toValue: SCREEN_H * 0.32,
              duration: 520,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(letterScale, {
              toValue: 0.18,
              duration: 520,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(letterRotate, {
              toValue: direction * 12,
              duration: 520,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(letterOpacity, {
              toValue: 0,
              duration: 520,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.spring(mailboxBounce, {
            toValue: 1,
            friction: 5,
            tension: 140,
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      }),
    [letterY, letterScale, letterRotate, letterOpacity, mailboxBounce]
  );

  // ── Stage handlers ────────────────────────────────────────────────────

  const handleSeal = () => {
    Keyboard.dismiss();
    if (!content.trim()) {
      Alert.alert('', '写一些字再封存吧～');
      return;
    }
    Haptics.selectionAsync();
    setStage('kind');
  };

  const handlePickKind = (kind: 'mailbox' | 'capsule') => {
    // Mailbox is server-capped at 500 chars (capsule at 1000). Catch the
    // length mismatch in the client so the user doesn't tap 次日达 and
    // bounce off a 400 only after the sealing animation kicks off.
    if (kind === 'mailbox' && content.trim().length > 500) {
      Alert.alert('', '次日达最多 500 字～\n这封超过了，要不寄择日达？');
      return;
    }
    Haptics.selectionAsync();
    if (kind === 'mailbox') {
      runSubmit('mailbox');
    } else {
      setStage('capsuleDetails');
    }
  };

  const runSubmit = useCallback(
    async (kind: 'mailbox' | 'capsule') => {
      if (submitting) return;
      setSubmitting(true);
      setStage('sending');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const animPromise = runDeliveryAnimation();
      let apiPromise: Promise<unknown>;
      if (kind === 'mailbox') {
        apiPromise = api.submitMailbox(content.trim());
      } else {
        apiPromise = api.createCapsule(
          content.trim(),
          computeFutureDate(daysAhead),
          recipient
        );
      }

      try {
        await Promise.all([animPromise, apiPromise]);
        // Letter shipped — clear the persisted draft so a fresh open shows
        // an empty page.
        await storage.clearWriteLetterDraft();
        setContent('');
        onClose();
      } catch (e: any) {
        Alert.alert('', e?.message || '寄送失败');
        // Roll back to the relevant stage so the user can retry.
        setStage(kind === 'mailbox' ? 'kind' : 'capsuleDetails');
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, content, daysAhead, recipient, runDeliveryAnimation, onClose]
  );

  // Pull-down / explicit cancel: ditch everything, close the modal.
  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  // ── Stage-specific renders ────────────────────────────────────────────

  const renderWriteStage = () => {
    // Addressee defaults to the partner's nickname (remark > name > "对方"),
    // unless the user has already chosen 给自己 in the capsule-details stage
    // and come back to edit. Signature is always the writer's own name.
    const addressee = recipient === 'self'
      ? (myName || '自己')
      : (partnerRemark || partnerName || '对方');
    const signature = myName || '我';
    const nowStamp = formatPostmark(new Date().toISOString(), myTz);

    return (
      <>
        <View style={styles.headerRow}>
          <Text style={styles.title}>写信</Text>
        </View>
        {/* Outer Pressable so tapping the gray modal bg around the paper
            also dismisses the keyboard. Inner Pressable on the paper does
            the same for the paper's padding (header / footer / count). */}
        <Pressable style={styles.bodyArea} onPress={Keyboard.dismiss}>
          <Pressable style={styles.letterPaper} onPress={Keyboard.dismiss}>
            <Text style={styles.letterAddress}>致 {addressee}：</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="写下你想说的话..."
              placeholderTextColor="rgba(92, 64, 51, 0.4)"
              multiline
              maxLength={1000}
              style={styles.letterBody}
              inputAccessoryViewID={Platform.OS === 'ios' ? KB_ACCESSORY_ID : undefined}
            />
            <View style={styles.letterFooter}>
              <Text style={styles.letterFooterTime}>{nowStamp}</Text>
              <Text style={styles.letterFooterSig}>—— {signature}</Text>
              <Text style={styles.letterCount}>{content.length} / 1000</Text>
            </View>
          </Pressable>
        </Pressable>
        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 16 }]}>
          <SpringPressable onPress={handleCancel} style={[styles.pill, styles.pillSecondary]}>
            <Text style={styles.pillSecondaryText}>不写了</Text>
          </SpringPressable>
          <SpringPressable onPress={handleSeal} style={[styles.pill, styles.pillPrimary]}>
            <Text style={styles.pillPrimaryText}>封存</Text>
          </SpringPressable>
        </View>

        {/* iOS keyboard accessory — fixed bar above the keyboard with a
            "完成" button. Gives the user a deterministic dismiss target
            regardless of where they're focused on the page. */}
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={KB_ACCESSORY_ID}>
            <View style={styles.kbBar}>
              <TouchableOpacity onPress={Keyboard.dismiss} style={styles.kbBarBtn} hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}>
                <Text style={styles.kbBarIcon}>⌄</Text>
                <Text style={styles.kbBarText}>完成</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </>
    );
  };

  const renderKindStage = () => (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.title}>送达方式</Text>
      </View>
      <View style={styles.bodyArea}>
        <View style={styles.sealedLetter}>
          <Text style={styles.sealedLetterText} numberOfLines={3}>
            {content.trim()}
          </Text>
          <View style={styles.sealStamp}>
            <Text style={styles.sealStampText}>已封存</Text>
          </View>
        </View>

        <View style={styles.kindOptions}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.kindCard}
            onPress={() => handlePickKind('mailbox')}
          >
            <Text style={styles.kindEmoji}>📮</Text>
            <Text style={styles.kindTitle}>次日达</Text>
            <Text style={styles.kindSub}>送到本场或下一场，对方很快收到</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.kindCard}
            onPress={() => handlePickKind('capsule')}
          >
            <Text style={styles.kindEmoji}>💌</Text>
            <Text style={styles.kindTitle}>择日达</Text>
            <Text style={styles.kindSub}>挑一天再送，可以寄给自己或对方</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 16 }]}>
        <SpringPressable onPress={() => setStage('write')} style={[styles.pill, styles.pillSecondary]}>
          <Text style={styles.pillSecondaryText}>再改改</Text>
        </SpringPressable>
      </View>
    </>
  );

  const renderCapsuleDetailsStage = () => (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.title}>择日达</Text>
      </View>
      <View style={styles.bodyArea}>
        <Text style={styles.fieldLabel}>什么时候送达？</Text>
        <View style={styles.presetGrid}>
          {DAY_PRESETS.map(p => {
            const active = daysAhead === p.days;
            return (
              <TouchableOpacity
                key={p.days}
                activeOpacity={0.85}
                style={[styles.presetChip, active && styles.presetChipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setDaysAhead(p.days);
                }}
              >
                <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.dateHint}>{formatPickerDate(daysAhead)}</Text>

        <View style={styles.fieldSpacer} />

        <Text style={styles.fieldLabel}>寄给谁？</Text>
        <View style={styles.recipientRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.recipientCard, recipient === 'self' && styles.recipientCardActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setRecipient('self');
            }}
          >
            <Text style={styles.recipientEmoji}>🪞</Text>
            <Text style={[styles.recipientText, recipient === 'self' && styles.recipientTextActive]}>
              给自己
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.recipientCard, recipient === 'partner' && styles.recipientCardActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setRecipient('partner');
            }}
          >
            <Text style={styles.recipientEmoji}>💕</Text>
            <Text style={[styles.recipientText, recipient === 'partner' && styles.recipientTextActive]}>
              {partnerName ? `给${partnerName}` : '给对方'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 16 }]}>
        <SpringPressable onPress={() => setStage('kind')} style={[styles.pill, styles.pillSecondary]}>
          <Text style={styles.pillSecondaryText}>返回</Text>
        </SpringPressable>
        <SpringPressable
          onPress={() => runSubmit('capsule')}
          style={[styles.pill, styles.pillPrimary]}
        >
          <Text style={styles.pillPrimaryText}>投递</Text>
        </SpringPressable>
      </View>
    </>
  );

  const renderSendingStage = () => {
    const rotateInterp = letterRotate.interpolate({
      inputRange: [-360, 360],
      outputRange: ['-360deg', '360deg'],
    });
    const mailboxScale = mailboxBounce.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 1.18, 1],
    });
    return (
      <View style={styles.sendingArea}>
        <Animated.View
          style={[
            styles.flyingLetter,
            {
              opacity: letterOpacity,
              transform: [
                { translateY: letterY },
                { scale: letterScale },
                { rotate: rotateInterp },
              ],
            },
          ]}
        >
          <Text style={styles.flyingLetterText} numberOfLines={2}>
            {content.trim()}
          </Text>
        </Animated.View>
        <Animated.Text
          style={[styles.mailboxIcon, { transform: [{ scale: mailboxScale }] }]}
        >
          📮
        </Animated.Text>
        <Text style={styles.sendingHint}>寄出中...</Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        {stage === 'write' && renderWriteStage()}
        {stage === 'kind' && renderKindStage()}
        {stage === 'capsuleDetails' && renderCapsuleDetailsStage()}
        {stage === 'sending' && renderSendingStage()}
      </View>
    </Modal>
  );
}

const PAPER = '#FAF6E8';
const INK = '#3D2A19';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 14,
    paddingBottom: 10,
    minHeight: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  bodyArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // ── Letter paper (write stage) ─────────────────────────────────────────
  letterPaper: {
    flex: 1,
    backgroundColor: PAPER,
    borderRadius: 4,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  // Salutation at the top of the page — "致 X：". Keeps the formal letter
  // shape; the address is filled in from the user's data, not editable.
  letterAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: INK,
    marginBottom: 14,
    fontStyle: 'italic',
  },
  letterBody: {
    flex: 1,
    fontSize: 16,
    lineHeight: 26,
    color: INK,
    textAlignVertical: 'top',
    fontStyle: 'italic',
    fontWeight: '500',
  },
  // Footer block with time + signature + char count. Right-aligned to
  // match traditional letter-bottom signatures.
  letterFooter: {
    alignItems: 'flex-end',
    marginTop: 10,
    gap: 2,
  },
  letterFooterTime: {
    fontSize: 12,
    color: '#8B7355',
    fontVariant: ['tabular-nums'],
    fontStyle: 'italic',
  },
  letterFooterSig: {
    fontSize: 14,
    color: INK,
    fontStyle: 'italic',
    fontWeight: '500',
    marginTop: 2,
  },
  letterCount: {
    fontSize: 11,
    color: '#8B7355',
    marginTop: 4,
  },

  // ── iOS keyboard accessory bar ─────────────────────────────────────────
  kbBar: {
    backgroundColor: '#F2F2F7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  kbBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kbBarIcon: {
    fontSize: 18,
    color: '#0A84FF',
    lineHeight: 20,
  },
  kbBarText: {
    fontSize: 15,
    color: '#0A84FF',
    fontWeight: '500',
  },

  // ── Sealed letter card (kind stage preview) ────────────────────────────
  sealedLetter: {
    backgroundColor: PAPER,
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  sealedLetterText: {
    fontSize: 14,
    lineHeight: 22,
    color: INK,
    fontStyle: 'italic',
  },
  sealStamp: {
    position: 'absolute',
    top: -10,
    right: -8,
    backgroundColor: '#A02020',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    transform: [{ rotate: '-8deg' }],
  },
  sealStampText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // ── Kind picker ────────────────────────────────────────────────────────
  kindOptions: {
    gap: 14,
  },
  kindCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  kindEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  kindTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  kindSub: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
  },

  // ── Capsule details (date + recipient) ─────────────────────────────────
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 10,
  },
  fieldSpacer: {
    height: 24,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipActive: {
    backgroundColor: COLORS.kiss,
    borderColor: COLORS.kiss,
  },
  presetChipText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  presetChipTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  dateHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 8,
    textAlign: 'center',
  },
  recipientRow: {
    flexDirection: 'row',
    gap: 12,
  },
  recipientCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 18,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  recipientCardActive: {
    borderColor: COLORS.kiss,
    backgroundColor: '#FFF0F3',
  },
  recipientEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  recipientText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  recipientTextActive: {
    color: COLORS.kiss,
  },

  // ── Sending animation ──────────────────────────────────────────────────
  sendingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  flyingLetter: {
    backgroundColor: PAPER,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 4,
    width: 220,
    minHeight: 100,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  flyingLetterText: {
    fontSize: 14,
    lineHeight: 22,
    color: INK,
    fontStyle: 'italic',
  },
  mailboxIcon: {
    fontSize: 80,
    marginTop: 60,
  },
  sendingHint: {
    marginTop: 20,
    fontSize: 13,
    color: COLORS.textLight,
  },

  // ── Toolbar ────────────────────────────────────────────────────────────
  toolbar: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingTop: 12,
  },
  pill: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
    minWidth: 110,
    alignItems: 'center',
  },
  pillPrimary: {
    backgroundColor: COLORS.kiss,
  },
  pillSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillPrimaryText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  pillSecondaryText: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: '600',
  },
});
