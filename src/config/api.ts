import { Platform } from 'react-native';

// IMPORTANT:
// For physical device via ADB reverse (USB debugging):
// - Run: adb reverse tcp:5000 tcp:5000
// - Use localhost to connect (tunnel forwards to PC's backend)
// - After editing this file, rebuild the app
//
// For direct LAN connection (Wi-Fi):
// - Ensure phone and PC are on same Wi-Fi network
// - Set ANDROID_HOST to your PC's LAN IP (192.168.1.40)
// - Uncomment USE_ADB_REVERSE = false below

const ANDROID_HOST = '192.168.31.150'; // Your PC's LAN IP
const USE_ADB_REVERSE = true; // Set to true when using adb reverse tcp:5000 tcp:5000

const host = Platform.select({
  android: USE_ADB_REVERSE ? 'localhost' : ANDROID_HOST,
  ios: 'localhost',
  default: 'localhost',
});

export const API_BASE_URL = `http://${host}:5000/api`;

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({ baseURL: API_BASE_URL });

// attach access token from AsyncStorage to requests when available
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    // ignore
  }
  return config;
});

export default api;

export const API_BASE = API_BASE_URL; // includes /api
