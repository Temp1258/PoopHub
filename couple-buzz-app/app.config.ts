import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Couple Buzz',
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
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
    },
  },
  plugins: [
    ['expo-notifications', { sounds: [] }],
  ],
  extra: {
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    eas: {
      projectId: '',
    },
  },
});
