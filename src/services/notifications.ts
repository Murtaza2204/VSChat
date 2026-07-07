import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectSocket } from '../utils/socket';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { API_BASE_URL } from '../config/api';
import { navigate } from '../navigation/NavigationService';
import { playIncomingRingtone, stopCallTone } from './callToneService';
import { emitConversationRefreshRequested } from '../utils/socket';
import messagesApi from '../utils/messages';

const RECENTLY_READ_MESSAGES_KEY = 'recentlyReadMessageIds';
const READ_CONVERSATION_PREFIX = 'conversationReadAt:';
const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';
const PENDING_NOTIFICATION_REPLY_PREFIX = 'pendingNotificationReplies:';
const ENDED_CALL_NOTIFICATION_IDS_KEY = 'endedCallNotificationIds';
const MESSAGE_NOTIFICATION_CHANNEL_ID = 'message_notifications_v1';

const getNotificationId = (data: any) => String(data?.notificationId || data?.messageId || data?.callId || '');
const getStringValue = (value: any, fallback = '') => (value === undefined || value === null ? fallback : String(value));

const getNotificationReplyText = (input: any) => {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return getStringValue(input);

  const candidates = [
    (input as any).reply,
    (input as any).text,
    (input as any).value,
    (input as any).input,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const text = String(candidate).trim();
      if (text) return text;
    }
  }

  return '';
};

const getStoredUser = async () => {
  const storeUser = useAuthStore.getState().user;
  if (storeUser) return storeUser;
  try {
    const raw = await AsyncStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const getPendingNotificationReplyKey = (conversationId?: string) =>
  conversationId ? `${PENDING_NOTIFICATION_REPLY_PREFIX}${conversationId}` : '';

export const consumePendingNotificationReplies = async (conversationId?: string) => {
  const key = getPendingNotificationReplyKey(conversationId);
  if (!key) return [];
  try {
    const raw = await AsyncStorage.getItem(key);
    await AsyncStorage.removeItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const queuePendingNotificationReply = async (conversationId: string, message: any) => {
  const key = getPendingNotificationReplyKey(conversationId);
  if (!key || !message) return;
  try {
    const raw = await AsyncStorage.getItem(key);
    const current = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(current) ? current : [];
    next.push(message);
    await AsyncStorage.setItem(key, JSON.stringify(next.slice(-20)));
  } catch (e) {}
};

export const getNotificationsEnabled = async () => {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch (e) {
    return true;
  }
};

export const requestNotificationPermission = async () => {
  try {
    const messagingStatus = await messaging().requestPermission();
    let notifeeGranted = true;
    try {
      const settings = await notifee.requestPermission();
      notifeeGranted = Number((settings as any)?.authorizationStatus ?? 0) > 0;
    } catch (e) {}

    const messagingGranted =
      messagingStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      messagingStatus === messaging.AuthorizationStatus.PROVISIONAL;

    return messagingGranted && notifeeGranted;
  } catch (e) {
    return false;
  }
};

const syncNotificationDeviceRegistration = async (enabled: boolean) => {
  const currentUser = await getStoredUser();
  if (!currentUser?.id) return;

  try {
    const fcmToken = await messaging().getToken();
    await fetch(`${API_BASE_URL}/notifications/devices/${enabled ? 'register' : 'unregister'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        deviceId: 'primary',
        platform: 'react-native',
        fcmToken,
      }),
    });
  } catch (e) {
    console.warn(`[notifications] Failed to ${enabled ? 'register' : 'unregister'} notification device`, e);
  }
};

export const setNotificationsEnabled = async (enabled: boolean) => {
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch (e) {}

  if (!enabled) {
    try {
      await notifee.cancelAllNotifications();
    } catch (e) {}
  }

  await syncNotificationDeviceRegistration(enabled);
};

const getCallerFromData = (data: any) => {
  try {
    if (data.caller) {
      const callerUser = JSON.parse(String(data.caller));
      return {
        id: callerUser.id || callerUser._id,
        name: callerUser.name || callerUser.displayName || 'Unknown',
        avatar: callerUser.avatar || callerUser.profilePictureUrl,
      };
    }
  } catch (e) {}

  return {
    id: data.fromUserId || data.callerId || data.from,
    name: data.callerName || data.title || 'Unknown',
    avatar: data.callerAvatar,
  };
};

const getGroupParticipantsFromData = (data: any) => {
  try {
    if (Array.isArray(data?.groupParticipants)) return data.groupParticipants;
    if (typeof data?.groupParticipants === 'string' && data.groupParticipants) {
      const parsed = JSON.parse(String(data.groupParticipants));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {}
  return [];
};

const emitCallResponseFromNotification = async (data: any, response: 'accept' | 'decline') => {
  const caller = getCallerFromData(data);
  const currentUser = await getStoredUser();
  if (!caller.id || !currentUser?.id || !data.callId) return;

  const token = await AsyncStorage.getItem('accessToken');
  const socket = connectSocket(token);
  const payload = {
    toUserId: String(caller.id),
    fromUserId: String(currentUser.id),
    response,
    callId: getStringValue(data.callId || data.id),
  };

  if (socket.connected) {
    socket.emit('call:response', payload);
    return;
  }

  socket.once('connect', () => socket.emit('call:response', payload));
  setTimeout(() => {
    try {
      if (!socket.connected) return;
      socket.emit('call:response', payload);
    } catch (e) {}
  }, 1000);
};

const navigateToActiveCall = (data: any) => {
  const caller = getCallerFromData(data);
  const isGroupCall = String(data?.isGroupCall) === 'true';
  const groupParticipants = getGroupParticipantsFromData(data);
  navigate('Main', {
    screen: 'Calls',
    params: {
      screen: isGroupCall ? 'GroupActiveCall' : 'ActiveCall',
      params: {
        callType: data.callType || 'audio',
        callerName: caller.name,
        callerAvatar: caller.avatar,
        callerId: caller.id,
        appId: data.appId,
        channel: data.channel,
        token: data.token,
        callId: data.callId,
        isReceiver: true,
        isGroupCall,
        groupId: data.groupId,
        groupName: data.groupName || caller.name,
        groupAvatar: data.groupAvatar || caller.avatar,
        groupParticipants,
      },
    },
  });
};

const markNotificationMessageRead = async (data: any) => {
  const currentUser = await getStoredUser();
  await rememberReadMessage(data.messageId as string);
  await cancelNotificationForPayload(data);
  if (data.conversationId) await markConversationNotificationsRead(data.conversationId as string);
  await fetch(`${API_BASE_URL}/messages/mark-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: getStringValue(data.messageId), readerId: currentUser?.id }),
  });
};

const replyFromNotification = async (data: any, input: any) => {
  const replyText = getNotificationReplyText(input).trim();
  if (!replyText || !data.conversationId || !data.senderId) return;

  const currentUser = await getStoredUser();
  if (!currentUser?.id) {
    throw new Error('No authenticated user available for notification reply');
  }

  const sent = await messagesApi.sendMessage(
    String(data.conversationId),
    String(currentUser.id),
    replyText,
    'text',
    String(data.senderId),
  );

  if (sent) {
    await queuePendingNotificationReply(String(data.conversationId), sent);
    emitConversationRefreshRequested(data.conversationId);
  }
  await markNotificationMessageRead(data);
};

const handleNotificationAction = async (actionId: string, data: any, input?: any, openUi = true) => {
  if (actionId === 'accept') {
    await cancelNotificationForPayload(data);
    stopCallTone();
    await emitCallResponseFromNotification(data, 'accept');
    if (openUi) navigateToActiveCall(data);
    else await AsyncStorage.setItem('pendingAcceptedCall', JSON.stringify(data));
  } else if (actionId === 'decline') {
    await cancelNotificationForPayload(data);
    stopCallTone();
    await emitCallResponseFromNotification(data, 'decline');
  } else if (actionId === 'mark_read') {
    await markNotificationMessageRead(data);
  } else if (actionId === 'reply') {
    await replyFromNotification(data, input);
  }
};

const rememberReadMessage = async (messageId?: string) => {
  if (!messageId) return;
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_READ_MESSAGES_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    const next = [String(messageId), ...ids.filter((id: string) => id !== String(messageId))].slice(0, 200);
    await AsyncStorage.setItem(RECENTLY_READ_MESSAGES_KEY, JSON.stringify(next));
  } catch (e) {}
};

const isRecentlyReadMessage = async (messageId?: string) => {
  if (!messageId) return false;
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_READ_MESSAGES_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return ids.includes(String(messageId));
  } catch (e) {
    return false;
  }
};

const cancelNotificationForPayload = async (data: any) => {
  const notificationId = getNotificationId(data);
  if (!notificationId) return;
  try { await notifee.cancelNotification(notificationId); } catch (e) {}
  try { await notifee.cancelDisplayedNotification(notificationId); } catch (e) {}
};

const rememberEndedCall = async (callId?: string) => {
  if (!callId) return;
  try {
    const raw = await AsyncStorage.getItem(ENDED_CALL_NOTIFICATION_IDS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    const next = [String(callId), ...(Array.isArray(ids) ? ids : []).filter((id: string) => String(id) !== String(callId))].slice(0, 200);
    await AsyncStorage.setItem(ENDED_CALL_NOTIFICATION_IDS_KEY, JSON.stringify(next));
  } catch (e) {}
};

const wasCallEnded = async (callId?: string) => {
  if (!callId) return false;
  try {
    const raw = await AsyncStorage.getItem(ENDED_CALL_NOTIFICATION_IDS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) && ids.map(String).includes(String(callId));
  } catch (e) {
    return false;
  }
};

const handleCallEndedPayload = async (data: any) => {
  await rememberEndedCall(data?.callId || data?.notificationId || data?.id);
  await cancelNotificationForPayload(data);
  stopCallTone();
  try {
    await AsyncStorage.removeItem('pendingAcceptedCall');
  } catch (e) {}
};

const cancelConversationNotifications = async (conversationId?: string) => {
  if (!conversationId) return;
  try {
    const displayed = await notifee.getDisplayedNotifications();
    await Promise.all(
      displayed
        .filter((item) => String(item.notification?.data?.conversationId || '') === String(conversationId))
        .filter((item) => !!item.id)
        .map((item) => notifee.cancelDisplayedNotification(String(item.id))),
    );
  } catch (e) {}
};

const shouldSuppressNotification = async (data: any) => {
  if (!(await getNotificationsEnabled())) return true;

  const currentUser = useAuthStore.getState().user;
  if (data.senderId && currentUser?.id && String(data.senderId) === String(currentUser.id)) return true;

  if (data.type === 'call' && (await wasCallEnded(data.callId || data.notificationId || data.id))) return true;

  if (data.type === 'call' && data.expiresAt && Date.parse(String(data.expiresAt)) <= Date.now()) return true;

  if (data.type === 'message') {
    if (await isRecentlyReadMessage(data.messageId)) return true;

    if (data.conversationId) {
      const readAt = await AsyncStorage.getItem(`${READ_CONVERSATION_PREFIX}${data.conversationId}`);
      if (readAt && data.sentAt && Date.parse(readAt) >= Date.parse(String(data.sentAt))) return true;

      const currentChat = useChatStore.getState().currentChat;
      const currentConversationId = currentChat && String((currentChat as any).conversationId || currentChat.id);
      if (currentConversationId && currentConversationId === String(data.conversationId)) return true;
    }
  }

  return false;
};

export const markConversationNotificationsRead = async (conversationId?: string) => {
  if (!conversationId) return;
  await AsyncStorage.setItem(`${READ_CONVERSATION_PREFIX}${conversationId}`, new Date().toISOString());
  await cancelConversationNotifications(conversationId);
};

export const clearCallNotification = async (callId?: string) => {
  if (!callId) return;
  await cancelNotificationForPayload({ callId });
};

export const initNotifications = async (onIncomingCall?: (payload: any) => void) => {
  try {
    // create default channel for Android
    try {
      await notifee.createChannel({ id: 'default', name: 'Default', importance: AndroidImportance.HIGH });
    } catch (e) {}

    try {
      await notifee.createChannel({
        id: MESSAGE_NOTIFICATION_CHANNEL_ID,
        name: 'Messages',
        importance: AndroidImportance.DEFAULT,
        sound: 'message_notification',
      });
    } catch (e) {}

    // Foreground messages: display a local notification with actions
    messaging().onMessage(async (remoteMessage) => {
      try {
        const data = remoteMessage.data || {};
        if (data.type === 'call_ended') {
          await handleCallEndedPayload(data);
          return;
        }
        if (await shouldSuppressNotification(data)) {
          await cancelNotificationForPayload(data);
          return;
        }
        const title = getStringValue(data.title, remoteMessage.notification?.title || 'New message');
        const body = getStringValue(data.body, remoteMessage.notification?.body || '');
        const id = getNotificationId(data) || undefined;

        if (data.type === 'call') {
          // Parse caller info from JSON string
          try {
            if (data.caller) {
              const callerUser = JSON.parse(String(data.caller));
              data.fromUser = callerUser;
              data.callerName = callerUser.name || callerUser.displayName || 'Unknown';
              data.callerId = callerUser.id;
            }
          } catch (e) {
            console.warn('Failed to parse caller data', e);
          }
          playIncomingRingtone();
          onIncomingCall && onIncomingCall(data);
          // also show actionable notification
          await notifee.displayNotification({
            id,
            title,
            body,
            android: {
              channelId: 'default',
              smallIcon: 'ic_launcher',
              actions: [
                { title: 'Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
                { title: 'Decline', pressAction: { id: 'decline' } },
              ],
              importance: AndroidImportance.HIGH,
            },
            data,
          });
        } else {
          await notifee.displayNotification({
            id,
            title,
            body,
            android: {
              channelId: MESSAGE_NOTIFICATION_CHANNEL_ID,
              smallIcon: 'ic_launcher',
              actions: [
                { title: 'Reply', pressAction: { id: 'reply' }, input: { allowFreeFormInput: true, placeholder: 'Type a reply' } },
                { title: 'Mark as read', pressAction: { id: 'mark_read' } },
              ],
              importance: AndroidImportance.DEFAULT,
              sound: 'message_notification',
            },
            data,
          });
        }
      } catch (e) {
        console.warn('onMessage handler failed', e);
      }
    });

    // Notification opened while app in background
    messaging().onNotificationOpenedApp((remoteMessage) => {
      const data = remoteMessage?.data || {};
      if (data.type === 'call_ended') {
        handleCallEndedPayload(data).catch(() => {});
        return;
      }
      shouldSuppressNotification(data).then(async (suppress) => {
        if (suppress) {
          await cancelNotificationForPayload(data);
          return;
        }
      if (data.type === 'call') {
        // Parse caller info from JSON string
        try {
          if (data.caller) {
            const callerUser = JSON.parse(String(data.caller));
            data.fromUser = callerUser;
            data.callerName = callerUser.name || callerUser.displayName || 'Unknown';
            data.callerId = callerUser.id;
          }
        } catch (e) {
          console.warn('Failed to parse caller data', e);
        }
        playIncomingRingtone();
        onIncomingCall && onIncomingCall(data);
        // navigate to incoming call screen
        navigate('Main', { screen: 'Calls', params: { screen: 'IncomingCall', params: data } });
      } else if (data.conversationId) {
        markConversationNotificationsRead(data.conversationId as string).catch(() => {});
        navigate('Main', { screen: 'Chats', params: { screen: 'Chat', params: { conversationId: data.conversationId } } });
      }
      }).catch(() => {});
    });

    // When the app is opened from a quit state
    const initial = await messaging().getInitialNotification();
    if (initial) {
      const data = initial.data || {};
      if (data.type === 'call_ended') {
        await handleCallEndedPayload(data);
      } else if (await shouldSuppressNotification(data)) {
        await cancelNotificationForPayload(data);
      } else if (data.type === 'call') {
        // Parse caller info from JSON string
        try {
          if (data.caller) {
            const callerUser = JSON.parse(String(data.caller));
            data.fromUser = callerUser;
            data.callerName = callerUser.name || callerUser.displayName || 'Unknown';
            data.callerId = callerUser.id;
          }
        } catch (e) {
          console.warn('Failed to parse caller data', e);
        }
        playIncomingRingtone();
        onIncomingCall && onIncomingCall(data);
        navigate('Main', { screen: 'Calls', params: { screen: 'IncomingCall', params: data } });
      } else if (data.conversationId) {
        await markConversationNotificationsRead(data.conversationId as string);
        navigate('Main', { screen: 'Chats', params: { screen: 'Chat', params: { conversationId: data.conversationId } } });
      }
    }

    // Notifee event listener for actions (foreground)
    notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        const actionId = detail.pressAction?.id;
        if (!actionId) return;
        const d = detail.notification?.data || {};
        try { await handleNotificationAction(actionId, d, detail.input, true); } catch (e) {}
      }
    });

    // Notifee background events (headless). Store pending incoming call so app can navigate when brought to foreground.
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      try {
        if (type === EventType.ACTION_PRESS) {
          const actionId = detail.pressAction?.id;
          if (!actionId) return;
          const d = detail.notification?.data || {};
          await handleNotificationAction(actionId, d, detail.input, false);
        }
      } catch (e) {
        // background handler must not crash
      }
    });

  } catch (e) {
    console.warn('initNotifications failed', e);
  }
};

export default { initNotifications };
