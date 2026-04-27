import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Modal, Pressable, Dimensions, ScrollView } from 'react-native';
import { COLORS } from '../constants';

interface Props {
  visible: boolean;
  // Letter content shown after the envelope unfolds.
  content: string;
  // Letter metadata — rendered as a "from → to · date" header so the reader
  // immediately knows who wrote it, who it's for, and when.
  from?: string;
  to?: string;
  date?: string;
  // Subtitle under metadata (e.g. "次日达", "择日达 · 给自己") for source.
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
// Letter card sizing — generous padding so reading the letter feels intimate
// rather than cramped. Width tracks screen width with margin; height grows
// to fit content but caps at ~70% of viewport to keep close affordance.
const LETTER_W = SCREEN_W - 40;
const LETTER_MAX_H = Math.round(SCREEN_H * 0.7);

// Three-act reveal: scrim + envelope appears → flap rotates open → letter
// rises out and scales to a full-size card with metadata + content. The
// content fade overlaps the rise so reading isn't artificially gated.
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
  const scrim = useRef(new Animated.Value(0)).current;
  const envelopeOpacity = useRef(new Animated.Value(0)).current;
  const envelopeScale = useRef(new Animated.Value(0.6)).current;
  const flapRotate = useRef(new Animated.Value(0)).current;
  const letterOpacity = useRef(new Animated.Value(0)).current;
  const letterTranslateY = useRef(new Animated.Value(0)).current;
  const letterScale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!visible) return;

    scrim.setValue(0);
    envelopeOpacity.setValue(0);
    envelopeScale.setValue(0.6);
    flapRotate.setValue(0);
    letterOpacity.setValue(0);
    letterTranslateY.setValue(0);
    letterScale.setValue(0.4);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(envelopeOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(envelopeScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]),
      Animated.delay(120),
      Animated.timing(flapRotate, {
        toValue: 1,
        duration: 460,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(letterOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(letterTranslateY, {
          toValue: -ENV_H * 0.6,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(letterScale, { toValue: 1, friction: 8, tension: 55, useNativeDriver: true }),
      ]),
    ]).start();
  }, [visible]);

  const flapRotateInterpolate = flapRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-175deg'],
  });

  const body = (
    <>
      <Animated.View style={[styles.scrim, { opacity: scrim }]} pointerEvents="none" />
      <Pressable style={styles.pressOut} onPress={onClose}>
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.envelopeWrap,
              { opacity: envelopeOpacity, transform: [{ scale: envelopeScale }] },
            ]}
            pointerEvents="none"
          >
            <View style={styles.envelopeBody} />

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
                  {(from || to) && (
                    <View style={styles.fromToRow}>
                      <Text style={styles.fromToText}>
                        <Text style={styles.fromToLabel}>From </Text>
                        <Text style={styles.fromToName}>{from || '—'}</Text>
                        <Text style={styles.fromToLabel}>  →  To </Text>
                        <Text style={styles.fromToName}>{to || '—'}</Text>
                      </Text>
                    </View>
                  )}
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
    </>
  );

  if (!wrapInModal) {
    if (!visible) return null;
    return <View style={StyleSheet.absoluteFill}>{body}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {body}
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
  fromToRow: {
    flexDirection: 'row',
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
