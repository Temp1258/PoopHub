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

interface Props {
  pairCode: string;
  onPaired: (partnerName: string) => void;
}

export default function PairScreen({ pairCode, onPaired }: Props) {
  const [partnerCode, setPartnerCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    const trimmed = partnerCode.trim().toUpperCase();
    if (trimmed.length !== 4) {
      Alert.alert('', '请输入对方的4位配对码');
      return;
    }

    setLoading(true);
    try {
      const result = await api.pair(trimmed);
      await storage.setPartnerName(result.partner_name);

      onPaired(result.partner_name);
    } catch (error: any) {
      Alert.alert('配对失败', error.message || '请检查配对码是否正确');
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
        <Text style={styles.title}>配对连接</Text>
        <Text style={styles.subtitle}>把你的配对码告诉 ta</Text>

        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>你的配对码</Text>
          <Text style={styles.code}>{pairCode}</Text>
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>输入对方的配对码</Text>
          <View style={styles.line} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="对方的4位配对码"
          placeholderTextColor={COLORS.textLight}
          value={partnerCode}
          onChangeText={setPartnerCode}
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handlePair}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? '配对中...' : '完成配对'}
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textLight,
    marginBottom: 40,
  },
  codeBox: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 32,
  },
  codeLabel: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 8,
  },
  code: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.kiss,
    letterSpacing: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: COLORS.textLight,
  },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 8,
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
