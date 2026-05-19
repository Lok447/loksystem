import { ExpoConfig, ConfigContext } from 'expo/config';

import VERSION from './versions/version.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: 'LokSystem Mobile',
    slug: 'loksystem-mobile',
    version: VERSION.version,
    orientation: 'portrait',
    icon: './assets/images/lok-icon.png',
    scheme: 'loksystem-mobile',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'ai.resopod.loksystem',
      buildNumber: String(VERSION.buildNumber),
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: 'LokSystem needs camera access to scan QR codes for server login.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/lok-icon.png',
        backgroundColor: '#f9f9f7',
      },
      package: 'ai.resopod.loksystem',
      versionCode: VERSION.buildNumber,
    },
    web: {
      output: 'static',
      favicon: './assets/images/lok-icon.png',
    },
    splash: {
      image: './assets/images/lok-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#f9f9f7',
    },
    plugins: ['expo-router', 'expo-secure-store', 'expo-dev-client', 'expo-camera'],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: '34b66303-fd5c-4d86-a790-0665d55f2017',
      },
    },
  };
};
