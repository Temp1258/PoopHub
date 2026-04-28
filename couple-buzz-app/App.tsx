import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, LogBox, AppState as RNAppState, useWindowDimensions } from 'react-native';

LogBox.ignoreLogs(['Could not access feature flag']);
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';

import { COLORS } from './src/constants';
import { SpringPressable } from './src/components/SpringPressable';
import { ToolbarSlotContext } from './src/utils/toolbarSlot';
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

// Single source of truth for app navigation: lets non-React code (e.g. push
// notification handlers) jump to a tab without going through navigation props.
const navigationRef = createNavigationContainerRef();

// Maps push action types to the tab the user expects to land on when they
// tap the notification. Anything not listed defaults to History (废话区) —
// most emoji actions surface there as feed entries.
const NOTIFICATION_TAB_ROUTES: Record<string, string> = {
  // 拍拍 (touch) — opens Home where the touch UI lives.
  touch: 'Home',

  // Daily content — answers, snaps, urges, reactions, ritual greetings.
  daily_answer: 'Us', daily_both: 'Us',
  snap_submitted: 'Us', snap_both: 'Us',
  urge_question: 'Us', urge_snap: 'Us',
  react_question_up: 'Us', react_question_down: 'Us',
  react_snap_up: 'Us', react_snap_down: 'Us',
  ritual_morning: 'Us', ritual_evening: 'Us',
  ritual_both_morning: 'Us', ritual_both_evening: 'Us',

  // Mailbox + capsules.
  mailbox_open: 'Mailbox', mailbox_written: 'Mailbox',
  mailbox_countdown_15min: 'Mailbox', mailbox_reveal: 'Mailbox',
  capsule_unlock: 'Mailbox', capsule_buried: 'Mailbox',

  // Promises (bucket list + important dates).
  bucket_new: 'Promises', bucket_complete: 'Promises',
  date_new: 'Promises',

  // Weekly stats.
  weekly_report: 'Settings',
};

const tabForActionType = (t?: string): string =>
  (t && NOTIFICATION_TAB_ROUTES[t]) || 'History';

// WeChat-style small red dot anchored to the icon's top-right corner.
function TabIconWithDot({ emoji, color, dot }: { emoji: string; color: string; dot: boolean }) {
  return (
    <View>
      <Text style={{ fontSize: 20, color }}>{emoji}</Text>
      {dot && (
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
  );
}

type AppState = 'loading' | 'setup' | 'waiting' | 'ready';

function PillTab({
  isFocused, label, renderIcon, onPress, pillH, radius, labelSize,
}: {
  isFocused: boolean;
  label: string;
  renderIcon: ((props: { focused: boolean; color: string }) => React.ReactNode) | undefined;
  onPress: () => void;
  pillH: number;
  radius: number;
  labelSize: number;
}) {
  const tint = isFocused ? COLORS.white : COLORS.textLight;

  return (
    <SpringPressable
      onPress={onPress}
      wrapperStyle={{ flex: 1 }}
      style={{
        height: pillH,
        borderRadius: radius,
        backgroundColor: isFocused ? COLORS.kiss : COLORS.white,
        borderWidth: isFocused ? 0 : 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {renderIcon && renderIcon({ focused: isFocused, color: tint })}
      <Text style={{
        fontSize: labelSize,
        fontWeight: '600',
        color: tint,
        marginTop: 2,
      }}>{label}</Text>
    </SpringPressable>
  );
}

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

  // Fade-up overlay floats ABOVE the solid bar slot so screen content visibly
  // fades into the bar instead of the "transparent" top just revealing the
  // same flat tint. Height ~16% of screen width gives a soft 60-70pt ramp.
  const fadeH = width * 0.16;
  const fadeColors = useMemo(
    () => ['rgba(255,245,245,0)', COLORS.background] as [string, string],
    []
  );

  return (
    <View>
      <LinearGradient
        colors={fadeColors}
        locations={[0, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -fadeH,
          height: fadeH,
        }}
        pointerEvents="none"
      />
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

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <PillTab
              key={route.key}
              isFocused={isFocused}
              label={label}
              renderIcon={renderIcon}
              onPress={onPress}
              pillH={pillH}
              radius={radius}
              labelSize={labelSize}
            />
          );
        })}
      </View>
    </View>
  );
}

function MainTabs({
  partnerName, streak, hasUnread, hasUnreadDaily, hasUnreadHome, hasUnreadMail, hasUnreadPromises, onLatestSeen,
}: {
  partnerName: string;
  streak: number;
  hasUnread: boolean;
  hasUnreadDaily: boolean;
  hasUnreadHome: boolean;
  hasUnreadMail: boolean;
  hasUnreadPromises: boolean;
  onLatestSeen: (id: number) => void;
}) {
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      tabBar={(props) => <PillTabBar {...props} />}
      screenOptions={{
        // Swipe-between-tabs is part of the UX. Disabling pager animation on
        // taps (animationEnabled: false) keeps rapid taps from queueing up
        // tween calls behind each other — the gesture-driven swipe still
        // animates via the native pager's own physics on release.
        swipeEnabled: true,
        animationEnabled: false,
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: '拍拍',
          tabBarIcon: ({ color }) => <TabIconWithDot emoji="🤚" color={color} dot={hasUnreadHome} />,
        }}
      >
        {() => <HomeScreen partnerName={partnerName} streak={streak} />}
      </Tab.Screen>
      <Tab.Screen
        name="History"
        options={{
          tabBarLabel: '废话区',
          tabBarIcon: ({ color }) => <TabIconWithDot emoji="💬" color={color} dot={hasUnread} />,
        }}
      >
        {() => <HistoryScreen partnerName={partnerName} onLatestSeen={onLatestSeen} />}
      </Tab.Screen>
      <Tab.Screen
        name="Us"
        component={UsScreen}
        options={{
          tabBarLabel: '每日',
          tabBarIcon: ({ color }) => <TabIconWithDot emoji="📅" color={color} dot={hasUnreadDaily} />,
        }}
      />
      <Tab.Screen
        name="Mailbox"
        component={MailboxScreen}
        options={{
          tabBarLabel: '信箱',
          tabBarIcon: ({ color }) => <TabIconWithDot emoji="📮" color={color} dot={hasUnreadMail} />,
        }}
      />
      <Tab.Screen
        name="Promises"
        component={AnniversaryWishScreen}
        options={{
          tabBarLabel: '约定',
          tabBarIcon: ({ color }) => <TabIconWithDot emoji="🎀" color={color} dot={hasUnreadPromises} />,
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
  const [hasUnreadMail, setHasUnreadMail] = useState(false);
  const [hasUnreadPromises, setHasUnreadPromises] = useState(false);
  const [hasUnreadHome, setHasUnreadHome] = useState(false);
  const activeTabRef = useRef('Home');
  const initializedRef = useRef(false);
  const myUserIdRef = useRef('');
  const [overlay, setOverlay] = useState<React.ReactNode>(null);
  const toolbarSlot = useMemo(() => ({ set: setOverlay }), []);

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

  // Listen for foreground push notifications and flag the corresponding tab
  // (red dot). Same routing table is reused for tap-to-navigate below, so
  // adding a new push action type only needs an entry in NOTIFICATION_TAB_ROUTES.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { actionType?: string };
      const target = tabForActionType(data?.actionType);
      if (target === activeTabRef.current) return;
      if (target === 'Us') setHasUnreadDaily(true);
      else if (target === 'Mailbox') setHasUnreadMail(true);
      else if (target === 'Promises') setHasUnreadPromises(true);
      else if (target === 'Home') setHasUnreadHome(true);
      else if (target === 'History') setHasUnread(true);
    });
    return () => sub.remove();
  }, []);

  // Tap-to-navigate: when the user taps a delivered notification, jump to the
  // tab that shows that content. Handles both background-tap (listener fires
  // on relaunch) and cold-launch via getLastNotificationResponseAsync.
  useEffect(() => {
    if (appState !== 'ready') return;

    const navigateToTabFor = (actionType?: string) => {
      const target = tabForActionType(actionType);
      if (navigationRef.isReady()) navigationRef.navigate(target as never);
    };

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as { actionType?: string };
      navigateToTabFor(data?.actionType);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { actionType?: string };
      navigateToTabFor(data?.actionType);
    });
    return () => sub.remove();
  }, [appState]);

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
      <ToolbarSlotContext.Provider value={toolbarSlot}>
        <View style={styles.appRoot}>
          <NavigationContainer
            ref={navigationRef}
            onStateChange={(state) => {
              if (!state) return;
              const route = state.routes[state.index];
              activeTabRef.current = route.name;
              if (route.name === 'History') setHasUnread(false);
              if (route.name === 'Us') handleDailyTabFocus();
              if (route.name === 'Mailbox') setHasUnreadMail(false);
              if (route.name === 'Promises') setHasUnreadPromises(false);
              if (route.name === 'Home') setHasUnreadHome(false);
            }}
          >
            <MainTabs
              partnerName={partnerName}
              streak={streak}
              hasUnread={hasUnread}
              hasUnreadDaily={hasUnreadDaily}
              hasUnreadHome={hasUnreadHome}
              hasUnreadMail={hasUnreadMail}
              hasUnreadPromises={hasUnreadPromises}
              onLatestSeen={handleLatestSeen}
            />
          </NavigationContainer>
          {overlay && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {overlay}
            </View>
          )}
        </View>
      </ToolbarSlotContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
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
