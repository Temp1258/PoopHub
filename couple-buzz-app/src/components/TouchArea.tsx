import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Pressable, StyleSheet, Animated, AppState, useWindowDimensions } from 'react-native';
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

  // Touch circle scales with viewport so SE and Pro Max both feel the
  // same proportionally. Cap at 220 so on hypothetical iPad it doesn't
  // become absurdly large. Min via the Math.min/Math.max bracket below.
  const { width: screenW } = useWindowDimensions();
  const circleSize = useMemo(() => Math.round(Math.min(220, Math.max(160, screenW * 0.55))), [screenW]);
  const dynamicStyles = useMemo(() => ({
    touchCircle: {
      width: circleSize,
      height: circleSize,
    },
    ripple: {
      borderRadius: circleSize / 2,
    },
    innerCircle: {
      width: circleSize * 0.7,
      height: circleSize * 0.7,
      borderRadius: circleSize * 0.35,
    },
  }), [circleSize]);

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
        style={[styles.touchCircle, dynamicStyles.touchCircle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Send ripple */}
        <Animated.View
          style={[styles.ripple, dynamicStyles.ripple, { transform: [{ scale: sendScale }], opacity: sendOpacity }]}
        />
        {/* Receive ripple */}
        {receiving && (
          <Animated.View
            style={[styles.rippleReceive, dynamicStyles.ripple, { transform: [{ scale: recvScale }], opacity: recvOpacity }]}
          />
        )}
        <View style={[styles.innerCircle, dynamicStyles.innerCircle, receiving && styles.innerCircleReceiving]}>
          {partnerOnline && <View style={styles.onlineDot} />}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  // width/height/borderRadius come from `dynamicStyles` (responsive to
  // screen width). Static styles here are layout-agnostic visuals only.
  touchCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ripple: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.kiss,
  },
  rippleReceive: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF6B8A',
  },
  innerCircle: {
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
