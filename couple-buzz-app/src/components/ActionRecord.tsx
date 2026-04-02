import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, ACTION_EMOJI } from '../constants';

interface Props {
  userName: string;
  actionType: string;
  time: string;
  partnerTime?: string;
  isMine: boolean;
  remark?: string;
  onPress?: () => void;
}

export default function ActionRecord({ userName, actionType, time, partnerTime, isMine, remark, onPress }: Props) {
  const emoji = ACTION_EMOJI[actionType] || '?';
  const displayName = !isMine && remark ? `${userName} (${remark})` : userName;

  return (
    <View style={[styles.container, isMine ? styles.mine : styles.theirs]}>
      <TouchableOpacity
        style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.info}>
          <Text style={styles.name}>{displayName}</Text>
          {partnerTime && !isMine ? (
            <Text style={styles.time}>
              对方 {partnerTime} · 我 {time}
            </Text>
          ) : (
            <Text style={styles.time}>{time}</Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  mine: {
    justifyContent: 'flex-end',
  },
  theirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '75%',
  },
  bubbleMine: {
    backgroundColor: '#FFE4E9',
  },
  bubbleTheirs: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emoji: {
    fontSize: 24,
    marginRight: 10,
  },
  info: {
    flexShrink: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  time: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
});
