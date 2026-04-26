import React, { forwardRef, useImperativeHandle, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const PARTICLE_EMOJIS = ['✨', '🎆', '🎇', '💖', '💕', '🌟', '🎉', '⭐'];
const PARTICLES_PER_BURST = 18;
const BURST_DURATION = 1400;

export interface FireworksHandle {
  fire: () => void;
}

interface Particle {
  id: number;
  emoji: string;
  originX: number;
  originY: number;
  angle: number;
  distance: number;
  size: number;
  translate: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
}

let nextId = 0;

function makeBurst(originX: number, originY: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < PARTICLES_PER_BURST; i++) {
    const angle = (Math.PI * 2 * i) / PARTICLES_PER_BURST + Math.random() * 0.3;
    const distance = 120 + Math.random() * 140;
    out.push({
      id: nextId++,
      emoji: PARTICLE_EMOJIS[Math.floor(Math.random() * PARTICLE_EMOJIS.length)],
      originX,
      originY,
      angle,
      distance,
      size: 24 + Math.random() * 14,
      translate: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0.4),
    });
  }
  return out;
}

const FireworksOverlay = forwardRef<FireworksHandle>((_props, ref) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const activeBurstIds = useRef<Set<number>>(new Set());

  const fire = useCallback(() => {
    // Three offset bursts so the celebration covers the whole screen
    const bursts = [
      makeBurst(W * 0.5, H * 0.4),
      makeBurst(W * 0.25, H * 0.55),
      makeBurst(W * 0.75, H * 0.55),
    ];
    const all = bursts.flat();
    const ids = all.map(p => p.id);
    ids.forEach(id => activeBurstIds.current.add(id));
    setParticles(prev => [...prev, ...all]);

    all.forEach(p => {
      Animated.parallel([
        Animated.timing(p.translate, {
          toValue: 1,
          duration: BURST_DURATION,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(p.scale, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.back(1.6)),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(BURST_DURATION * 0.55),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: BURST_DURATION * 0.45,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        activeBurstIds.current.delete(p.id);
      });
    });

    setTimeout(() => {
      setParticles(prev => prev.filter(p => activeBurstIds.current.has(p.id)));
    }, BURST_DURATION + 100);
  }, []);

  useImperativeHandle(ref, () => ({ fire }), [fire]);

  if (particles.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map(p => {
        const dx = Math.cos(p.angle) * p.distance;
        const dy = Math.sin(p.angle) * p.distance;
        const tx = p.translate.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
        const ty = p.translate.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
        return (
          <Animated.Text
            key={p.id}
            style={[
              styles.particle,
              {
                left: p.originX,
                top: p.originY,
                fontSize: p.size,
                opacity: p.opacity,
                transform: [{ translateX: tx }, { translateY: ty }, { scale: p.scale }],
              },
            ]}
          >
            {p.emoji}
          </Animated.Text>
        );
      })}
    </View>
  );
});

FireworksOverlay.displayName = 'FireworksOverlay';

export default FireworksOverlay;

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    textAlign: 'center',
    marginLeft: -16,
    marginTop: -16,
  },
});
