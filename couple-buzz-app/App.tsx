import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, LogBox, AppState as RNAppState, TouchableOpacity, useWindowDimensions } from 'react-native';

LogBox.ignoreLogs(['Could not access feature flag']);
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { COLORS } from './src/constants';
import { storage } from './src/utils/storage';
import { registerAndUpdateToken } from './src/services/notification';
import { api, AuthError } from './src/services/api';
import { connectSocket, disconnectSocket } from './src/services/socket';
import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UsScreen from './src/screens/UsScreen';
import MailboxScreen from './src/screens/MailboxScreen';
import AnniversaryWishScreen from './src/screens/AnniversaryWishScreen';

const Tab = createMaterialTopTabNavigator();

type AppState = 'loading' | 'setup' | 'waiting' | 'ready';

// Pill-shaped (灵动岛) bottom tab bar. All sizing is proportional to screen
// width via useWindowDimensions, so the bar reflows on rotation / different
// device widths instead of looking off on small/large screens.
function PillTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const sidePad = width * 0.03;
  const gap = width * 0.012;
  const pillH = width * 0.14;
  const radius = pillH * 0.36;
  const labelSize = width * 0.028;

  return (
    <View style={{
      flexDirection: 'row',
      gap,
      paddingHorizontal: sidePad,
      paddingTop: width * 0.02,
      paddingBottom: insets.bottom + width * 0.015,
      backgroundColor: COLORS.background,
    }}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel as string;
        const renderIcon = options.tabBarIcon;
        const tint = isFocused ? COLORS.white : COLORS.textLight;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            activeOpacity={0.75}
            onPress={onPress}
            style={{
              flex: 1,
              height: pillH,
              borderRadius: radius,
              backgroundColor: isFocused ? COLORS.kiss : COLORS.white,
              borderWidth: isFocused ? 0 : 1,
              borderColor: COLORS.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {renderIcon && renderIcon({ focused: isFocused, color: tint })}
            <Text style={{
              fontSize: labelSize,
              fontWeight: '600',
              color: tint,
              marginTop: 2,
            }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MainTabs({ partnerName, streak, hasUnread, hasUnreadDaily, onLatestSeen }: { partnerName: string; streak: number; hasUnread: boolean; hasUnreadDaily: boolean; onLatestSeen: (id: number) => void }) {
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: '拍拍',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🤚</Text>,
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
        {() => <HistoryScreen partnerName={partnerName} onLatestSeen={onLatestSeen} />}
      </Tab.Screen>
      <Tab.Screen
        name="Us"
        component={UsScreen}
        options={{
          tabBarLabel: '每日',
          tabBarIcon: ({ color }) => (
            <View>
              <Text style={{ fontSize: 20, color }}>📅</Text>
              {hasUnreadDaily && (
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
      />
      <Tab.Screen
        name="Mailbox"
        component={MailboxScreen}
        options={{
          tabBarLabel: '信箱',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📮</Text>,
        }}
      />
      <Tab.Screen
        name="Promises"
        component={AnniversaryWishScreen}
        options={{
          tabBarLabel: '约定',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎀</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: '数据',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📊</Text>,
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
  const [hasUnreadDaily, setHasUnreadDaily] = useState(false);
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
      } catch (error) {
        if (error instanceof AuthError) {
          // Server explicitly rejected the session — wipe and re-login.
          await storage.clearAll();
          setAppState('setup');
        } else {
          // Network / DNS / wrong URL / 5xx — fall back to cached state so
          // a transient hiccup doesn't kick the user out of their session.
          const cachedPartnerName = await storage.getPartnerName();
          if (cachedPartnerName) {
            setPartnerName(cachedPartnerName);
            setStreak(0);
            setAppState('ready');
            registerAndUpdateToken();
          } else {
            setAppState('waiting');
          }
        }
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
          setStreak(status.streak ?? 0);
          const uid = await storage.getUserId();
          if (uid) myUserIdRef.current = uid;
          setAppState('ready');
          registerAndUpdateToken();
        }
      } catch (err) {
        if (err instanceof AuthError) {
          await storage.clearAll();
          setAppState('setup');
        }
      }
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

    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [appState]);

  // Foreground = clear the visual icon badge so a stale "5" doesn't linger.
  // We deliberately do NOT advance the server's last_read pointer here —
  // that only happens when the user actually views HistoryScreen (see
  // handleLatestSeen). The next push will recompute badge from real unread.
  useEffect(() => {
    Notifications.setBadgeCountAsync(0);
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') Notifications.setBadgeCountAsync(0);
    });
    return () => sub.remove();
  }, []);

  // Detect new partner activity on 每日 tab (daily question or daily snap).
  // Compares server state vs last-seen state stored locally; sets the red
  // dot if partner has done something new since user last visited the tab.
  useEffect(() => {
    if (appState !== 'ready') return;

    const checkDaily = async () => {
      try {
        const [dq, sn] = await Promise.all([
          api.getDailyQuestion(),
          api.getSnapToday(),
        ]);
        const seen = await storage.getDailySeen();
        const isSameDay = seen.date === dq.date;
        const newPA = dq.partner_answered && (!isSameDay || !seen.pa);
        const newPS = sn.partner_snapped && (!isSameDay || !seen.ps);
        if (newPA || newPS) {
          if (activeTabRef.current !== 'Us') {
            setHasUnreadDaily(true);
          } else {
            // Already on the tab — mark as seen
            await storage.setDailySeen(dq.date, dq.partner_answered, sn.partner_snapped);
          }
        }
      } catch {}
    };

    checkDaily();
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') checkDaily();
    });
    return () => sub.remove();
  }, [appState]);

  // Listen for foreground push notifications and flag relevant ones.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { actionType?: string };
      if (!data?.actionType) return;
      const dailyTypes = ['daily_answer', 'daily_both', 'snap_submitted', 'snap_both'];
      if (dailyTypes.includes(data.actionType) && activeTabRef.current !== 'Us') {
        setHasUnreadDaily(true);
      }
    });
    return () => sub.remove();
  }, []);

  const handleDailyTabFocus = useCallback(async () => {
    setHasUnreadDaily(false);
    try {
      const [dq, sn] = await Promise.all([
        api.getDailyQuestion(),
        api.getSnapToday(),
      ]);
      await storage.setDailySeen(dq.date, dq.partner_answered, sn.partner_snapped);
    } catch {}
  }, []);

  // Socket lifecycle: connect when ready, handle foreground/background
  useEffect(() => {
    if (appState !== 'ready') return;

    connectSocket();

    const sub = RNAppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        connectSocket();
      } else {
        disconnectSocket();
      }
    });

    return () => {
      sub.remove();
      disconnectSocket();
    };
  }, [appState]);

  const handleLatestSeen = useCallback((id: number) => {
    if (id > lastSeenIdRef.current) lastSeenIdRef.current = id;
    setHasUnread(false);
    // Push the new high-water mark to the server so badge counts reset.
    Notifications.setBadgeCountAsync(0);
    if (id > 0) {
      api.markRead(id).catch(() => {});
    }
  }, []);

  const handleRegistered = useCallback(async (result: { partner_name: string | null }) => {
    const uid = await storage.getUserId();
    if (uid) myUserIdRef.current = uid;

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
          if (route.name === 'Us') {
            handleDailyTabFocus();
          }
        }}
      >
        <MainTabs partnerName={partnerName} streak={streak} hasUnread={hasUnread} hasUnreadDaily={hasUnreadDaily} onLatestSeen={handleLatestSeen} />
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
