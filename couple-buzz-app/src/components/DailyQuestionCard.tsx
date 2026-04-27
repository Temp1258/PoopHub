import React, { useState, useCallback, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';
import { api, DailyQuestionResponse } from '../services/api';
import { useBeijingMidnightCountdown } from '../utils/countdown';

const URGE_COOLDOWN_MS = 30 * 1000;

const DailyQuestionCard = forwardRef<{ reload: () => Promise<void> }>((_props, ref) => {
  const [data, setData] = useState<DailyQuestionResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [urging, setUrging] = useState(false);
  const [reacting, setReacting] = useState(false);
  const lastUrgeRef = useRef(0);
  const cd = useBeijingMidnightCountdown();

  const load = useCallback(async () => {
    try {
      const result = await api.getDailyQuestion();
      setData(result);
      // Always sync — when the question rolls past midnight, my_answer
      // is null and the input must clear, not keep yesterday's draft.
      setAnswer(result.my_answer || '');
    } catch {}
    setLoading(false);
  }, []);

  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    setSubmitting(true);
    try {
      const result = await api.submitDailyAnswer(answer.trim());
      setData((prev) =>
        prev
          ? {
              ...prev,
              my_answer: answer.trim(),
              both_answered: result.both_answered,
              partner_answer: result.partner_answer,
            }
          : prev
      );
    } catch {}
    setSubmitting(false);
  };

  const handleUrge = useCallback(async () => {
    const now = Date.now();
    if (now - lastUrgeRef.current < URGE_COOLDOWN_MS) {
      const left = Math.ceil((URGE_COOLDOWN_MS - (now - lastUrgeRef.current)) / 1000);
      Alert.alert('', `稍等 ${left} 秒再催 ta～`);
      return;
    }
    setUrging(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.urge('question');
      lastUrgeRef.current = Date.now();
      Alert.alert('', '已经催 ta 了 ⏰');
    } catch (e: any) {
      Alert.alert('', e.message || '催促失败');
    } finally {
      setUrging(false);
    }
  }, []);

  // Cooldown clock just to redraw button label every second
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const cooldownLeft = Math.max(0, URGE_COOLDOWN_MS - (Date.now() - lastUrgeRef.current));
  const inCooldown = cooldownLeft > 0;

  const handleReact = useCallback(async (reaction: 'up' | 'down') => {
    if (reacting) return;
    // One-shot guard: if already reacted, no-op (UI also disables)
    if (data?.my_reaction_to_partner) return;
    setReacting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Optimistic update
    setData(prev => prev ? { ...prev, my_reaction_to_partner: reaction } : prev);
    try {
      await api.dailyReaction('question', reaction);
    } catch (e: any) {
      // Revert on failure
      load();
      Alert.alert('', e.message || '操作失败');
    } finally {
      setReacting(false);
    }
  }, [reacting, data?.my_reaction_to_partner, load]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  if (!data) return null;

  const { question, my_answer, partner_answer, both_answered, my_reaction_to_partner } = data;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>每日问答</Text>
      <Text style={styles.question}>{question}</Text>

      {both_answered ? (
        <View style={styles.reveal}>
          <View style={styles.answerBox}>
            <Text style={styles.answerLabel}>我的答案</Text>
            <Text style={styles.answerText}>{my_answer}</Text>
          </View>
          <View style={styles.answerBox}>
            <Text style={styles.answerLabel}>ta 的答案</Text>
            <Text style={styles.answerText}>{partner_answer}</Text>
            {my_reaction_to_partner ? (
              <View style={styles.reactedBlock}>
                <Text style={styles.reactedEmoji}>
                  {my_reaction_to_partner === 'up' ? '👍' : '👎'}
                </Text>
                <Text style={styles.reactedText}>已评价（不可修改）</Text>
              </View>
            ) : (
              <View style={styles.reactRow}>
                <TouchableOpacity
                  style={[styles.reactBtn, styles.reactUp]}
                  onPress={() => handleReact('up')}
                  disabled={reacting}
                >
                  <Text style={styles.reactEmoji}>👍</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reactBtn, styles.reactDown]}
                  onPress={() => handleReact('down')}
                  disabled={reacting}
                >
                  <Text style={styles.reactEmoji}>👎</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ) : my_answer ? (
        <View>
          <View style={styles.myAnswerPreview}>
            <Text style={styles.myAnswerLabel}>我的答案</Text>
            <Text style={styles.myAnswerText}>{my_answer}</Text>
          </View>
          <Text style={styles.waiting}>等待 ta 的答案...</Text>
          <TouchableOpacity
            style={[styles.urgeBtn, (urging || inCooldown) && styles.urgeBtnDisabled]}
            onPress={handleUrge}
            disabled={urging || inCooldown}
          >
            <Text style={styles.urgeText}>
              {urging ? '催促中...' : inCooldown ? `${Math.ceil(cooldownLeft / 1000)}s 后可再催` : '⏰ 快答！'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <TextInput
            style={styles.input}
            value={answer}
            onChangeText={setAnswer}
            placeholder="写下你的答案..."
            placeholderTextColor={COLORS.textLight}
            maxLength={200}
            multiline
          />
          <TouchableOpacity
            style={[styles.submitButton, (!answer.trim() || submitting) && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={!answer.trim() || submitting}
          >
            <Text style={styles.submitText}>
              {submitting ? '提交中...' : '提交'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.refreshHint}>
        {cd.done ? '即将刷新' : `距下次刷新 ${cd.hh}:${cd.mm}:${cd.ss}`}
      </Text>
    </View>
  );
});

export default DailyQuestionCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 12,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 26,
    marginBottom: 16,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  submitButton: {
    height: 44,
    backgroundColor: COLORS.kiss,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  myAnswerPreview: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  myAnswerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 4,
  },
  myAnswerText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  waiting: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 16,
  },
  urgeBtn: {
    height: 44,
    backgroundColor: COLORS.kiss,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  urgeBtnDisabled: {
    opacity: 0.4,
  },
  urgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  reveal: {
    gap: 12,
  },
  answerBox: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  answerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.kiss,
    marginBottom: 4,
  },
  answerText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  reactRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  reactBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  reactUp: {
    borderColor: '#B8E6CF',
    backgroundColor: '#F0FBF5',
  },
  reactDown: {
    borderColor: '#FFC2C2',
    backgroundColor: '#FFF0F0',
  },
  reactEmoji: {
    fontSize: 20,
  },
  reactedBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
    borderRadius: 10,
  },
  reactedEmoji: {
    fontSize: 22,
  },
  reactedText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  refreshHint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 12,
  },
});
