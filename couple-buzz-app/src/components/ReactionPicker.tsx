import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { COLORS, ACTIONS } from '../constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EMOJI_SIZE = Math.floor((SCREEN_WIDTH * 0.72 - 40) / 7);

interface Props {
  onSelect: (actionType: string) => void;
  onClose: () => void;
}

export default function ReactionPicker({ onSelect, onClose }: Props) {
  return (
    <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
      <TouchableOpacity style={styles.container} activeOpacity={1}>
        <View style={styles.grid}>
          {ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.type}
              style={styles.emojiButton}
              onPress={() => onSelect(action.type)}
            >
              <Text style={styles.emoji}>{action.emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    width: '80%',
    maxWidth: 320,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  emojiButton: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  emoji: {
    fontSize: 22,
  },
});
