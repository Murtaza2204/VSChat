import { Platform } from 'react-native';

const host = Platform.select({
  android: '10.0.2.2',
  ios: 'localhost',
  default: 'localhost',
});

export const API_BASE_URL = `http://${host}:5000/api`;
