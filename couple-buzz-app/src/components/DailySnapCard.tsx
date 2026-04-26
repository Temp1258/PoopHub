import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, API_URL } from '../constants';
import { api, SnapTodayResponse } from '../services/api';
import { storage } from '../utils/storage';
import { useBeijingMidnightCountdown } from '../utils/countdown';

const DailySnapCard = forwardRef<{ reload: () => Promise<void> }>((_props, ref) => {
  const [data, setData] = useState<SnapTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const cd = useBeijingMidnightCountdown();

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
        <Text style={styles.waiting}>等待 ta 的快照...</Text>
      )}

      {data.my_snapped && data.partner_snapped && (
        <Text style={styles.both}>今天的快照已完成！</Text>
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
});
