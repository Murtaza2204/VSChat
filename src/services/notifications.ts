import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectSocket } from '../utils/socket';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { API_BASE_URL } from '../config/api';
import { navigate } from '../navigation/NavigationService';

const RECENTLY_READ_MESSAGES_KEY = 'recentlyReadMessageIds';
const READ_CONVERSATION_PREFIX = 'conversationReadAt:';

const getNotificationId = (data: any) => String(data?.notificationId || data?.messageId || data?.callId || '');
const getStringValue = (value: any, fallback = '') => (value === undefined || value === null ? fallback : String(value));

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
  const currentUser = useAuthStore.getState().user;
  if (data.senderId && currentUser?.id && String(data.senderId) === String(currentUser.id)) return true;

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
    // request firebase messaging permission
    const authStatus = await messaging().requestPermission();
    const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) return;

    // create default channel for Android
    try {
      await notifee.createChannel({ id: 'default', name: 'Default', importance: AndroidImportance.HIGH });
    } catch (e) {}

    // Foreground messages: display a local notification with actions
    messaging().onMessage(async (remoteMessage) => {
      try {
        const data = remoteMessage.data || {};
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
                { title: 'Accept', pressAction: { id: 'accept' } },
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
              channelId: 'default',
              smallIcon: 'ic_launcher',
              actions: [
                { title: 'Reply', pressAction: { id: 'reply' }, input: { allowFreeFormInput: true, placeholder: 'Type a reply' } },
                { title: 'Mark as read', pressAction: { id: 'mark_read' } },
              ],
              importance: AndroidImportance.DEFAULT,
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
      if (await shouldSuppressNotification(data)) {
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
        if (actionId === 'accept') {
          await cancelNotificationForPayload(d);
          // Parse caller info
          let callerId;
          try {
            if (d.caller) {
              const callerUser = JSON.parse(String(d.caller));
              callerId = callerUser.id;
            } else {
              callerId = d.fromUserId || d.callerId;
            }
          } catch (e) {
            callerId = d.fromUserId || d.callerId;
          }
          // navigate to incoming call only. Do NOT emit an automatic accept from the notification
          // Accepting the call must be done explicitly in the Incoming/Receiver UI.
          navigate('Main', { screen: 'Calls', params: { screen: 'IncomingCall', params: d } });
        } else if (actionId === 'decline') {
          await cancelNotificationForPayload(d);
          // Parse caller info
          let callerId;
          try {
            if (d.caller) {
              const callerUser = JSON.parse(String(d.caller));
              callerId = callerUser.id;
            } else {
              callerId = d.fromUserId || d.callerId;
            }
          } catch (e) {
            callerId = d.fromUserId || d.callerId;
          }
          // send decline/response to server via socket
          (async () => {
            try {
              const token = await AsyncStorage.getItem('accessToken');
              const socket = connectSocket(token);
              const currentUser = useAuthStore.getState().user;
              const payload = {
                toUserId: callerId,
                fromUserId: currentUser?.id,
                response: 'decline',
                callId: getStringValue(d.callId || d.id),
              };
              socket.emit('call:response', payload);
            } catch (e) {
              console.warn('failed to emit call decline', e);
            }
          })();
        } else if (actionId === 'mark_read') {
          try {
            const currentUser = useAuthStore.getState().user;
            await rememberReadMessage(d.messageId as string);
            await cancelNotificationForPayload(d);
            if (d.conversationId) await markConversationNotificationsRead(d.conversationId as string);
            await fetch(`${API_BASE_URL}/messages/mark-read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: getStringValue(d.messageId), readerId: currentUser?.id }) });
          } catch (e) {}
        } else if (actionId === 'reply') {
          // inline reply input available on Android; detail.input contains text
          const replyText = getStringValue(detail.input).trim();
          if (replyText && d.conversationId && d.senderId) {
            try {
              const token = await AsyncStorage.getItem('accessToken');
              await rememberReadMessage(d.messageId as string);
              await cancelNotificationForPayload(d);
              if (d.conversationId) await markConversationNotificationsRead(d.conversationId as string);
              await fetch(`${API_BASE_URL}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ conversationId: d.conversationId, content: replyText, receiverId: d.senderId }),
              });
            } catch (e) {}
          }
        }
      }
    });

    // Notifee background events (headless). Store pending incoming call so app can navigate when brought to foreground.
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      try {
        if (type === EventType.ACTION_PRESS) {
          const actionId = detail.pressAction?.id;
          if (!actionId) return;
          const d = detail.notification?.data || {};
          if (d.type === 'call') {
            try {
              await AsyncStorage.setItem('pendingIncomingCall', JSON.stringify(d));
            } catch (e) {}
          }
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
