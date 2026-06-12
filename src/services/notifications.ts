import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectSocket } from '../utils/socket';
import { useAuthStore } from '../stores/authStore';
import { Alert } from 'react-native';
import { API_BASE_URL } from '../config/api';
import { navigate } from '../navigation/NavigationService';

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
        const title = remoteMessage.notification?.title || 'New message';
        const body = remoteMessage.notification?.body || '';

        if (data.type === 'call') {
          onIncomingCall && onIncomingCall(data);
          // also show actionable notification
          await notifee.displayNotification({
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
      if (data.type === 'call') {
        onIncomingCall && onIncomingCall(data);
        // navigate to incoming call screen
        navigate('Main', { screen: 'Calls', params: { screen: 'IncomingCall', params: data } });
      } else if (data.conversationId) {
        navigate('Main', { screen: 'Chats', params: { screen: 'Chat', params: { conversationId: data.conversationId } } });
      }
    });

    // When the app is opened from a quit state
    const initial = await messaging().getInitialNotification();
    if (initial) {
      const data = initial.data || {};
      if (data.type === 'call') {
        onIncomingCall && onIncomingCall(data);
        navigate('Main', { screen: 'Calls', params: { screen: 'IncomingCall', params: data } });
      } else if (data.conversationId) {
        navigate('Main', { screen: 'Chats', params: { screen: 'Chat', params: { conversationId: data.conversationId } } });
      }
    }

    // Notifee event listener for actions (foreground)
    notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        const actionId = detail.pressAction.id;
        const d = detail.notification?.data || {};
        if (actionId === 'accept') {
          // navigate to incoming call
          navigate('Main', { screen: 'Calls', params: { screen: 'IncomingCall', params: d } });
          // notify server that call was accepted
          (async () => {
            try {
              const token = await AsyncStorage.getItem('accessToken');
              const socket = connectSocket(token);
              const currentUser = useAuthStore.getState().user;
              const payload = {
                toUserId: (d.from && JSON.parse(d.from).id) || d.fromUserId || d.from || d.fromId,
                fromUserId: currentUser?.id,
                response: 'accept',
                callId: d.callId || d.id,
              };
              socket.emit('call:response', payload);
            } catch (e) {
              console.warn('failed to emit call accept', e);
            }
          })();
        } else if (actionId === 'decline') {
          // send decline/response to server via socket
          (async () => {
            try {
              const token = await AsyncStorage.getItem('accessToken');
              const socket = connectSocket(token);
              const currentUser = useAuthStore.getState().user;
              const payload = {
                toUserId: (d.from && JSON.parse(d.from).id) || d.fromUserId || d.from || d.fromId,
                fromUserId: currentUser?.id,
                response: 'decline',
                callId: d.callId || d.id,
              };
              socket.emit('call:response', payload);
            } catch (e) {
              console.warn('failed to emit call decline', e);
            }
          })();
        } else if (actionId === 'mark_read') {
          try { await fetch(`${API_BASE_URL}/messages/mark-read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: d.messageId }) }); } catch (e) {}
        } else if (actionId === 'reply') {
          // inline reply input available on Android; detail.input contains text
          const replyText = (detail.input || '').trim();
          if (replyText && d.conversationId && d.senderId) {
            try { await fetch(`${API_BASE_URL}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: d.conversationId, senderId: d.receiverId || d.to || d.myId, content: replyText, receiverId: d.senderId }) }); } catch (e) {}
          }
        }
      }
    });

  } catch (e) {
    console.warn('initNotifications failed', e);
  }
};

export default { initNotifications };
