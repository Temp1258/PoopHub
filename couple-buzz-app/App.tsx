import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, LogBox } from 'react-native';

LogBox.ignoreLogs(['Could not access feature flag']);
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { COLORS } from './src/constants';
import { storage } from './src/utils/storage';
import { registerAndUpdateToken } from './src/services/notification';
import { api } from './src/services/api';
import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UsScreen from './src/screens/UsScreen';

const Tab = createMaterialTopTabNavigator();

type AppState = 'loading' | 'setup' | 'waiting' | 'ready';

function MainTabs({ partnerName, streak, hasUnread, onLatestSeen }: { partnerName: string; streak: number; hasUnread: boolean; onLatestSeen: (id: number) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled: true,
        tabBarScrollEnabled: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: COLORS.kiss,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'none',
        },
        tabBarItemStyle: {
          height: 64,
          justifyContent: 'center',
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
        {() => <HomeScreen partnerName={partnerName} streak={streak} />}
      </Tab.Screen>
      <Tab.Screen
        name="History"
        options={{
          tabBarLabel: '废话区',
          tabBarIcon: ({ color }) => (
            <View>
              <Text style={{ fontSize: 20, color }}>💬</Text>
              {hasUnread && (
                <View style={{
                  position: 'absolute',
                  top: -2,
                  right: -6,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: COLORS.kiss,
                }} />
              )}
            </View>
          ),
        }}
      >
        {() => <HistoryScreen onLatestSeen={onLatestSeen} />}
      </Tab.Screen>
      <Tab.Screen
        name="Us"
        component={UsScreen}
        options={{
          tabBarLabel: '我们',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💑</Text>,
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
  const [streak, setStreak] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const lastSeenIdRef = useRef(0);
  const [hasUnread, setHasUnread] = useState(false);
  const activeTabRef = useRef('Home');
  const initializedRef = useRef(false);
  const myUserIdRef = useRef('');

  useEffect(() => {
    (async () => {
      const userId = await storage.getUserId();
      if (!userId) {
        setAppState('setup');
        return;
      }
      myUserIdRef.current = userId;

      try {
        const status = await api.getStatus();
        if (status.paired && status.partner_name) {
          await storage.setPartnerName(status.partner_name);
          setPartnerName(status.partner_name);
          setStreak(status.streak ?? 0);
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

  useEffect(() => {
    if (appState !== 'ready') return;

    const init = async () => {
      try {
        const result = await api.getHistory(1);
        if (result.actions.length > 0) {
          lastSeenIdRef.current = result.actions[0].id;
        }
        initializedRef.current = true;
      } catch {}
    };
    init();

    const poll = async () => {
      if (!initializedRef.current) return;
      try {
        const result = await api.getHistory(1);
        if (result.actions.length > 0 && result.actions[0].id > lastSeenIdRef.current) {
          lastSeenIdRef.current = result.actions[0].id;
          const isPartnerMsg = result.actions[0].user_id !== myUserIdRef.current;
          if (isPartnerMsg && activeTabRef.current !== 'History') {
            setHasUnread(true);
          }
        }
      } catch {}
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [appState]);

  useEffect(() => {
    Notifications.setBadgeCountAsync(hasUnread ? 1 : 0);
  }, [hasUnread]);

  const handleLatestSeen = useCallback((id: number) => {
    lastSeenIdRef.current = id;
    setHasUnread(false);
  }, []);

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
      <NavigationContainer
        onStateChange={(state) => {
          if (!state) return;
          const route = state.routes[state.index];
          activeTabRef.current = route.name;
          if (route.name === 'History') {
            setHasUnread(false);
          }
        }}
      >
        <MainTabs partnerName={partnerName} streak={streak} hasUnread={hasUnread} onLatestSeen={handleLatestSeen} />
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
