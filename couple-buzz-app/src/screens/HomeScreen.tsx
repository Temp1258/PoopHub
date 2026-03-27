import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Dimensions,
} from 'react-native';
import { COLORS, ACTIONS } from '../constants';
import { api } from '../services/api';
import { storage } from '../utils/storage';
import ActionButton from '../components/ActionButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_SIZE = (SCREEN_WIDTH - 80) / 2; // 2 columns with gaps

interface Props {
  partnerName: string;
}

export default function HomeScreen({ partnerName }: Props) {
  const [disabledButtons, setDisabledButtons] = useState<Record<string, boolean>>({});
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;
  const [toastText, setToastText] = useState('');

  const showToast = useCallback((text: string) => {
    setToastText(text);
    RNAnimated.sequence([
      RNAnimated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      RNAnimated.delay(1500),
      RNAnimated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [toastOpacity]);

  const handleAction = useCallback(async (actionType: string) => {
    // Debounce: disable button for 3 seconds
    setDisabledButtons((prev) => ({ ...prev, [actionType]: true }));
    setTimeout(() => {
      setDisabledButtons((prev) => ({ ...prev, [actionType]: false }));
    }, 3000);

    try {
      const userId = await storage.getUserId();
      if (!userId) return;

      await api.sendAction(userId, actionType);
      showToast(`已告诉 ${partnerName} 啦～`);
    } catch (error) {
      showToast('发送失败，请重试');
    }
  }, [partnerName, showToast]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>couple buzz 💕</Text>
        <Text style={styles.subtitle}>与 {partnerName} 已连接</Text>
      </View>

      <View style={styles.grid}>
        {ACTIONS.map((action) => (
          <View key={action.type} style={[styles.buttonWrapper, { width: BUTTON_SIZE }]}>
            <ActionButton
              action={action}
              onPress={handleAction}
              disabled={!!disabledButtons[action.type]}
            />
          </View>
        ))}
      </View>

      <RNAnimated.View style={[styles.toast, { opacity: toastOpacity }]}>
        <Text style={styles.toastText}>{toastText}</Text>
      </RNAnimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
    gap: 20,
    paddingHorizontal: 30,
  },
  buttonWrapper: {
    aspectRatio: 1,
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.85)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  toastText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '500',
  },
});
