import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, ACTION_EMOJI } from '../constants';

interface Props {
  userName: string;
  actionType: string;
  time: string;
  isMine: boolean;
}

export default function ActionRecord({ userName, actionType, time, isMine }: Props) {
  const emoji = ACTION_EMOJI[actionType] || '?';

  return (
    <View style={[styles.container, isMine ? styles.mine : styles.theirs]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.info}>
          <Text style={styles.name}>{userName}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
      </View>
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
