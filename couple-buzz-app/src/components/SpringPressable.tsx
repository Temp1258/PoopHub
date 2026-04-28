import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';

interface Props extends Omit<PressableProps, 'style'> {
  // Inline style for the inner Pressable (visual). Keep it as a static value;
  // the wrapper handles the scale transform.
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
  // Forwarded to the outer Animated.View — useful when the caller needs the
  // wrapper itself to participate in flex layout (e.g. flex: 1 in tab bars).
  wrapperStyle?: StyleProp<ViewStyle>;
}

// Pressable with a Clash-Royale-style "card pickup" feel: press in pops the
// child up with a bouncy spring overshoot, press out springs back. Driven by
// the native animation thread so it stays smooth even while JS is busy.
export function SpringPressable({
  scaleTo = 1.18,
  haptic = true,
  wrapperStyle,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[wrapperStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        style={style}
        onPressIn={(e) => {
          if (haptic) Haptics.selectionAsync();
          Animated.spring(scale, {
            toValue: scaleTo,
            useNativeDriver: true,
            tension: 260,
            friction: 5,
          }).start();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 200,
            friction: 6,
          }).start();
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
