import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Modal, Pressable, Dimensions } from 'react-native';
import { COLORS } from '../constants';

interface Props {
  visible: boolean;
  // Letter content shown after the envelope flap unfolds.
  content: string;
  // Optional eyebrow shown above content (e.g. "ta 写的" or date).
  title?: string;
  onClose: () => void;
}

const { width: SCREEN_W } = Dimensions.get('window');
const ENV_W = Math.min(260, SCREEN_W - 80);
const ENV_H = Math.round(ENV_W * 0.62);
const FLAP_H = Math.round(ENV_H * 0.6);

// Modal-backed reveal: scrim fades in → envelope pops up → flap rotates open
// → letter slides up out of envelope, scales to a full card → content fades
// in. Tap outside the card to dismiss.
export default function EnvelopeOpenAnimation({ visible, content, title, onClose }: Props) {
  const scrim = useRef(new Animated.Value(0)).current;
  const envelopeOpacity = useRef(new Animated.Value(0)).current;
  const envelopeScale = useRef(new Animated.Value(0.6)).current;
  const flapRotate = useRef(new Animated.Value(0)).current;
  const letterOpacity = useRef(new Animated.Value(0)).current;
  const letterTranslateY = useRef(new Animated.Value(0)).current;
  const letterScale = useRef(new Animated.Value(0.45)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    scrim.setValue(0);
    envelopeOpacity.setValue(0);
    envelopeScale.setValue(0.6);
    flapRotate.setValue(0);
    letterOpacity.setValue(0);
    letterTranslateY.setValue(0);
    letterScale.setValue(0.45);
    contentOpacity.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(envelopeOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(envelopeScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]),
      Animated.delay(140),
      Animated.timing(flapRotate, {
        toValue: 1,
        duration: 480,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(letterOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(letterTranslateY, {
          toValue: -ENV_H * 0.9,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(letterScale, { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
      ]),
      Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const flapRotateInterpolate = flapRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-175deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.scrim, { opacity: scrim }]} />
      <Pressable style={styles.pressOut} onPress={onClose}>
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.envelopeWrap,
              { opacity: envelopeOpacity, transform: [{ scale: envelopeScale }] },
            ]}
            pointerEvents="none"
          >
            {/* Envelope body — back panel, behind everything */}
            <View style={styles.envelopeBody} />

            {/* Letter card rises out of envelope and scales up */}
            <Animated.View
              style={[
                styles.letter,
                {
                  opacity: letterOpacity,
                  transform: [
                    { translateY: letterTranslateY },
                    { scale: letterScale },
                  ],
                },
              ]}
            >
              {title ? <Text style={styles.letterTitle}>{title}</Text> : null}
              <Animated.Text style={[styles.letterContent, { opacity: contentOpacity }]}>
                {content}
              </Animated.Text>
              <Animated.Text style={[styles.tapHint, { opacity: contentOpacity }]}>
                轻点空白处收起
              </Animated.Text>
            </Animated.View>

            {/* Front pocket — sits in front of letter so the letter appears
                tucked inside before the flap opens. */}
            <View style={styles.envelopePocket} />

            {/* Flap pivots from its top edge */}
            <Animated.View
              style={[
                styles.flap,
                { transform: [{ rotateX: flapRotateInterpolate }] },
              ]}
            />
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(40, 20, 30, 0.55)',
  },
  pressOut: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  envelopeWrap: {
    width: ENV_W,
    height: ENV_H,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  envelopeBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ENV_H,
    backgroundColor: '#FFE4EC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.kiss,
  },
  envelopePocket: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ENV_H * 0.55,
    backgroundColor: '#FFD0DD',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,143,171,0.5)',
  },
  letter: {
    position: 'absolute',
    bottom: ENV_H * 0.15,
    width: ENV_W * 0.92,
    minHeight: 220,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  letterTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.kiss,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  letterContent: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  tapHint: {
    marginTop: 14,
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  flap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    borderLeftWidth: ENV_W / 2,
    borderRightWidth: ENV_W / 2,
    borderTopWidth: FLAP_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFB5C2',
    transformOrigin: 'top center',
  } as any,
});
