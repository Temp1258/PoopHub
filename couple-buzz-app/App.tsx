import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';

import { COLORS } from './src/constants';
import { storage } from './src/utils/storage';
import { registerAndUpdateToken } from './src/services/notification';
import { api } from './src/services/api';
import SetupScreen from './src/screens/SetupScreen';
import PairScreen from './src/screens/PairScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';

const Tab = createBottomTabNavigator();

type AppState = 'loading' | 'setup' | 'pair' | 'ready';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [pairCode, setPairCode] = useState('');
  const [partnerName, setPartnerName] = useState('');

  useEffect(() => {
    (async () => {
      const userId = await storage.getUserId();
      if (!userId) {
        setAppState('setup');
        return;
      }

      const savedPairCode = await storage.getPairCode();
      const savedPartnerName = await storage.getPartnerName();

      if (!savedPartnerName) {
        setPairCode(savedPairCode || '');
        setAppState('pair');
        return;
      }

      setPartnerName(savedPartnerName);
      setAppState('ready');

      registerAndUpdateToken();
    })();
  }, []);

  const handleUnpair = useCallback(async () => {
    try {
      const result = await api.unpair();
      await storage.clearPartnerData();
      await storage.setPairCode(result.new_pair_code);
      setPairCode(result.new_pair_code);
      setPartnerName('');
      setAppState('pair');
    } catch (error: any) {
      console.warn('Unpair failed:', error.message);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Continue with local cleanup even if server call fails
    }
    await storage.clearAll();
    setPairCode('');
    setPartnerName('');
    setAppState('setup');
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
      <>
        <StatusBar style="dark" />
        <SetupScreen
          onRegistered={(code) => {
            setPairCode(code);
            setAppState('pair');
          }}
        />
      </>
    );
  }

  if (appState === 'pair') {
    return (
      <>
        <StatusBar style="dark" />
        <PairScreen
          pairCode={pairCode}
          onPaired={(name) => {
            setPartnerName(name);
            setAppState('ready');
            registerAndUpdateToken();
          }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: COLORS.white,
              borderTopColor: COLORS.border,
              height: 85,
              paddingBottom: 28,
              paddingTop: 8,
            },
            tabBarActiveTintColor: COLORS.kiss,
            tabBarInactiveTintColor: COLORS.textLight,
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '600',
            },
          }}
        >
          <Tab.Screen
            name="Home"
            options={{
              tabBarLabel: '首页',
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🏠</Text>,
            }}
          >
            {() => (
              <HomeScreen
                partnerName={partnerName}
                onUnpair={handleUnpair}
                onLogout={handleLogout}
              />
            )}
          </Tab.Screen>
          <Tab.Screen
            name="History"
            component={HistoryScreen}
            options={{
              tabBarLabel: '记录',
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📋</Text>,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
