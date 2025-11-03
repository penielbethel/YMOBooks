import { Platform, NativeModules } from 'react-native';

function resolveBaseUrl() {
  // Web can use localhost
  if (Platform.OS === 'web') return 'http://localhost:4000';
  // Native: try to derive host from Metro script URL
  const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
  const match = scriptURL.match(/https?:\/\/(.*?):\d+/);
  if (match && match[1]) {
    return `http://${match[1]}:4000`;
  }
  // Fallback to localhost (works on emulators, not physical devices)
  return 'http://localhost:4000';
}

export const Config = {
  API_BASE_URL: resolveBaseUrl(),
};