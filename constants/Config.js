import Constants from 'expo-constants';

// Resolve API base URL with the following priority:
// 1) EXPO_PUBLIC_API_BASE_URL (set at bundle/build time)
// 2) app.json -> expo.extra.apiBaseUrl
// 3) Fallback to localhost for USB debugging
const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const configUrl = Constants?.expoConfig?.extra?.apiBaseUrl;

export const Config = {
  API_BASE_URL: envUrl || configUrl || 'http://localhost:4000',
};