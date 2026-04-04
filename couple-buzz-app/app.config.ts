import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '香宝聚集地',
  slug: 'couple-buzz',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  splash: {
    backgroundColor: '#FFF5F5',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.couplebuzz.app',
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
      projectId: '',
    },
  },
});
