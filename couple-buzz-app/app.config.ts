import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '拉无忧',
  slug: 'couple-buzz',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  updates: {
    url: "https://u.expo.dev/a6ec0a8e-b73d-4be3-b927-cf8b435f1ab7",
  },
  runtimeVersion: {
    policy: "appVersion" as const,
  },
  splash: {
    backgroundColor: '#FFF5F5',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.couplebuzz.app',
    appleTeamId: 'HLX9N5V2R5',
    entitlements: {
      'com.apple.security.application-groups': ['group.com.couplebuzz.app'],
    },
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
    },
  },
  plugins: [
    ['expo-notifications', { sounds: [] }],
    '@bacons/apple-targets',
    '@react-native-community/datetimepicker',
  ],
  extra: {
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    eas: {
      projectId: 'a6ec0a8e-b73d-4be3-b927-cf8b435f1ab7',
    },
  },
});
