import { Platform } from 'react-native';

// IMPORTANT:
// - When testing on a PHYSICAL device, set `ANDROID_HOST` below to your
//   development machine's LAN IP (eg. 192.168.1.42). The emulator uses
//   special loopback addresses (10.0.2.2 for Android emulator) but a
//   physical device cannot reach `localhost` on your PC.
// - After editing this file, rebuild the app so the change takes effect.

// Replace this with your PC's LAN IP when using a real device.
const ANDROID_HOST = '192.168.31.150';

const host = Platform.select({
  // Emulator loopback (keep if you use emulator)
  android: ANDROID_HOST === 'REPLACE_WITH_YOUR_PC_IP' ? '10.0.2.2' : ANDROID_HOST,
  ios: 'localhost',
  default: 'localhost',
});

export const API_BASE_URL = `http://${host}:5000/api`;
