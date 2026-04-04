import React, { useState, useCallback } from 'react';
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
import { COLORS } from '../constants';
import { api, WeeklyChallengeResponse } from '../services/api';

export default function WeeklyChallengeCard() {
  const [data, setData] = useState<WeeklyChallengeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getWeeklyChallenge();
      setData(result);
      if (result.my_response) setResponse(result.my_response);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }, [load])
  );

  const handleSubmitResponse = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    try {
      await api.submitChallengeResponse(response.trim());
      await load();
    } catch (e: any) {
      Alert.alert('', e.message || '提交失败');
    }
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

  const { challenge, progress, target, status, couple_points } = data;
  const pct = Math.min(progress / target, 1);
  const isCustom = challenge.type === 'custom_response';
  const isCompleted = status === 'completed';

  const diffColor = challenge.difficulty === 'easy' ? '#4CD964' : challenge.difficulty === 'medium' ? '#FFB800' : '#FF6B6B';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>本周挑战 🎯</Text>
        <View style={[styles.diffBadge, { backgroundColor: diffColor + '20', borderColor: diffColor }]}>
          <Text style={[styles.diffText, { color: diffColor }]}>
            {challenge.difficulty === 'easy' ? '简单' : challenge.difficulty === 'medium' ? '中等' : '困难'}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{challenge.title}</Text>
      <Text style={styles.description}>{challenge.description}</Text>

      {!isCustom && (
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${pct * 100}%` }, isCompleted && styles.progressCompleted]} />
          </View>
          <Text style={styles.progressText}>
            {isCompleted ? '✅ 已完成！' : `${progress}/${target}`}
          </Text>
        </View>
      )}

      {isCustom && !isCompleted && (
        <View style={styles.responseSection}>
          {data.my_response ? (
            <View style={styles.responsePreview}>
              <Text style={styles.responseLabel}>我的回复</Text>
              <Text style={styles.responseText}>{data.my_response}</Text>
            </View>
          ) : (
            <View>
              <TextInput
                style={styles.input}
                value={response}
                onChangeText={setResponse}
                placeholder="写下你的回答..."
                placeholderTextColor={COLORS.textLight}
                maxLength={500}
                multiline
              />
              <TouchableOpacity
                style={[styles.submitBtn, (!response.trim() || submitting) && styles.submitDisabled]}
                onPress={handleSubmitResponse}
                disabled={!response.trim() || submitting}
              >
                <Text style={styles.submitText}>{submitting ? '提交中...' : '提交'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isCustom && isCompleted && (
        <Text style={styles.completedText}>✅ 挑战完成！</Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.reward}>🏆 +{challenge.reward_points}分</Text>
        <Text style={styles.points}>累计 {couple_points} 分</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  header: { fontSize: 13, fontWeight: '600', color: COLORS.textLight },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  diffText: { fontSize: 11, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  description: { fontSize: 14, color: COLORS.textLight, lineHeight: 20, marginBottom: 14 },
  progressSection: { marginBottom: 12 },
  progressBar: { height: 8, backgroundColor: COLORS.background, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.kiss, borderRadius: 4, minWidth: 2 },
  progressCompleted: { backgroundColor: '#4CD964' },
  progressText: { fontSize: 13, color: COLORS.textLight, marginTop: 4, textAlign: 'right' },
  responseSection: { marginBottom: 12 },
  responsePreview: { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  responseLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textLight, marginBottom: 4 },
  responseText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  input: { backgroundColor: COLORS.background, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, minHeight: 60, textAlignVertical: 'top' },
  submitBtn: { height: 40, backgroundColor: COLORS.kiss, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  submitDisabled: { opacity: 0.4 },
  submitText: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  completedText: { fontSize: 15, fontWeight: '600', color: '#4CD964', textAlign: 'center', marginBottom: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  reward: { fontSize: 13, color: COLORS.kiss, fontWeight: '600' },
  points: { fontSize: 13, color: COLORS.textLight },
});
