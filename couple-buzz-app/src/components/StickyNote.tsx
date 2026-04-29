import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { COLORS } from '../constants';
import { StickyView, StickyBlockView } from '../services/api';

// Ink colors are deep variants of the per-side accent so each author's writing
// reads visually as a distinct pen color. Italic + slightly heavier weight
// gives a "handwritten" feel without shipping custom fonts.
export const INK_MINE = '#A0144A';      // 深粉墨水
export const INK_PARTNER = '#0F4F8A';   // 深蓝墨水
const PAPER = '#FFFBE6';                // warm cream sticky paper

const STICKY_WIDTH_RATIO = 0.66;

interface Props {
  sticky: StickyView;
  // Sticky has an active selection state (any tap on a sticky brings up the
  // toolbar pills). Selection drives the "再写点" pill in the toolbar.
  selected: boolean;
  // True when this user is currently writing a temp comment on this sticky —
  // suppresses the "未读" island so the editor doesn't fight for attention.
  writingComment: boolean;
  onPress: () => void;
}

function inkColorFor(role: 'me' | 'partner') {
  return role === 'me' ? INK_MINE : INK_PARTNER;
}

function BlockText({ block }: { block: StickyBlockView }) {
  const color = inkColorFor(block.author_role);
  return (
    <Text style={[styles.blockText, { color }]}>{block.content}</Text>
  );
}

function StickyNote({ sticky, selected, writingComment, onPress }: Props) {
  const { width: screenW } = useWindowDimensions();
  const stickyW = Math.round(screenW * STICKY_WIDTH_RATIO);

  // Server anchors layout_x to the creator's POV, always in the left half
  // [0.05..0.45]. From each viewer's perspective we want our own stickies on
  // our left and partner's on our right — so mirror x and rotation when the
  // viewer is not the creator. Both sides see a coherent "mine left / yours
  // right" wall, even though only one row exists per sticky in the DB.
  const isMine = sticky.author_role === 'me';
  const effectiveX = isMine ? sticky.layout_x : 1 - sticky.layout_x;
  const effectiveRotation = isMine ? sticky.layout_rotation : -sticky.layout_rotation;

  const slack = screenW - stickyW - 32; // 32 = horizontal margin (16 each side)
  const leftPx = Math.max(0, Math.min(slack, effectiveX * slack));

  const blocks = sticky.blocks;

  // Memoize transform so React doesn't re-build the array each render and
  // RN's native side can short-circuit identity checks.
  const transform = useMemo(
    () => [{ rotate: `${effectiveRotation}deg` }],
    [effectiveRotation]
  );

  return (
    <View style={{ marginLeft: leftPx + 16, width: stickyW }}>
      <Pressable onPress={onPress}>
        <View style={[styles.paper, { transform }, selected && styles.paperSelected]}>
          {sticky.unread && !writingComment && (
            <View style={styles.unreadIsland} pointerEvents="none">
              <Text style={styles.unreadText}>未读</Text>
            </View>
          )}

          {blocks.map((block, i) => (
            <View key={block.id}>
              {i > 0 && <View style={styles.divider} />}
              <BlockText block={block} />
            </View>
          ))}

          {/* My in-progress comment on this sticky (rendered grayed-out/italic
              to signal "not yet committed"). Partner can't see this. */}
          {sticky.my_temp_block && (
            <View>
              <View style={[styles.divider, styles.dividerPending]} />
              <Text style={[styles.blockText, styles.pendingText]}>
                {sticky.my_temp_block.content || '（继续写...）'}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}

export default React.memo(StickyNote);

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
    shadowOpacity: 0.32,
    shadowRadius: 12,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(92, 64, 51, 0.18)',
    marginVertical: 10,
  },
  dividerPending: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 64, 51, 0.4)',
  },
  pendingText: {
    color: 'rgba(92, 64, 51, 0.55)',
    fontStyle: 'italic',
    fontWeight: '500',
  },
});
