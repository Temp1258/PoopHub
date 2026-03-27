import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { storage } from '../utils/storage';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function getDeviceToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return token.data as string;
  } catch (error) {
    console.warn('Failed to get device push token:', error);
    return null;
  }
}

export async function registerAndUpdateToken(): Promise<void> {
  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  const token = await getDeviceToken();
  if (!token) return;

  const userId = await storage.getUserId();
  if (!userId) return;

  try {
    await api.updateToken(userId, token);
  } catch (error) {
    console.warn('Failed to update device token:', error);
  }
}
