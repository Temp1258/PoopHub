import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { COLORS, ACTIONS } from '../constants';
import { api } from '../services/api';
import ActionButton from '../components/ActionButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_SIZE = (SCREEN_WIDTH - 80) / 2;

interface Props {
  partnerName: string;
  onUnpair: () => void;
  onLogout: () => void;
}

export default function HomeScreen({ partnerName, onUnpair, onLogout }: Props) {
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
    setDisabledButtons((prev) => ({ ...prev, [actionType]: true }));
    setTimeout(() => {
      setDisabledButtons((prev) => ({ ...prev, [actionType]: false }));
    }, 3000);

    try {
      await api.sendAction(actionType);
      showToast(`已告诉 ${partnerName} 啦～`);
    } catch (error) {
      showToast('发送失败，请重试');
    }
  }, [partnerName, showToast]);

  const showSettings = useCallback(() => {
    Alert.alert('设置', '', [
      {
        text: '解除配对',
        style: 'destructive',
        onPress: () => {
          Alert.alert('确认解除配对？', '解除后需要重新配对', [
            { text: '取消', style: 'cancel' },
            { text: '确认', style: 'destructive', onPress: onUnpair },
          ]);
        },
      },
      {
        text: '退出登录',
        style: 'destructive',
        onPress: () => {
          Alert.alert('确认退出？', '退出后需要重新注册', [
            { text: '取消', style: 'cancel' },
            { text: '确认退出', style: 'destructive', onPress: onLogout },
          ]);
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  }, [onUnpair, onLogout]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>couple buzz 💕</Text>
            <Text style={styles.subtitle}>与 {partnerName} 已连接</Text>
          </View>
          <TouchableOpacity style={styles.settingsButton} onPress={showSettings}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
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
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
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
  settingsButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 4,
  },
  settingsIcon: {
    fontSize: 22,
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
