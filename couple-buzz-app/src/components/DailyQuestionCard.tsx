import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { api, DailyQuestionResponse } from '../services/api';
import { useBeijingMidnightCountdown } from '../utils/countdown';

const DailyQuestionCard = forwardRef<{ reload: () => Promise<void> }>((_props, ref) => {
  const [data, setData] = useState<DailyQuestionResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const cd = useBeijingMidnightCountdown();

  const load = useCallback(async () => {
    try {
      const result = await api.getDailyQuestion();
      setData(result);
      if (result.my_answer) setAnswer(result.my_answer);
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

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  if (!data) return null;

  const { question, my_answer, partner_answer, both_answered } = data;

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
          </View>
        </View>
      ) : my_answer ? (
        <View>
          <View style={styles.myAnswerPreview}>
            <Text style={styles.myAnswerLabel}>我的答案</Text>
            <Text style={styles.myAnswerText}>{my_answer}</Text>
          </View>
          <Text style={styles.waiting}>等待 ta 的答案...</Text>
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
  refreshHint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 12,
  },
});
