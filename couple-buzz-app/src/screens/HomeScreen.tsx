import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { api, DatesResponse } from '../services/api';
import TouchArea from '../components/TouchArea';
import { subscribe } from '../services/socket';

interface Props {
  partnerName: string;
  streak: number;
}

export default function HomeScreen({ partnerName, streak }: Props) {
  const insets = useSafeAreaInsets();
  const [pinnedDate, setPinnedDate] = useState<DatesResponse['pinned']>(null);
  const [presenceBoth, setPresenceBoth] = useState(false);
  const presenceAnim = useRef(new RNAnimated.Value(0)).current;

  // Touch dual-press state
  const [iAmPressing, setIAmPressing] = useState(false);
  const [partnerPressing, setPartnerPressing] = useState(false);
  const bothPressing = iAmPressing && partnerPressing;
  const heartScale = useRef(new RNAnimated.Value(1)).current;
  const heartOpacity = useMemo(
    () => heartScale.interpolate({ inputRange: [0.92, 1.18], outputRange: [0.75, 1.0] }),
    [heartScale]
  );

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
      subscribe('touch_start', () => setPartnerPressing(true)),
      subscribe('touch_end', () => setPartnerPressing(false)),
    ];
    return () => {
      unsubs.forEach(fn => fn());
      presenceAnim.stopAnimation();
    };
  }, [presenceAnim]);

  // Heartbeat animation while both are pressing
  useEffect(() => {
    if (bothPressing) {
      heartScale.stopAnimation();
      heartScale.setValue(1);
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(heartScale, { toValue: 1.18, duration: 380, useNativeDriver: true }),
          RNAnimated.timing(heartScale, { toValue: 0.92, duration: 380, useNativeDriver: true }),
        ])
      ).start();
    } else {
      heartScale.stopAnimation();
      heartScale.setValue(1);
    }
    return () => { heartScale.stopAnimation(); };
  }, [bothPressing, heartScale]);

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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
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

      <View style={styles.touchWrap}>
        {bothPressing && (
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.heartLayer,
              { transform: [{ scale: heartScale }], opacity: heartOpacity },
            ]}
          >
            <Text style={styles.heartEmoji}>❤️</Text>
          </RNAnimated.View>
        )}
        <TouchArea
          onSendStart={() => setIAmPressing(true)}
          onSendEnd={() => setIAmPressing(false)}
        />
      </View>
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
  touchWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartEmoji: {
    fontSize: 280,
  },
});
