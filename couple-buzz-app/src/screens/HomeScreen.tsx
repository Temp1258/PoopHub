import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, ACTION_CATEGORIES } from '../constants';
import { api, DatesResponse } from '../services/api';
import ActionButton from '../components/ActionButton';
import TouchArea from '../components/TouchArea';
import { subscribe } from '../services/socket';
import RitualButton from '../components/RitualButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_SIZE = (SCREEN_WIDTH - 90) / 3;

interface Props {
  partnerName: string;
  streak: number;
}

export default function HomeScreen({ partnerName, streak }: Props) {
  const insets = useSafeAreaInsets();
  const [disabledButtons, setDisabledButtons] = useState<Record<string, boolean>>({});
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;
  const [toastText, setToastText] = useState('');
  const [pinnedDate, setPinnedDate] = useState<DatesResponse['pinned']>(null);
  const [presenceBoth, setPresenceBoth] = useState(false);
  const presenceAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const unsubs = [
      subscribe('presence_both', () => {
        setPresenceBoth(true);
        presenceAnim.stopAnimation();
        RNAnimated.loop(
          RNAnimated.sequence([
            RNAnimated.timing(presenceAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
            RNAnimated.timing(presenceAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
          ])
        ).start();
      }),
      subscribe('presence_single', () => {
        setPresenceBoth(false);
        presenceAnim.stopAnimation();
        presenceAnim.setValue(0);
      }),
    ];
    return () => {
      unsubs.forEach(fn => fn());
      presenceAnim.stopAnimation();
    };
  }, [presenceAnim]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const result = await api.getDates();
          setPinnedDate(result.pinned);
        } catch {}
      })();
    }, [])
  );

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
    }, 50);

    try {
      await api.sendAction(actionType);
      showToast(`已告诉 ${partnerName} 啦～`);
    } catch (error) {
      showToast('发送失败，请重试');
    }
  }, [partnerName, showToast]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>香宝聚集地 💕</Text>
        {(streak > 0 || pinnedDate) && (
          <View style={styles.badgeRow}>
            {streak > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🔥 {streak}天</Text>
              </View>
            )}
            {pinnedDate && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {pinnedDate.days_away === 0
                    ? `🎉 今天是${pinnedDate.title}！`
                    : `📅 ${pinnedDate.title} 还有${pinnedDate.days_away}天`}
                </Text>
              </View>
            )}
          </View>
        )}
        <Text style={styles.subtitle}>与 {partnerName} 已连接</Text>
        {presenceBoth && (
          <RNAnimated.View style={[styles.presenceBadge, { opacity: presenceAnim }]}>
            <Text style={styles.presenceText}>你们正在同时想着对方 💓</Text>
          </RNAnimated.View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <RitualButton />
        <TouchArea />

        {ACTION_CATEGORIES.map((category) => (
          <View key={category.title}>
            <Text style={styles.categoryTitle}>{category.title}</Text>
            <View style={[styles.grid, category.actions.length < 3 && styles.gridCentered]}>
              {category.actions.map((action) => (
                <View key={action.type} style={[styles.buttonWrapper, { width: BUTTON_SIZE }]}>
                  <ActionButton
                    action={action}
                    onPress={handleAction}
                    disabled={!!disabledButtons[action.type]}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

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
    paddingBottom: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 6,
  },
  presenceBadge: {
    marginTop: 8,
    backgroundColor: '#FFF0F3',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.kiss,
  },
  presenceText: {
    fontSize: 13,
    color: COLORS.kiss,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
    marginTop: 16,
    marginBottom: 10,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
  },
  gridCentered: {
    justifyContent: 'center',
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
