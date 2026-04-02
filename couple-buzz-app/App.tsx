import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, LogBox } from 'react-native';

LogBox.ignoreLogs(['Could not access feature flag']);
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { COLORS } from './src/constants';
import { storage } from './src/utils/storage';
import { registerAndUpdateToken } from './src/services/notification';
import { api } from './src/services/api';
import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createMaterialTopTabNavigator();

type AppState = 'loading' | 'setup' | 'waiting' | 'ready';

function MainTabs({ partnerName }: { partnerName: string }) {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled: true,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: COLORS.kiss,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'none',
        },
        tabBarIndicatorStyle: {
          backgroundColor: COLORS.kiss,
          height: 2,
          top: 0,
        },
        tabBarShowIcon: true,
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: '首页',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
        }}
      >
        {() => <HomeScreen partnerName={partnerName} />}
      </Tab.Screen>
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: '废话区',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: '设置',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [partnerName, setPartnerName] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    (async () => {
      const userId = await storage.getUserId();
      if (!userId) {
        setAppState('setup');
        return;
      }

      try {
        const status = await api.getStatus();
        if (status.paired && status.partner_name) {
          await storage.setPartnerName(status.partner_name);
          setPartnerName(status.partner_name);
          setAppState('ready');
          registerAndUpdateToken();
        } else {
          setAppState('waiting');
        }
      } catch {
        await storage.clearAll();
        setAppState('setup');
      }
    })();
  }, []);

  useEffect(() => {
    if (appState !== 'waiting') return;

    const check = async () => {
      try {
        const status = await api.getStatus();
        if (status.paired && status.partner_name) {
          await storage.setPartnerName(status.partner_name);
          setPartnerName(status.partner_name);
          setAppState('ready');
          registerAndUpdateToken();
        }
      } catch {}
    };

    check();
    pollRef.current = setInterval(check, 3000);
    return () => clearInterval(pollRef.current);
  }, [appState]);

  const handleRegistered = useCallback(async (result: { partner_name: string | null }) => {
    if (result.partner_name) {
      await storage.setPartnerName(result.partner_name);
      setPartnerName(result.partner_name);
      setAppState('ready');
      registerAndUpdateToken();
    } else {
      setAppState('waiting');
    }
  }, []);

  if (appState === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.kiss} />
      </View>
    );
  }

  if (appState === 'setup') {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SetupScreen onRegistered={handleRegistered} />
      </SafeAreaProvider>
    );
  }

  if (appState === 'waiting') {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.center}>
          <Text style={styles.waitingEmoji}>💕</Text>
          <Text style={styles.waitingTitle}>等待对方加入...</Text>
          <Text style={styles.waitingSubtitle}>对方注册后将自动配对</Text>
          <ActivityIndicator style={styles.waitingSpinner} color={COLORS.kiss} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <MainTabs partnerName={partnerName} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  waitingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  waitingSubtitle: {
    fontSize: 16,
    color: COLORS.textLight,
  },
  waitingSpinner: {
    marginTop: 32,
  },
});
