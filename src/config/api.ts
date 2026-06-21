import { Platform } from 'react-native';

// Network configuration for API access from different devices:
// - For Android emulator (default Android Studio emulator) use 10.0.2.2
// - For Genymotion emulator use 10.0.3.2
// - For physical Android device over USB use adb reverse: adb reverse tcp:5000 tcp:5000 and set USE_ADB_REVERSE = true
// - For physical device over LAN set USE_ADB_REVERSE = false and configure ANDROID_HOST to your PC IP
// Common workflow:
// 1) Fast local dev on a physical device (USB): run `adb reverse tcp:5000 tcp:5000` and keep USE_ADB_REVERSE=true
// 2) If you use an emulator, set USE_ANDROID_EMULATOR=true (or leave adb reverse off) and emulator host will be used
// 3) For LAN testing (Wi‑Fi), set USE_ADB_REVERSE=false and set ANDROID_HOST to your PC's LAN IP

const ANDROID_HOST = '10.249.11.42'; // <-- Replace with your PC LAN IP when testing over Wi-Fi
const USE_ADB_REVERSE = true; // true = use adb reverse + localhost (USB physical device)
const USE_ANDROID_EMULATOR = false; // true = prefer emulator host (10.0.2.2 for Android emulator)

const EMULATOR_HOST_ANDROID = '10.0.2.2'; // Android emulator (Android Studio)
const GENYMOTION_HOST = '10.0.3.2';

const androidHost = USE_ADB_REVERSE
  ? 'localhost'
  : USE_ANDROID_EMULATOR
  ? EMULATOR_HOST_ANDROID  : ANDROID_HOST;

const host = Platform.select({
  android: androidHost,
  ios: 'localhost', // iOS simulator can use localhost; physical iOS device must use LAN IP
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

let isRefreshing = false;
let refreshPromise: Promise<string | undefined> | null = null;

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest || originalRequest._retry) return Promise.reject(error);

    if (error.response && error.response.status === 401) {
      // avoid multiple simultaneous refresh calls
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = (async () => {
          try {
            const refreshToken = await AsyncStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');
            const resp = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = resp.data || {};
            if (accessToken) await AsyncStorage.setItem('accessToken', accessToken);
            if (newRefreshToken) await AsyncStorage.setItem('refreshToken', newRefreshToken);
            isRefreshing = false;
            return accessToken;
          } catch (e) {
            isRefreshing = false;
            throw e;
          }
        })();
      }

      try {
        const newAccessToken = await refreshPromise;
        if (newAccessToken) {
          originalRequest._retry = true;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axios(originalRequest);
        }
      } catch (e) {
        // refresh failed — clear tokens and let caller handle (app should redirect to login)
        try { await AsyncStorage.removeItem('accessToken'); await AsyncStorage.removeItem('refreshToken'); } catch (er) {}
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default api;

export const API_BASE = API_BASE_URL; // includes /api
