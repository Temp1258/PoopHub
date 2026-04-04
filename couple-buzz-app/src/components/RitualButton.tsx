import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, ACTION_EMOJI } from '../constants';
import { api, RitualStatusResponse } from '../services/api';

export default function RitualButton() {
  const [status, setStatus] = useState<RitualStatusResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    try {
      const result = await api.getRitualStatus();
      setStatus(result);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  // Pulse animation for waiting state
  useEffect(() => {
    if (!status) return;
    const s = status;
    const isWaiting =
      (s.morning.my_completed && !s.morning.both_completed) ||
      (s.evening.my_completed && !s.evening.both_completed);

    if (isWaiting) {
      pulseAnim.stopAnimation();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }

    return () => { pulseAnim.stopAnimation(); };
  }, [status, pulseAnim]);

  if (!status) return null;

  const { local_hour, morning, evening, daily_recap } = status;
  const showMorning = local_hour >= 4 && local_hour <= 12;
  const showEvening = local_hour >= 18 || local_hour < 4;

  // Determine what to show
  const isMorningBoth = morning.both_completed;
  const isEveningBoth = evening.both_completed;

  const handleSubmit = async (type: 'morning' | 'evening') => {
    setSubmitting(true);
    try {
      await api.submitRitual(type);
      await load();
    } catch (e: any) {
      Alert.alert('', e.message || '操作失败');
    }
    setSubmitting(false);
  };

  // Both completed evening → show recap
  if (isEveningBoth && daily_recap && showEvening) {
    return (
      <View style={styles.container}>
        <View style={styles.completedCard}>
          <Text style={styles.completedEmoji}>🌙✨</Text>
          <Text style={styles.completedText}>你们都说了晚安！</Text>
          <Text style={styles.recapText}>
            今天互动了 {daily_recap.total_interactions} 次
            {daily_recap.top_action ? ` · 最爱 ${ACTION_EMOJI[daily_recap.top_action] || ''}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  // Both completed morning
  if (isMorningBoth && showMorning) {
    return (
      <View style={styles.container}>
        <View style={styles.completedCard}>
          <Text style={styles.completedEmoji}>🌅💪</Text>
          <Text style={styles.completedText}>你们都说了早安！新的一天加油～</Text>
        </View>
      </View>
    );
  }

  // Show morning or evening button
  if (showMorning) {
    if (morning.my_completed) {
      return (
        <View style={styles.container}>
          <Animated.View style={[styles.waitingCard, { opacity: pulseAnim }]}>
            <Text style={styles.waitingEmoji}>🌅</Text>
            <Text style={styles.waitingText}>等待 ta 的早安...</Text>
          </Animated.View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.button, styles.morningButton, submitting && styles.buttonDisabled]}
          onPress={() => handleSubmit('morning')}
          disabled={submitting}
        >
          <Text style={styles.buttonEmoji}>🌅</Text>
          <Text style={styles.buttonText}>{submitting ? '...' : '说早安'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showEvening) {
    if (evening.my_completed) {
      return (
        <View style={styles.container}>
          <Animated.View style={[styles.waitingCard, { opacity: pulseAnim }]}>
            <Text style={styles.waitingEmoji}>🌙</Text>
            <Text style={styles.waitingText}>等待 ta 的晚安...</Text>
          </Animated.View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.button, styles.eveningButton, submitting && styles.buttonDisabled]}
          onPress={() => handleSubmit('evening')}
          disabled={submitting}
        >
          <Text style={styles.buttonEmoji}>🌙</Text>
          <Text style={styles.buttonText}>{submitting ? '...' : '说晚安'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Between 13-17: no ritual button shown
  return null;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 16,
    gap: 8,
  },
  morningButton: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  eveningButton: {
    backgroundColor: '#E8EAF6',
    borderWidth: 1,
    borderColor: '#C5CAE9',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonEmoji: {
    fontSize: 22,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  waitingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  waitingEmoji: {
    fontSize: 18,
  },
  waitingText: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  completedCard: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  completedEmoji: {
    fontSize: 24,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 4,
  },
  recapText: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
});
