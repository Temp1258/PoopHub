import React, { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { COLORS, API_URL } from '../constants';
import { api, SnapTodayResponse } from '../services/api';
import { storage } from '../utils/storage';
import { useBeijingMidnightCountdown } from '../utils/countdown';

const URGE_COOLDOWN_MS = 30 * 1000;

const DailySnapCard = forwardRef<{ reload: () => Promise<void> }>((_props, ref) => {
  const [data, setData] = useState<SnapTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urging, setUrging] = useState(false);
  const [reacting, setReacting] = useState(false);
  const lastUrgeRef = useRef(0);
  const cd = useBeijingMidnightCountdown();

  // Tick every second so the cooldown countdown re-renders
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const cooldownLeft = Math.max(0, URGE_COOLDOWN_MS - (Date.now() - lastUrgeRef.current));
  const inCooldown = cooldownLeft > 0;

  const load = useCallback(async () => {
    try {
      const result = await api.getSnapToday();
      setData(result);
    } catch {}
    setLoading(false);
  }, []);

  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSnap = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('', '需要相机权限');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      quality: 0.3,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', {
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: 'snap.jpg',
      } as any);

      const token = await storage.getAccessToken();
      const res = await fetch(`${API_URL}/api/snaps`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        Alert.alert('', err.error || '上传失败');
      } else {
        await load();
      }
    } catch {
      Alert.alert('', '上传失败');
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.kiss} />
      </View>
    );
  }

  if (!data) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>每日快照 📸</Text>

      <View style={styles.photosRow}>
        <View style={styles.photoBox}>
          <Text style={styles.photoLabel}>我</Text>
          {data.my_photo ? (
            <Image source={{ uri: `${API_URL}${data.my_photo}` }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.placeholderText}>📷</Text>
            </View>
          )}
        </View>
        <View style={styles.photoBox}>
          <Text style={styles.photoLabel}>ta</Text>
          {data.partner_photo ? (
            <Image source={{ uri: `${API_URL}${data.partner_photo}` }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.placeholderText}>{data.partner_snapped ? '🔒' : '📷'}</Text>
            </View>
          )}
        </View>
      </View>

      {!data.my_snapped && (
        <TouchableOpacity
          style={[styles.snapButton, uploading && styles.snapDisabled]}
          onPress={handleSnap}
          disabled={uploading}
        >
          <Text style={styles.snapText}>{uploading ? '上传中...' : '拍一张 📸'}</Text>
        </TouchableOpacity>
      )}

      {data.my_snapped && !data.partner_snapped && (
        <>
          <Text style={styles.waiting}>等待 ta 的快照...</Text>
          <TouchableOpacity
            style={[styles.urgeBtn, (urging || inCooldown) && styles.urgeBtnDisabled]}
            onPress={async () => {
              const now = Date.now();
              if (now - lastUrgeRef.current < URGE_COOLDOWN_MS) return;
              setUrging(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              try {
                await api.urge('snap');
                lastUrgeRef.current = Date.now();
                Alert.alert('', '已经催 ta 了 ⏰');
              } catch (e: any) {
                Alert.alert('', e.message || '催促失败');
              } finally {
                setUrging(false);
              }
            }}
            disabled={urging || inCooldown}
          >
            <Text style={styles.urgeText}>
              {urging ? '催促中...' : inCooldown ? `${Math.ceil(cooldownLeft / 1000)}s 后可再催` : '⏰ 拍照！'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {data.my_snapped && data.partner_snapped && (
        <>
          <Text style={styles.both}>今天的快照已完成！</Text>

          {/* Partner's reaction to my snap (read-only) */}
          {data.partner_reaction_to_me ? (
            <View style={styles.reactedBlock}>
              <Text style={styles.reactedEmoji}>
                {data.partner_reaction_to_me === 'up' ? '👍' : '👎'}
              </Text>
              <Text style={styles.reactedText}>ta 对我的快照的评价</Text>
            </View>
          ) : (
            <Text style={styles.waitingForReact}>ta 还没评价你的快照</Text>
          )}

          {/* My reaction to partner's snap (interactive once, then read-only) */}
          {data.my_reaction_to_partner ? (
            <View style={styles.reactedBlock}>
              <Text style={styles.reactedEmoji}>
                {data.my_reaction_to_partner === 'up' ? '👍' : '👎'}
              </Text>
              <Text style={styles.reactedText}>我对 ta 的快照的评价</Text>
            </View>
          ) : (
            <View style={styles.reactRow}>
              <TouchableOpacity
                style={[styles.reactBtn, styles.reactUp]}
                onPress={async () => {
                  if (reacting || data.my_reaction_to_partner) return;
                  setReacting(true);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setData(prev => prev ? { ...prev, my_reaction_to_partner: 'up' } : prev);
                  try { await api.dailyReaction('snap', 'up'); }
                  catch (e: any) { load(); Alert.alert('', e.message || '操作失败'); }
                  finally { setReacting(false); }
                }}
                disabled={reacting}
              >
                <Text style={styles.reactEmoji}>👍</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reactBtn, styles.reactDown]}
                onPress={async () => {
                  if (reacting || data.my_reaction_to_partner) return;
                  setReacting(true);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setData(prev => prev ? { ...prev, my_reaction_to_partner: 'down' } : prev);
                  try { await api.dailyReaction('snap', 'down'); }
                  catch (e: any) { load(); Alert.alert('', e.message || '操作失败'); }
                  finally { setReacting(false); }
                }}
                disabled={reacting}
              >
                <Text style={styles.reactEmoji}>👎</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <Text style={styles.refreshHint}>
        {cd.done ? '即将刷新' : `距下次刷新 ${cd.hh}:${cd.mm}:${cd.ss}`}
      </Text>
    </View>
  );
});

export default DailySnapCard;

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  header: { fontSize: 13, fontWeight: '600', color: COLORS.textLight, marginBottom: 12 },
  photosRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  photoBox: { flex: 1, alignItems: 'center' },
  photoLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textLight, marginBottom: 6 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  photoPlaceholder: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 28 },
  snapButton: { height: 44, backgroundColor: COLORS.kiss, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  snapDisabled: { opacity: 0.5 },
  snapText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  waiting: { fontSize: 13, color: COLORS.textLight, textAlign: 'center' },
  both: { fontSize: 13, color: COLORS.kiss, textAlign: 'center', fontWeight: '500' },
  refreshHint: { fontSize: 12, color: COLORS.textLight, textAlign: 'center', marginTop: 12 },
  urgeBtn: { height: 44, backgroundColor: COLORS.kiss, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  urgeBtnDisabled: { opacity: 0.4 },
  urgeText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  reactRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  reactBtn: { flex: 1, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  reactUp: { borderColor: '#B8E6CF', backgroundColor: '#F0FBF5' },
  reactDown: { borderColor: '#FFC2C2', backgroundColor: '#FFF0F0' },
  reactEmoji: { fontSize: 20 },
  reactedBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 8, backgroundColor: COLORS.background, borderRadius: 10 },
  reactedEmoji: { fontSize: 22 },
  reactedText: { fontSize: 13, color: COLORS.textLight, fontWeight: '500' },
  waitingForReact: { fontSize: 12, color: COLORS.textLight, textAlign: 'center', marginTop: 10, fontStyle: 'italic' },
});
