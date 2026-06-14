import io from 'socket.io-client';
import messaging from '@react-native-firebase/messaging';
import { API_BASE_URL } from '../config/api';
import { useAuthStore } from '../stores/authStore';

let socket: any = null;
let onCallResponseListener: ((payload: any) => void) | null = null;
let onIncomingCallListener: ((payload: any) => void) | null = null;
let onCallCreatedListener: ((payload: any) => void) | null = null;
let onCallEndedListener: ((payload: any) => void) | null = null;
let _lastCallCreatedById: Record<string, any> = {};

export const initSignaling = async (onIncomingCall: (payload: any) => void) => {
  const state = useAuthStore.getState();
  const user = state.user;
  if (!user) return;

  console.log('[Signaling] Initializing signaling for user:', user.id);

  // register FCM token with backend
  try {
    const fcmToken = await messaging().getToken();
    await fetch(`${API_BASE_URL}/notifications/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, deviceId: 'primary', platform: 'react-native', fcmToken }),
    });
    console.log('[Signaling] FCM token registered');
  } catch (e) {
    console.warn('[Signaling] Failed to register device token', e);
  }

  onIncomingCallListener = onIncomingCall;

  if (socket && socket.connected) {
    console.log('[Signaling] Socket already connected, reusing');
    return socket;
  }

  const socketUrl = API_BASE_URL.replace(/\/api$/, '').replace(/\/$/, '');
  console.log('[Signaling] Connecting to socket at:', socketUrl);

  socket = io(socketUrl, { 
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('[Signaling] Socket connected, registering user:', user.id);
    socket.emit('register', { userId: user.id });
  });

  socket.on('connect_error', (error: any) => {
    console.error('[Signaling] Connection error:', error);
  });

  socket.on('disconnect', (reason: string) => {
    console.warn('[Signaling] Socket disconnected:', reason);
  });

  socket.on('call:incoming', (payload: any) => {
    console.log('[Signaling] Received call:incoming:', payload);
    onIncomingCallListener && onIncomingCallListener(payload);
  });

  socket.on('call:response', (payload: any) => {
    console.log('[Signaling] Received call:response:', payload);
    onCallResponseListener && onCallResponseListener(payload);
  });

  socket.on('call:created', (payload: any) => {
    console.log('[Signaling] Received call:created:', payload);
    try {
      if (payload && payload.callId) _lastCallCreatedById[String(payload.callId)] = payload;
    } catch (e) {}
    onCallCreatedListener && onCallCreatedListener(payload);
  });

  socket.on('call:ended', (payload: any) => {
    console.log('[Signaling] Received call:ended:', payload);
    try { onCallEndedListener && onCallEndedListener(payload); } catch (e) {}
  });

  return socket;
};

export const inviteCall = (toUserId: string, callType = 'audio', extra: any = {}) => {
  if (!socket || !socket.connected) {
    console.warn('[Signaling] Socket not connected, cannot send invite');
    return;
  }
  const state = useAuthStore.getState();
  const user = state.user;
  const invite = {
    toUserId,
    fromUser: user,
    callType,
    ...extra,
  };
  console.log('[Signaling] Sending call:invite to:', toUserId, 'type:', callType);
  socket.emit('call:invite', invite);
};

export const respondToCall = (toUserId: string, fromUserId: string, response: 'accept' | 'decline', callId?: string) => {
  if (!socket || !socket.connected) {
    console.warn('[Signaling] Socket not connected, cannot send response');
    return;
  }
  const payload = { toUserId, fromUserId, response, callId };
  console.log('[Signaling] Sending call:response:', payload);
  socket.emit('call:response', payload);
};

export const onCallResponse = (listener: (payload: any) => void) => {
  onCallResponseListener = listener;
  console.log('[Signaling] Registered call response listener');
};

export const onCallCreated = (listener: (payload: any) => void) => {
  onCallCreatedListener = listener;
  console.log('[Signaling] Registered call created listener');
};

export const onCallEnded = (listener: (payload: any) => void) => {
  onCallEndedListener = listener;
  console.log('[Signaling] Registered call ended listener');
};

export const getLastCallCreated = (callId?: string) => {
  if (!callId) return null;
  return _lastCallCreatedById[String(callId)] || null;
};

export const getSocket = () => socket;

export default { initSignaling, inviteCall, respondToCall, onCallResponse, getSocket, onCallCreated, getLastCallCreated, onCallEnded };
