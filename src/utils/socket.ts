import { io } from 'socket.io-client';
import { API_BASE } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChatStore } from '../stores/chatStore';

let socket: any;

export const connectSocket = (token?: string | null) => {
  if (socket && socket.connected) return socket;
  socket = io(API_BASE.replace(/\/api$/, ''), { auth: { token } });
  socket.on('connect', async () => {
    try {
      console.info('[socket] connected', { id: socket.id });
      const rawUser = await AsyncStorage.getItem('user');
      const user = rawUser ? JSON.parse(rawUser) : null;
      if (user?.id) {
        console.info('[socket] emitting register', { socketId: socket.id, userId: user.id });
        socket.emit('register', { userId: user.id });
      } else {
        console.info('[socket] no user in AsyncStorage to register');
      }
    } catch (e) { console.warn('[socket] connect handler error', e); }
  });
  socket.on('conversation:update', (payload: any) => {
    try {
      console.info('[socket] conversation:update', payload);
      const { conversationId, lastMessage, lastMessageAt } = payload || {};
      const store = useChatStore.getState();
      const updatedChats = (store.chats || []).map((c) => {
        if (String(c.conversationId || c.id) === String(conversationId)) {
          return { ...c, lastMessage: lastMessage || c.lastMessage, lastMessageTime: lastMessageAt ? new Date(lastMessageAt) : c.lastMessageTime };
        }
        return c;
      });
      store.setChats(updatedChats);
    } catch (e) { console.warn('[socket] conversation:update handler error', e); }
  });
  socket.on('connect_error', (err) => console.warn('[socket] connect_error', err && err.message));
  socket.on('disconnect', (reason) => console.info('[socket] disconnected', reason));
  return socket;
};

export default { connectSocket };
