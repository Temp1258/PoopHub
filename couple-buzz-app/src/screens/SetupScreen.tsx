import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '../constants';
import { api } from '../services/api';
import { storage } from '../utils/storage';
import { requestPermissions, getDeviceToken } from '../services/notification';

interface Props {
  onRegistered: (result: { partner_name: string | null }) => void;
}

export default function SetupScreen({ onRegistered }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('', '请输入你的名字');
      return;
    }

    setLoading(true);
    try {
      await requestPermissions();
      const token = (await getDeviceToken()) || '';

      const result = await api.register(trimmed, token);

      await storage.setUserId(result.user_id);
      await storage.setUserName(trimmed);
      await storage.setAccessToken(result.access_token);
      await storage.setRefreshToken(result.refresh_token);

      onRegistered({ partner_name: result.partner_name });
    } catch (error: any) {
      Alert.alert('注册失败', error.message || '请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>💕</Text>
        <Text style={styles.title}>Couple Buzz</Text>
        <Text style={styles.subtitle}>情侣专属互动</Text>

        <TextInput
          style={styles.input}
          placeholder="输入你的名字"
          placeholderTextColor={COLORS.textLight}
          value={name}
          onChangeText={setName}
          maxLength={20}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? '注册中...' : '开始使用'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    fontSize: 64,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textLight,
    marginBottom: 48,
  },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: COLORS.kiss,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
});
