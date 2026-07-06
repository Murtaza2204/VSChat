import io from 'socket.io-client';
import messaging from '@react-native-firebase/messaging';
import { API_BASE_URL } from '../config/api';
import { useAuthStore } from '../stores/authStore';
import { playIncomingRingtone, playOutgoingRingback, stopCallTone } from './callToneService';
import { getNotificationsEnabled } from './notifications';

let socket: any = null;
let onIncomingCallListener: ((payload: any) => void) | null = null;
const callResponseListeners = new Set<(payload: any) => void>();
const callCreatedListeners = new Set<(payload: any) => void>();
const callSessionStateListeners = new Set<(payload: any) => void>();
const callEndedListeners = new Set<(payload: any) => void>();
let _lastCallCreatedById: Record<string, any> = {};

export const initSignaling = async (onIncomingCall: (payload: any) => void) => {
  const state = useAuthStore.getState();
  const user = state.user;
  if (!user) return;

  console.log('[Signaling] Initializing signaling for user:', user.id);

  // register FCM token with backend
  try {
    const notificationsEnabled = await getNotificationsEnabled();
    if (notificationsEnabled) {
      const fcmToken = await messaging().getToken();
      await fetch(`${API_BASE_URL}/notifications/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, deviceId: 'primary', platform: 'react-native', fcmToken }),
      });
      console.log('[Signaling] FCM token registered');
    } else {
      console.log('[Signaling] Notifications disabled, skipping FCM registration');
    }
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
    playIncomingRingtone();
    onIncomingCallListener && onIncomingCallListener(payload);
  });

  socket.on('call:response', (payload: any) => {
    console.log('[Signaling] Received call:response:', payload);
    stopCallTone();
    callResponseListeners.forEach((listener) => {
      try { listener(payload); } catch (e) {}
    });
  });

  socket.on('call:created', (payload: any) => {
    console.log('[Signaling] Received call:created:', payload);
    try {
      if (payload && payload.callId) _lastCallCreatedById[String(payload.callId)] = payload;
    } catch (e) {}
    callCreatedListeners.forEach((listener) => {
      try { listener(payload); } catch (e) {}
    });
  });

  socket.on('call:session:state', (payload: any) => {
    console.log('[Signaling] Received call:session:state:', payload);
    callSessionStateListeners.forEach((listener) => {
      try { listener(payload); } catch (e) {}
    });
  });

  socket.on('call:ended', (payload: any) => {
    console.log('[Signaling] Received call:ended:', payload);
    stopCallTone();
    callEndedListeners.forEach((listener) => {
      try { listener(payload); } catch (e) {}
    });
  });

  return socket;
};

export const inviteCall = (toUserIdOrUserIds: string | string[], callType = 'audio', extra: any = {}) => {
  if (!socket || !socket.connected) {
    console.warn('[Signaling] Socket not connected, cannot send invite');
    return;
  }
  const state = useAuthStore.getState();
  const user = state.user;
  const recipientIds = Array.isArray(toUserIdOrUserIds)
    ? toUserIdOrUserIds.filter(Boolean).map(String)
    : [String(toUserIdOrUserIds)].filter(Boolean);
  const invite = {
    toUserId: recipientIds[0] || undefined,
    toUserIds: recipientIds,
    fromUser: user,
    callType,
    ...extra,
  };
  console.log('[Signaling] Sending call:invite to:', recipientIds, 'type:', callType);
  socket.emit('call:invite', invite);
  playOutgoingRingback();
};

export const respondToCall = (toUserId: string, fromUserId: string, response: 'accept' | 'decline', callId?: string) => {
  if (!socket || !socket.connected) {
    console.warn('[Signaling] Socket not connected, cannot send response');
    return;
  }
  const payload = { toUserId, fromUserId, response, callId };
  console.log('[Signaling] Sending call:response:', payload);
  socket.emit('call:response', payload);
  stopCallTone();
};

export const endCall = async (callId: string, userId: string, reason = 'hangup') => {
  if (!callId || !userId) return;
  const payload = { callId, userId, reason };

  if (socket && socket.connected) {
    console.log('[Signaling] Sending call:ended:', payload);
    socket.emit('call:ended', payload);
    stopCallTone();
    return;
  }

  console.warn('[Signaling] Socket not connected, ending call via HTTP fallback');
  const res = await fetch(`${API_BASE_URL}/calls/${encodeURIComponent(callId)}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to end call (${res.status})`);
  }
  stopCallTone();
};

export const onCallResponse = (listener: (payload: any) => void) => {
  callResponseListeners.add(listener);
  console.log('[Signaling] Registered call response listener');
  return () => {
    callResponseListeners.delete(listener);
  };
};

export const onCallCreated = (listener: (payload: any) => void) => {
  callCreatedListeners.add(listener);
  console.log('[Signaling] Registered call created listener');
  return () => {
    callCreatedListeners.delete(listener);
  };
};

export const onCallSessionState = (listener: (payload: any) => void) => {
  callSessionStateListeners.add(listener);
  console.log('[Signaling] Registered call session state listener');
  return () => {
    callSessionStateListeners.delete(listener);
  };
};

export const onCallEnded = (listener: (payload: any) => void) => {
  callEndedListeners.add(listener);
  console.log('[Signaling] Registered call ended listener');
  return () => {
    callEndedListeners.delete(listener);
  };
};

export const getLastCallCreated = (callId?: string) => {
  if (!callId) return null;
  return _lastCallCreatedById[String(callId)] || null;
};

export const getSocket = () => socket;

export const requestCallSessionState = (callId?: string) => {
  if (!socket || !socket.connected || !callId) return;
  socket.emit('call:session:get', { callId });
};

export const updateCallParticipantState = (payload: {
  callId?: string;
  userId?: string;
  rtcUid?: number | null;
  videoEnabled?: boolean;
  cameraFacing?: 'front' | 'rear';
  joinedAt?: string | Date;
}) => {
  if (!socket || !socket.connected || !payload?.callId || !payload?.userId) return;
  socket.emit('call:participant:state', payload);
};

export default {
  initSignaling,
  inviteCall,
  respondToCall,
  endCall,
  onCallResponse,
  getSocket,
  onCallCreated,
  getLastCallCreated,
  onCallEnded,
  onCallSessionState,
  requestCallSessionState,
  updateCallParticipantState,
};
