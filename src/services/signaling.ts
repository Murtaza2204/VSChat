import io from 'socket.io-client';
import messaging from '@react-native-firebase/messaging';
import { API_BASE_URL } from '../config/api';
import { useAuthStore } from '../stores/authStore';

let socket: any = null;

export const initSignaling = async (onIncomingCall: (payload: any) => void) => {
  const state = useAuthStore.getState();
  const user = state.user;
  if (!user) return;

  // register FCM token with backend
  try {
    const fcmToken = await messaging().getToken();
    await fetch(`${API_BASE_URL}/notifications/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, deviceId: 'primary', platform: 'react-native', fcmToken }),
    });
  } catch (e) {
    console.warn('Failed to register device token', e);
  }

  if (socket) return socket;
  socket = io(API_BASE_URL.replace(/\/api$/,'').replace(/\/$/,''), { transports: ['websocket'] });

  socket.on('connect', () => {
    socket.emit('register', { userId: user.id });
  });

  socket.on('call:incoming', (payload: any) => {
    onIncomingCall && onIncomingCall(payload);
  });

  return socket;
};

export const inviteCall = (toUserId: string, callType = 'audio', extra: any = {}) => {
  if (!socket) return;
  const state = useAuthStore.getState();
  const user = state.user;
  const invite = {
    toUserId,
    fromUser: user,
    callType,
    ...extra,
  };
  socket.emit('call:invite', invite);
};

export default { initSignaling, inviteCall };
