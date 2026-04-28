import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Pressable, StyleSheet, Animated, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';
import { emitTouchStart, emitTouchEnd, subscribe } from '../services/socket';

interface Props {
  onSendStart?: () => void;
  onSendEnd?: () => void;
}

export default function TouchArea({ onSendStart, onSendEnd }: Props = {}) {
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const rippleAnim = useRef(new Animated.Value(0)).current;
  const receiveAnim = useRef(new Animated.Value(0)).current;
  const hapticInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendHapticInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // When the app backgrounds, any pending receive haptic must be cleared.
  // Otherwise: partner ends the touch while we're disconnected, our app
  // misses the `touch_end`, and on foreground the JS interval resumes
  // ticking forever. The server's connection handler re-emits `touch_start`
  // on reconnect if (and only if) the partner is still touching, so we'll
  // pick the touch back up if it's still happening.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      if (hapticInterval.current) {
        clearInterval(hapticInterval.current);
        hapticInterval.current = null;
      }
      setReceiving(false);
      receiveAnim.stopAnimation();
      receiveAnim.setValue(0);
      // Same defensive cleanup for send-side. The user can't be holding a
      // press while the app is backgrounded; whatever Pressable did with
      // the gesture is moot.
      if (sendHapticInterval.current) {
        clearInterval(sendHapticInterval.current);
        sendHapticInterval.current = null;
      }
      rippleAnim.stopAnimation();
      rippleAnim.setValue(0);
    });
    return () => sub.remove();
  }, [receiveAnim, rippleAnim]);

  useEffect(() => {
    const unsubs = [
      subscribe('partner_online', ({ online }: { online: boolean }) => {
        setPartnerOnline(online);
      }),
      subscribe('touch_start', () => {
        setReceiving(true);
        if (hapticInterval.current) clearInterval(hapticInterval.current);
        // Immediate strong notification haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        hapticInterval.current = setInterval(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }, 250);
        receiveAnim.stopAnimation();
        Animated.loop(
          Animated.sequence([
            Animated.timing(receiveAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(receiveAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
          ])
        ).start();
      }),
      subscribe('touch_end', () => {
        setReceiving(false);
        if (hapticInterval.current) {
          clearInterval(hapticInterval.current);
          hapticInterval.current = null;
        }
        receiveAnim.stopAnimation();
        receiveAnim.setValue(0);
      }),
    ];
    return () => {
      unsubs.forEach(fn => fn());
      if (hapticInterval.current) clearInterval(hapticInterval.current);
      if (sendHapticInterval.current) clearInterval(sendHapticInterval.current);
      receiveAnim.stopAnimation();
      rippleAnim.stopAnimation();
    };
  }, [receiveAnim, rippleAnim]);

  const handlePressIn = useCallback(() => {
    emitTouchStart();
    onSendStart?.();
    // Immediate strong haptic for sender
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Continuous haptic while holding
    if (sendHapticInterval.current) clearInterval(sendHapticInterval.current);
    sendHapticInterval.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 400);
    rippleAnim.stopAnimation();
    Animated.loop(
      Animated.sequence([
        Animated.timing(rippleAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(rippleAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [rippleAnim, onSendStart]);

  const handlePressOut = useCallback(() => {
    emitTouchEnd();
    onSendEnd?.();
    if (sendHapticInterval.current) {
      clearInterval(sendHapticInterval.current);
      sendHapticInterval.current = null;
    }
    rippleAnim.stopAnimation();
    rippleAnim.setValue(0);
  }, [rippleAnim, onSendEnd]);

  const sendScale = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const sendOpacity = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] });
  const recvScale = receiveAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const recvOpacity = receiveAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={styles.touchCircle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Send ripple */}
        <Animated.View
          style={[styles.ripple, { transform: [{ scale: sendScale }], opacity: sendOpacity }]}
        />
        {/* Receive ripple */}
        {receiving && (
          <Animated.View
            style={[styles.rippleReceive, { transform: [{ scale: recvScale }], opacity: recvOpacity }]}
          />
        )}
        <View style={[styles.innerCircle, receiving && styles.innerCircleReceiving]}>
          {partnerOnline && <View style={styles.onlineDot} />}
        </View>
      </Pressable>
    </View>
  );
}

const CIRCLE_SIZE = 200;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  touchCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ripple: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.kiss,
    borderRadius: CIRCLE_SIZE / 2,
  },
  rippleReceive: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF6B8A',
    borderRadius: CIRCLE_SIZE / 2,
  },
  innerCircle: {
    width: CIRCLE_SIZE * 0.7,
    height: CIRCLE_SIZE * 0.7,
    borderRadius: CIRCLE_SIZE * 0.35,
    backgroundColor: 'rgba(255, 143, 171, 0.15)',
    borderWidth: 2,
    borderColor: COLORS.kiss,
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerCircleReceiving: {
    backgroundColor: 'rgba(255, 107, 138, 0.3)',
    borderColor: '#FF6B8A',
  },
  onlineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CD964',
  },
});
