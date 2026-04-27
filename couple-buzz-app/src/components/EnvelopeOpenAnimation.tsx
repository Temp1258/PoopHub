import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Modal, Pressable, Dimensions, ScrollView } from 'react-native';
import { COLORS } from '../constants';

interface Props {
  visible: boolean;
  // Letter content shown after the envelope unfolds.
  content: string;
  from?: string;
  to?: string;
  date?: string;
  kindLabel?: string;
  onClose: () => void;
  // When false, render as an absolute-positioned overlay instead of a Modal.
  // Use false when the parent is already inside a Modal (e.g. InboxScreen)
  // to avoid the visible re-mount that double-Modal stacking causes.
  wrapInModal?: boolean;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ENV_W = Math.min(280, SCREEN_W - 60);
const ENV_H = Math.round(ENV_W * 0.62);
const FLAP_H = Math.round(ENV_H * 0.6);
const LETTER_W = SCREEN_W - 40;
const LETTER_MAX_H = Math.round(SCREEN_H * 0.7);

// Reveal sequence:
//   1) wrapper fades in + envelope springs up        (closed envelope)
//   2) flap rotates open                             (envelope opens)
//   3) letter mounts and slides out, scaling to size (content reveal)
//
// The letter is *only mounted into the tree once stage === 'letter'*. Until
// then, no <View> with content exists, so there's zero risk of a first-frame
// flash where the native side hasn't yet applied opacity=0.
type Stage = 'idle' | 'envelope' | 'letter';

export default function EnvelopeOpenAnimation({
  visible,
  content,
  from,
  to,
  date,
  kindLabel,
  onClose,
  wrapInModal = true,
}: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const wrapperOpacity = useRef(new Animated.Value(0)).current;
  const envelopeScale = useRef(new Animated.Value(0.6)).current;
  const flapRotate = useRef(new Animated.Value(0)).current;
  const letterOpacity = useRef(new Animated.Value(0)).current;
  const letterTranslateY = useRef(new Animated.Value(0)).current;
  const letterScale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!visible) {
      setStage('idle');
      return;
    }

    setStage('envelope');
    wrapperOpacity.setValue(0);
    envelopeScale.setValue(0.6);
    flapRotate.setValue(0);
    letterOpacity.setValue(0);
    letterTranslateY.setValue(0);
    letterScale.setValue(0.4);

    // Beat 1 — backdrop + envelope arrive together
    Animated.parallel([
      Animated.timing(wrapperOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(envelopeScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
    ]).start(() => {
      // Beat 2 — flap rotates open
      Animated.timing(flapRotate, {
        toValue: 1,
        duration: 480,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: true,
      }).start(() => {
        // Beat 3 — *now* mount the letter. The View is created with the
        // animated values already at their starting state (opacity 0, scale
        // 0.4, translateY 0), so the first paint shows nothing visible.
        // requestAnimationFrame defers the start by exactly one frame to
        // guarantee the mount paint commits before we begin moving values.
        setStage('letter');
        requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(letterOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
            Animated.timing(letterTranslateY, {
              toValue: -ENV_H * 0.6,
              duration: 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(letterScale, { toValue: 1, friction: 8, tension: 55, useNativeDriver: true }),
          ]).start();
        });
      });
    });
  }, [visible]);

  const flapRotateInterpolate = flapRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-175deg'],
  });

  const body = (
    <Pressable style={styles.pressOut} onPress={onClose}>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.envelopeWrap,
            { transform: [{ scale: envelopeScale }] },
          ]}
          pointerEvents="none"
        >
          <View style={styles.envelopeBody} />

          {stage === 'letter' && (
            <Animated.View
              style={[
                styles.letterContainer,
                {
                  opacity: letterOpacity,
                  transform: [
                    { translateY: letterTranslateY },
                    { scale: letterScale },
                  ],
                },
              ]}
            >
              <Pressable style={styles.letterPress} onPress={(e) => e.stopPropagation()}>
                <View style={styles.letterHeader}>
                  {kindLabel ? <Text style={styles.kindLabel}>{kindLabel}</Text> : null}
                  {(from || to) ? (
                    <Text style={styles.fromToText}>
                      <Text style={styles.fromToLabel}>From </Text>
                      <Text style={styles.fromToName}>{from || '—'}</Text>
                      <Text style={styles.fromToLabel}>  →  To </Text>
                      <Text style={styles.fromToName}>{to || '—'}</Text>
                    </Text>
                  ) : null}
                  {date ? <Text style={styles.dateText}>{date}</Text> : null}
                </View>
                <View style={styles.divider} />
                <ScrollView
                  style={styles.contentScroll}
                  contentContainerStyle={styles.contentScrollInner}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.letterContent}>{content}</Text>
                </ScrollView>
                <Text style={styles.tapHint}>轻点空白处收起</Text>
              </Pressable>
            </Animated.View>
          )}

          <View style={styles.envelopePocket} />

          <Animated.View
            style={[
              styles.flap,
              { transform: [{ rotateX: flapRotateInterpolate }] },
            ]}
          />
        </Animated.View>
      </View>
    </Pressable>
  );

  // Wrapper view has a fixed semi-transparent backdrop so the underlying
  // screen is hidden the moment the overlay mounts (no flicker of the card
  // list showing through). The Animated.opacity then fades that wrapper in.
  const wrapper = (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: 'rgba(40, 20, 30, 0.55)', opacity: wrapperOpacity },
      ]}
    >
      {body}
    </Animated.View>
  );

  if (!wrapInModal) {
    if (!visible) return null;
    return wrapper;
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {wrapper}
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  letterContainer: {
    position: 'absolute',
    bottom: ENV_H * 0.15,
    width: LETTER_W,
    maxHeight: LETTER_MAX_H,
  },
  letterPress: {
    width: '100%',
    minHeight: 360,
    maxHeight: LETTER_MAX_H,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  letterHeader: {
    gap: 6,
  },
  kindLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.kiss,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fromToText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  fromToLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  fromToName: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },
  contentScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contentScrollInner: {
    paddingBottom: 6,
  },
  letterContent: {
    fontSize: 17,
    lineHeight: 26,
    color: COLORS.text,
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
