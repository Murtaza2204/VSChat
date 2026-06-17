// @ts-nocheck
// Socket.IO utility for real-time updates
import { io } from 'socket.io-client';
import { API_BASE } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChatStore } from '../stores/chatStore';

let socket: any;
let isListenersSetup = false;

const setupListeners = () => {
  if (!socket) return;
  
  // Remove old listeners to avoid duplicates
  socket.off('conversation:update');
  socket.off('message:reacted');
  
  // Setup conversation update listener
  socket.on('conversation:update', (payload: any) => {
    try {
      console.log('[socket] conversation:update received:', payload);
      const { conversationId, lastMessage, lastMessageAt, lastMessageActorId, lastMessageRaw, lastMessageReaction, lastMessageReactedBy } = payload || {};
      if (!conversationId || !lastMessage) return;

      const store = useChatStore.getState();
      // If reactor/reaction/raw provided, pass a structured object so `updateChatLastMessage`
      // can render a reaction preview while preserving the original sender (actorId)
      if (typeof lastMessageReaction !== 'undefined' || lastMessageReactedBy) {
        store.updateChatLastMessage(conversationId, { reactedBy: lastMessageReactedBy, reaction: lastMessageReaction, raw: lastMessageRaw || lastMessage, originalActorId: lastMessageActorId }, lastMessageAt ? new Date(lastMessageAt) : undefined);
      } else if (lastMessageActorId || lastMessageRaw) {
        store.updateChatLastMessage(conversationId, { actorId: lastMessageActorId, raw: lastMessageRaw || lastMessage }, lastMessageAt ? new Date(lastMessageAt) : undefined);
      } else {
        store.updateChatLastMessage(conversationId, lastMessage, lastMessageAt ? new Date(lastMessageAt) : undefined);
      }
    } catch (e) { 
      console.warn('[socket] conversation:update error:', e); 
    }
  });

  // Setup message reacted listener
  socket.on('message:reacted', (payload: any) => {
    try {
      console.log('[socket] message:reacted received:', payload);
      // If backend sends lastMessage in reaction update, handle it (may include actor id)
      if (payload?.conversationId && payload?.lastMessage) {
        const store = useChatStore.getState();
        const { conversationId, lastMessage, lastMessageAt, lastMessageActorId, lastMessageRaw, lastMessageReaction, lastMessageReactedBy } = payload;
        if (typeof lastMessageReaction !== 'undefined' || lastMessageReactedBy) {
          store.updateChatLastMessage(conversationId, { reactedBy: lastMessageReactedBy, reaction: lastMessageReaction, raw: lastMessageRaw || lastMessage, originalActorId: lastMessageActorId }, lastMessageAt ? new Date(lastMessageAt) : undefined);
        } else if (lastMessageActorId || lastMessageRaw) {
          store.updateChatLastMessage(conversationId, { actorId: lastMessageActorId, raw: lastMessageRaw || lastMessage }, lastMessageAt ? new Date(lastMessageAt) : undefined);
        } else {
          store.updateChatLastMessage(conversationId, lastMessage, lastMessageAt ? new Date(lastMessageAt) : undefined);
        }
      }
    } catch (e) {
      console.warn('[socket] message:reacted error:', e);
    }
  });
  
  isListenersSetup = true;
  console.log('[socket] listeners setup complete');
};

export const connectSocket = (token?: string | null) => {
  if (socket && socket.connected) {
    // Ensure listeners are setup even if socket was already connected
    if (!isListenersSetup) {
      setupListeners();
    }
    return socket;
  }
  
  socket = io(API_BASE.replace(/\/api$/, ''), { 
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });
  
  socket.on('connect', async () => {
    try {
      console.info('[socket] connected', { id: socket.id });
      setupListeners();
      
      const rawUser = await AsyncStorage.getItem('user');
      const user = rawUser ? JSON.parse(rawUser) : null;
      if (user?.id) {
        console.info('[socket] emitting register', { socketId: socket.id, userId: user.id });
        socket.emit('register', { userId: user.id });
      } else {
        console.info('[socket] no user in AsyncStorage to register');
      }
    } catch (e) { 
      console.warn('[socket] connect handler error', e); 
    }
  });

  socket.on('connect_error', (err: any) => {
    console.warn('[socket] connect_error', err && err.message);
  });
  
  socket.on('disconnect', (reason: any) => {
    console.info('[socket] disconnected', reason);
    isListenersSetup = false;
  });
  
  return socket;
};

export default { connectSocket };
