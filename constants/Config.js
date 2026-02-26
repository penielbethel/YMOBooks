import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Resolve API base URL with the following priority:
// 1) EXPO_PUBLIC_API_BASE_URL (set at bundle/build time)
// 2) app.json -> expo.extra.apiBaseUrl
// 3) Fallback to localhost for USB debugging
const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const configUrl = Constants?.expoConfig?.extra?.apiBaseUrl;

// Base resolution
const FALLBACK_URL = 'https://ymobooks.vercel.app';
let base = envUrl || configUrl || FALLBACK_URL;

// Ensure base is a string
base = String(base || FALLBACK_URL);

// When running on a physical device or native simulator, "localhost" points to the device.
// Rewrite to the Expo dev host IP so the app can reach your local backend.
if (Platform.OS !== 'web' && base.includes('localhost')) {
  const hostUri = Constants?.expoConfig?.hostUri || Constants?.manifest?.debuggerHost;
  if (hostUri && typeof hostUri === 'string') {
    const ip = hostUri.split(':')[0];
    if (ip && /\d+\.\d+\.\d+\.\d+/.test(ip)) {
      base = base.replace('localhost', ip);
    }
  }
}

export const Config = {
  API_BASE_URL: base,
  UPLOADCARE_PUBLIC_KEY: '608f1703ba6637c4fc73',
};