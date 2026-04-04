import React, { useState, useCallback } from 'react';
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
import { api, MailboxResponse } from '../services/api';

export default function MailboxCard() {
  const [data, setData] = useState<MailboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archive, setArchive] = useState<{ week_key: string; my_content: string | null; partner_content: string | null }[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await api.getMailbox();
      setData(result);
      if (result.my_message) setContent(result.my_message);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await api.submitMailbox(content.trim());
      await load();
    } catch {}
    setSubmitting(false);
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

  // Compute countdown to reveal
  const revealDate = new Date(reveal_at);
  const now = new Date();
  const hoursLeft = Math.max(0, Math.ceil((revealDate.getTime() - now.getTime()) / 3600000));

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
      ) : (
        <View>
          {my_message ? (
            <View>
              <View style={styles.sealedBox}>
                <Text style={styles.sealedEmoji}>✉️</Text>
                <Text style={styles.sealedText}>信已写好</Text>
              </View>
              <Text style={styles.countdown}>
                {hoursLeft > 0 ? `${hoursLeft} 小时后揭晓` : '即将揭晓'}
              </Text>
              <TextInput
                style={styles.input}
                value={content}
                onChangeText={setContent}
                placeholder="修改你的信..."
                placeholderTextColor={COLORS.textLight}
                maxLength={500}
                multiline
              />
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                <Text style={styles.submitText}>{submitting ? '保存中...' : '更新'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.prompt}>写一句想说但没说出口的话吧～</Text>
              <TextInput
                style={styles.input}
                value={content}
                onChangeText={setContent}
                placeholder="写点什么给 ta..."
                placeholderTextColor={COLORS.textLight}
                maxLength={500}
                multiline
              />
              <View style={styles.charCount}>
                <Text style={styles.charCountText}>{content.length}/500</Text>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, (!content.trim() || submitting) && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={!content.trim() || submitting}
              >
                <Text style={styles.submitText}>{submitting ? '提交中...' : '封好信 ✉️'}</Text>
              </TouchableOpacity>
              <Text style={styles.countdown}>
                {hoursLeft > 0 ? `周日揭晓 · 还有 ${hoursLeft} 小时` : '即将揭晓'}
              </Text>
            </View>
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
  countdown: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 8,
  },
  sealedBox: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  sealedEmoji: {
    fontSize: 32,
  },
  sealedText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
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
