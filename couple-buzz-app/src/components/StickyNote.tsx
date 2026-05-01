import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable, Animated, Easing } from 'react-native';
import { COLORS } from '../constants';
import { StickyView, StickyBlockView } from '../services/api';

// Ink colors are deep variants of the per-side accent so each author's writing
// reads visually as a distinct pen color. Italic + slightly heavier weight
// gives a "handwritten" feel without shipping custom fonts.
export const INK_MINE = '#A0144A';      // 深粉墨水
export const INK_PARTNER = '#0F4F8A';   // 深蓝墨水
const PAPER = '#FFFBE6';                // warm cream sticky paper

const STICKY_WIDTH_RATIO = 0.66;
// Each block in a sticky renders as its own paper. They overlap by this
// amount (within the papers' padding zones, so no content gets clipped) and
// are stitched together by a small staple visual at each joint.
const BLOCK_OVERLAP = 14;

interface Props {
  sticky: StickyView;
  // Sticky has an active selection state (any tap on a sticky brings up the
  // toolbar pills). Selection drives the "再写点" pill in the toolbar.
  selected: boolean;
  // True when this user is currently writing a temp comment on this sticky —
  // suppresses the "未读" island so the editor doesn't fight for attention.
  writingComment: boolean;
  // True for one render cycle right after the user taps 贴上去 — plays the
  // "drop onto wall" entry animation (scale-down from 1.4 + spring).
  justPosted?: boolean;
  // True while the parent is mid tear-off — plays a short rip animation
  // (shrink + tilt + lift + fade). Parent fires the actual delete API after
  // the animation duration so the visual completes before the row leaves
  // state.
  tearingOff?: boolean;
  // Block id currently being torn off via the per-block path. Only one can
  // animate at a time; siblings stay still and reflow under LayoutAnimation
  // once the row vanishes from state.
  tearingBlockId?: number | null;
  onPress: () => void;
  // Long-press on a comment block (i >= 1, author_role === 'me') asks the
  // parent to confirm + delete that single block. First block (原帖) and
  // partner-authored blocks won't fire this — UI doesn't bind a handler.
  onLongPressBlock?: (blockId: number) => void;
}

function inkColorFor(role: 'me' | 'partner') {
  return role === 'me' ? INK_MINE : INK_PARTNER;
}

function StickyNote({
  sticky,
  selected,
  writingComment,
  justPosted,
  tearingOff,
  tearingBlockId,
  onPress,
  onLongPressBlock,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const stickyW = Math.round(screenW * STICKY_WIDTH_RATIO);

  // Server anchors layout_x to the creator's POV (always in the left half
  // [0.05..0.45]). From each viewer's perspective we want our own stickies
  // on our left and partner's on our right — so mirror x when the viewer is
  // not the creator. Per-block rotations are likewise mirrored below at the
  // point each paper is rendered.
  const isMine = sticky.author_role === 'me';
  const effectiveX = isMine ? sticky.layout_x : 1 - sticky.layout_x;

  const slack = screenW - stickyW - 32; // 32 = horizontal margin (16 each side)
  const leftPx = Math.max(0, Math.min(slack, effectiveX * slack));

  const blocks = sticky.blocks;

  // Drop-onto-wall entry animation — only the just-posted sticky plays it.
  // Sticky enters big + slightly higher with low opacity, then springs to its
  // resting size + position. Reads as "the note got slapped onto the wall".
  const enterScale = useRef(new Animated.Value(1)).current;
  const enterY = useRef(new Animated.Value(0)).current;
  const enterOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!justPosted) return;
    enterScale.setValue(1.35);
    enterY.setValue(-32);
    enterOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(enterScale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      Animated.spring(enterY, { toValue: 0, friction: 6, tension: 90, useNativeDriver: true }),
      Animated.timing(enterOpacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [justPosted, enterScale, enterY, enterOpacity]);

  // Selection animation — gentle lift (scale 1.04) on tap so the picked
  // sticky pops out from the wall. Combined with the high-contrast ring
  // overlay below + shadow boost, this makes the selected state read at a
  // glance instead of relying on shadow alone.
  const selectScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(selectScale, {
      toValue: selected ? 1.04 : 1,
      friction: 7,
      tension: 110,
      useNativeDriver: true,
    }).start();
  }, [selected, selectScale]);

  // Whole-sticky tear-off animation — shared values driven on every paper so
  // the stack rips together. Per-block tear (single comment delete) lives in
  // BlockPaper itself.
  const tearScale = useRef(new Animated.Value(1)).current;
  const tearOpacity = useRef(new Animated.Value(1)).current;
  const tearRotate = useRef(new Animated.Value(0)).current;
  const tearY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tearingOff) return;
    const direction = Math.random() > 0.5 ? 1 : -1;
    Animated.parallel([
      Animated.timing(tearScale, { toValue: 0.32, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(tearOpacity, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(tearRotate, { toValue: direction * 22, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(tearY, { toValue: -36, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [tearingOff, tearScale, tearOpacity, tearRotate, tearY]);

  // tearRotate is a numeric Animated.Value; convert to a deg-string transform
  // via interpolate. Memoized so the underlying animated node identity is
  // stable across renders.
  const tearRotateDeg = useMemo(
    () => tearRotate.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }),
    [tearRotate]
  );

  const showUnreadIsland = sticky.unread && !writingComment;

  return (
    <View style={{ marginLeft: leftPx + 16, width: stickyW }}>
      {blocks.map((block, i) => {
        const isFirst = i === 0;
        const rawRot = block.layout_rotation || 0;
        const blockRot = isMine ? rawRot : -rawRot;
        // Long-press only enabled on non-原帖 blocks I authored. First block
        // is the post itself; partner-authored blocks aren't mine to tear.
        const canTearBlock = !isFirst && block.author_role === 'me' && !!onLongPressBlock;
        return (
          <BlockPaper
            key={block.id}
            block={block}
            isFirst={isFirst}
            blockRot={blockRot}
            zIndex={i + 10}
            selected={selected}
            showUnreadIsland={isFirst && showUnreadIsland}
            tearing={tearingBlockId === block.id}
            enterScale={enterScale}
            enterY={enterY}
            enterOpacity={enterOpacity}
            selectScale={selectScale}
            tearScale={tearScale}
            tearY={tearY}
            tearOpacity={tearOpacity}
            tearRotateDeg={tearRotateDeg}
            onPress={onPress}
            onLongPress={canTearBlock ? () => onLongPressBlock!(block.id) : undefined}
          />
        );
      })}

      {/* My in-progress comment renders as its own dashed-border paper at
          the bottom of the thread — visually part of the stack but
          clearly "draft". Partner can't see this. We only render it when
          the draft has actual content; an empty temp block on the server
          (e.g. from a 跟个帖 tap that was abandoned without typing) would
          otherwise show a ghost "（继续写...）" sheet that the user has
          no way to dismiss. */}
      {sticky.my_temp_block && sticky.my_temp_block.content.trim().length > 0 && (
        <PendingPaper
          content={sticky.my_temp_block.content}
          showPin={blocks.length > 0}
          zIndex={blocks.length + 10}
          selected={selected}
          enterScale={enterScale}
          enterY={enterY}
          enterOpacity={enterOpacity}
          selectScale={selectScale}
          tearScale={tearScale}
          tearY={tearY}
          tearOpacity={tearOpacity}
          tearRotateDeg={tearRotateDeg}
          onPress={onPress}
        />
      )}
    </View>
  );
}

export default React.memo(StickyNote);

interface BlockPaperProps {
  block: StickyBlockView;
  isFirst: boolean;
  blockRot: number;
  zIndex: number;
  selected: boolean;
  showUnreadIsland: boolean;
  tearing: boolean;
  enterScale: Animated.Value;
  enterY: Animated.Value;
  enterOpacity: Animated.Value;
  selectScale: Animated.Value;
  tearScale: Animated.Value;
  tearY: Animated.Value;
  tearOpacity: Animated.Value;
  tearRotateDeg: Animated.AnimatedInterpolation<string>;
  onPress: () => void;
  onLongPress?: () => void;
}

// One paper in the stapled sticky stack. Owns its own per-block tear
// animation (single comment delete) so siblings stay still while one block
// rips off. The shared values from the parent drive whole-sticky entry +
// select + global tear together.
function BlockPaper({
  block,
  isFirst,
  blockRot,
  zIndex,
  selected,
  showUnreadIsland,
  tearing,
  enterScale,
  enterY,
  enterOpacity,
  selectScale,
  tearScale,
  tearY,
  tearOpacity,
  tearRotateDeg,
  onPress,
  onLongPress,
}: BlockPaperProps) {
  const blockTearScale = useRef(new Animated.Value(1)).current;
  const blockTearOpacity = useRef(new Animated.Value(1)).current;
  const blockTearRotate = useRef(new Animated.Value(0)).current;
  const blockTearY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!tearing) return;
    const direction = Math.random() > 0.5 ? 1 : -1;
    Animated.parallel([
      Animated.timing(blockTearScale, { toValue: 0.32, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(blockTearOpacity, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(blockTearRotate, { toValue: direction * 22, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(blockTearY, { toValue: -36, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [tearing, blockTearScale, blockTearOpacity, blockTearRotate, blockTearY]);

  const blockTearRotateDeg = useMemo(
    () => blockTearRotate.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }),
    [blockTearRotate]
  );

  // Combined opacity = sticky-level enter × sticky-level tear × this-block
  // tear. Animated.multiply chains nodes so each animation can drive
  // independently without one clobbering the other.
  const opacity = useMemo(
    () => Animated.multiply(Animated.multiply(enterOpacity, tearOpacity), blockTearOpacity),
    [enterOpacity, tearOpacity, blockTearOpacity]
  );

  const transform = [
    { translateY: enterY },
    { translateY: tearY },
    { translateY: blockTearY },
    { scale: enterScale },
    { scale: selectScale },
    { scale: tearScale },
    { scale: blockTearScale },
    { rotate: tearRotateDeg },
    { rotate: blockTearRotateDeg },
    { rotate: `${blockRot}deg` },
  ];

  const inkColor = inkColorFor(block.author_role);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={{
        marginTop: isFirst ? 0 : -BLOCK_OVERLAP,
        // Newer papers on top so each new comment visually covers the bottom
        // edge of the older paper at the joint. The pin (child of the upper
        // paper) lands fully on the visible top layer and clearly pierces
        // both sheets.
        zIndex,
      }}
    >
      <Animated.View
        style={[
          styles.paper,
          { transform, opacity },
          selected && styles.paperSelected,
        ]}
      >
        {selected && <View style={styles.selectedRing} pointerEvents="none" />}
        {showUnreadIsland && (
          <View style={styles.unreadIsland} pointerEvents="none">
            <Text style={styles.unreadText}>未读</Text>
          </View>
        )}
        {!isFirst && (
          <View style={styles.pinSlot} pointerEvents="none">
            <View style={styles.pinHead} />
            <View style={styles.pinHighlight} />
          </View>
        )}
        <Text style={[styles.blockText, { color: inkColor }]}>{block.content}</Text>
      </Animated.View>
    </Pressable>
  );
}

interface PendingPaperProps {
  content: string;
  showPin: boolean;
  zIndex: number;
  selected: boolean;
  enterScale: Animated.Value;
  enterY: Animated.Value;
  enterOpacity: Animated.Value;
  selectScale: Animated.Value;
  tearScale: Animated.Value;
  tearY: Animated.Value;
  tearOpacity: Animated.Value;
  tearRotateDeg: Animated.AnimatedInterpolation<string>;
  onPress: () => void;
}

// Draft paper at the bottom of the stack — only the author sees it, no
// per-block tear since drafts don't exist server-side as committed blocks.
function PendingPaper({
  content,
  showPin,
  zIndex,
  selected,
  enterScale,
  enterY,
  enterOpacity,
  selectScale,
  tearScale,
  tearY,
  tearOpacity,
  tearRotateDeg,
  onPress,
}: PendingPaperProps) {
  const opacity = useMemo(
    () => Animated.multiply(enterOpacity, tearOpacity),
    [enterOpacity, tearOpacity]
  );
  const transform = [
    { translateY: enterY },
    { translateY: tearY },
    { scale: enterScale },
    { scale: selectScale },
    { scale: tearScale },
    { rotate: tearRotateDeg },
    { rotate: '0deg' },
  ];
  return (
    <Pressable
      onPress={onPress}
      style={{ marginTop: -BLOCK_OVERLAP, zIndex }}
    >
      <Animated.View
        style={[
          styles.paper,
          styles.paperPending,
          { transform, opacity },
          selected && styles.paperSelected,
        ]}
      >
        {selected && <View style={styles.selectedRing} pointerEvents="none" />}
        {showPin && (
          <View style={styles.pinSlot} pointerEvents="none">
            <View style={styles.pinHead} />
            <View style={styles.pinHighlight} />
          </View>
        )}
        <Text style={[styles.blockText, styles.pendingText]}>
          {content || '（继续写...）'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: PAPER,
    borderRadius: 4,
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 18,
    // Subtle shadow to lift the sticky off the wall background.
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    minHeight: 120,
  },
  paperSelected: {
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 2, height: 6 },
  },
  // Outer ring overlay — sits 3pt outside the paper edge on all sides so the
  // border doesn't push paper content inward. Dark cocoa contrasts both the
  // cream paper and the wood wall.
  selectedRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderWidth: 2,
    borderColor: '#3D2A19',
    borderRadius: 7,
  },
  unreadIsland: {
    position: 'absolute',
    top: -10,
    right: -8,
    backgroundColor: '#0E0E10',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    // Sit above the paper without affecting layout flow.
    zIndex: 5,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  blockText: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
    fontWeight: '600',
    color: COLORS.text,
  },
  // Round push-pin at the joint between two papers (top edge of the upper
  // paper). The upper paper sits highest in z, so the pin — its child —
  // renders cleanly on top of the previous paper's overlap region.
  pinSlot: {
    position: 'absolute',
    top: -7,
    left: '50%',
    marginLeft: -7,
    width: 14,
    height: 14,
    zIndex: 50,
  },
  pinHead: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 7,
    backgroundColor: '#C53D3D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 4,
  },
  // A small near-white blob in the upper-left of the pinhead suggests a
  // light source above-left and gives the disk a 3D thumbtack feel without
  // a real radial gradient.
  pinHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  // In-progress comment paper: dashed border + faintly different bg makes
  // the "draft" status read instantly. Only the author sees it.
  paperPending: {
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: 'rgba(92, 64, 51, 0.4)',
    backgroundColor: '#FFF5D6',
  },
  pendingText: {
    color: 'rgba(92, 64, 51, 0.6)',
    fontStyle: 'italic',
    fontWeight: '500',
  },
});
