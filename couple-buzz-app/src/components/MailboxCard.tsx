import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { api, MailboxResponse } from '../services/api';

export default function MailboxCard() {
  const [data, setData] = useState<MailboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archive, setArchive] = useState<{ week_key: string; my_content: string | null; partner_content: string | null }[]>([]);

  // Seal animation drivers
  const letterOpacity = useRef(new Animated.Value(1)).current;
  const letterTranslateY = useRef(new Animated.Value(0)).current;
  const letterScale = useRef(new Animated.Value(1)).current;
  const envelopeOpacity = useRef(new Animated.Value(0)).current;
  const envelopeScale = useRef(new Animated.Value(0.4)).current;
  const stampRotate = useRef(new Animated.Value(0)).current;
  const stampOpacity = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const result = await api.getMailbox();
      setData(result);
      setContent(result.my_message ?? '');
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const playSealAnimation = () =>
    new Promise<void>((resolve) => {
      Animated.sequence([
        // Letter folds in
        Animated.parallel([
          Animated.timing(letterOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.timing(letterTranslateY, { toValue: -32, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(letterScale, { toValue: 0.6, duration: 350, useNativeDriver: true }),
        ]),
        // Envelope pops in
        Animated.parallel([
          Animated.timing(envelopeOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.spring(envelopeScale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        ]),
        // Stamp drops on
        Animated.parallel([
          Animated.timing(stampOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(stampRotate, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        ]),
        Animated.delay(450),
      ]).start(() => resolve());
    });

  const handleSubmit = async () => {
    if (!content.trim() || submitting || sealing) return;
    setSubmitting(true);
    try {
      await api.submitMailbox(content.trim());
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert('投递失败', e?.message || '请稍后再试');
      return;
    }
    setSubmitting(false);
    setSealing(true);
    await playSealAnimation();
    await load();
    // Reset for next week
    letterOpacity.setValue(1);
    letterTranslateY.setValue(0);
    letterScale.setValue(1);
    envelopeOpacity.setValue(0);
    envelopeScale.setValue(0.4);
    stampOpacity.setValue(0);
    stampRotate.setValue(0);
    setSealing(false);
  };

  const handleLoadArchive = async () => {
    setShowArchive(!showArchive);
    if (!showArchive && archive.length === 0) {
      try {
        const result = await api.getMailboxArchive(10);
        setArchive(result.weeks);
      } catch {}
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  if (!data) return null;

  const { phase, my_message, partner_message, partner_wrote, reveal_at } = data;

  const revealDate = new Date(reveal_at);
  const now = new Date();
  const msLeft = Math.max(0, revealDate.getTime() - now.getTime());
  const hoursLeft = Math.ceil(msLeft / 3600000);

  const stampRotateInterpolate = stampRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-45deg', '-12deg'],
  });

  return (
    <View style={styles.card}>
      <Text style={styles.header}>树洞信箱 📮</Text>

      {phase === 'revealed' ? (
        <View style={styles.revealContainer}>
          <View style={styles.messageBox}>
            <Text style={styles.messageLabel}>我写的</Text>
            <Text style={styles.messageText}>{my_message || '这周没有写'}</Text>
          </View>
          <View style={styles.messageBox}>
            <Text style={styles.messageLabel}>ta 写的</Text>
            <Text style={styles.messageText}>
              {partner_wrote === false ? 'ta 这周没有写' : (partner_message || 'ta 这周没有写')}
            </Text>
          </View>
        </View>
      ) : my_message ? (
        // Sealed state: read-only, no edit controls
        <View style={styles.sealedContainer}>
          <View style={styles.sealedEnvelope}>
            <Text style={styles.sealedEnvelopeIcon}>💌</Text>
          </View>
          <Text style={styles.sealedTitle}>本周的信已封存</Text>
          <Text style={styles.sealedSubtitle}>
            {hoursLeft > 0 ? `${hoursLeft} 小时后揭晓` : '即将揭晓'}
          </Text>
          <View style={styles.sealedPreview}>
            <Text style={styles.sealedPreviewText} numberOfLines={3}>
              {my_message}
            </Text>
          </View>
        </View>
      ) : (
        // Writing state
        <View>
          <Text style={styles.prompt}>写一句想说但没说出口的话吧～</Text>

          {sealing ? (
            <View style={styles.animStage}>
              <Animated.View
                style={[
                  styles.animLetter,
                  {
                    opacity: letterOpacity,
                    transform: [{ translateY: letterTranslateY }, { scale: letterScale }],
                  },
                ]}
              >
                <Text style={styles.animLetterText} numberOfLines={4}>
                  {content}
                </Text>
              </Animated.View>
              <Animated.View
                style={[
                  styles.animEnvelope,
                  {
                    opacity: envelopeOpacity,
                    transform: [{ scale: envelopeScale }],
                  },
                ]}
              >
                <Text style={styles.animEnvelopeIcon}>✉️</Text>
                <Animated.Text
                  style={[
                    styles.animStamp,
                    {
                      opacity: stampOpacity,
                      transform: [{ rotate: stampRotateInterpolate }],
                    },
                  ]}
                >
                  SEALED
                </Animated.Text>
              </Animated.View>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={content}
                onChangeText={setContent}
                placeholder="写点什么给 ta..."
                placeholderTextColor={COLORS.textLight}
                maxLength={500}
                multiline
                editable={!submitting}
              />
              <View style={styles.charCount}>
                <Text style={styles.charCountText}>{content.length}/500</Text>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, (!content.trim() || submitting) && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={!content.trim() || submitting}
                activeOpacity={0.8}
              >
                <Text style={styles.submitText}>{submitting ? '投递中...' : '封好信 ✉️'}</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>提交后不能修改哦</Text>
              <Text style={styles.countdown}>
                {hoursLeft > 0 ? `周日揭晓 · 还有 ${hoursLeft} 小时` : '即将揭晓'}
              </Text>
            </>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.archiveLink} onPress={handleLoadArchive}>
        <Text style={styles.archiveLinkText}>{showArchive ? '收起历史' : '查看历史'}</Text>
      </TouchableOpacity>

      {showArchive && archive.length > 0 && (
        <View style={styles.archiveList}>
          {archive.map((week) => (
            <View key={week.week_key} style={styles.archiveItem}>
              <Text style={styles.archiveWeek}>{week.week_key}</Text>
              <Text style={styles.archiveContent}>我: {week.my_content || '未写'}</Text>
              <Text style={styles.archiveContent}>ta: {week.partner_content || '未写'}</Text>
            </View>
          ))}
        </View>
      )}
      {showArchive && archive.length === 0 && (
        <Text style={styles.archiveEmpty}>还没有历史记录</Text>
      )}
    </View>
  );
}

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
  prompt: {
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  charCountText: {
    fontSize: 12,
    color: COLORS.textLight,
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
  hint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 8,
  },
  countdown: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
  // Sealed (post-submit, pre-reveal) read-only state
  sealedContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  sealedEnvelope: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sealedEnvelopeIcon: {
    fontSize: 40,
  },
  sealedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 12,
  },
  sealedSubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
  },
  sealedPreview: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sealedPreviewText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  // Seal animation stage
  animStage: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  animLetter: {
    position: 'absolute',
    width: '85%',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  animLetterText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  animEnvelope: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  animEnvelopeIcon: {
    fontSize: 48,
  },
  animStamp: {
    position: 'absolute',
    right: -14,
    top: -10,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.kiss,
    borderWidth: 2,
    borderColor: COLORS.kiss,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  revealContainer: {
    gap: 12,
  },
  messageBox: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.kiss,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  archiveLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  archiveLinkText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  archiveList: {
    marginTop: 12,
    gap: 10,
  },
  archiveItem: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  archiveWeek: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 6,
  },
  archiveContent: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  archiveEmpty: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 8,
  },
});
