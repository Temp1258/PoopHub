import { Platform, NativeModules } from 'react-native';

const APP_GROUP = 'group.com.couplebuzz.app';

// Widget data bridge: writes to shared UserDefaults for WidgetKit
// This requires the native App Group entitlement configured in app.config.ts
// On non-iOS platforms or when native module is unavailable, this is a no-op

interface WidgetData {
  partnerLastEmoji: string;
  partnerLastActionTime: string;
  streak: number;
  partnerName: string;
}

export function updateWidgetData(data: WidgetData): void {
  if (Platform.OS !== 'ios') return;

  try {
    // Use SharedGroupPreferences native module if available
    const { SharedGroupPreferences } = NativeModules;
    if (SharedGroupPreferences) {
      SharedGroupPreferences.setItem('partnerLastEmoji', data.partnerLastEmoji, APP_GROUP);
      SharedGroupPreferences.setItem('partnerLastActionTime', data.partnerLastActionTime, APP_GROUP);
      SharedGroupPreferences.setItem('streak', String(data.streak), APP_GROUP);
      SharedGroupPreferences.setItem('partnerName', data.partnerName, APP_GROUP);
    }
  } catch {
    // Widget bridge not available in Expo Go, only in production builds
  }
}

export function reloadWidgets(): void {
  if (Platform.OS !== 'ios') return;

  try {
    const { SharedGroupPreferences } = NativeModules;
    if (SharedGroupPreferences?.reloadAllTimelines) {
      SharedGroupPreferences.reloadAllTimelines();
    }
  } catch {}
}
