import { Platform, NativeModules } from 'react-native';

function resolveBaseUrl() {
  // Web can use localhost
  if (Platform.OS === 'web') return 'http://localhost:4000';

  // Native: derive host from Metro script URL when available
  const scriptURL = NativeModules?.SourceCode?.scriptURL || '';
  const match = scriptURL.match(/https?:\/\/(.*?):\d+/);

  // If Metro is running with --localhost (adb reverse), prefer localhost for stable dev connectivity
  if (match && (match[1] === 'localhost' || match[1] === '127.0.0.1')) {
    return 'http://localhost:4000';
  }

  // Otherwise use the detected host (works on emulators if PC IP is reachable)
  if (match && match[1]) {
    return `http://${match[1]}:4000`;
  }

  // Fallback to localhost (works on emulators and with adb reverse on devices)
  return 'http://localhost:4000';
}

export const Config = {
  API_BASE_URL: resolveBaseUrl(),
};