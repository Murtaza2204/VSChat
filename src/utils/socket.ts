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
  socket.off('conversation:updated');
  socket.off('message:reacted');
  
  const handleConversationUpdate = (payload: any) => {
    try {
      console.log('[socket] conversation:update received:', payload);
      const conversationId = payload?.conversationId;
      if (!conversationId) return;

      const store = useChatStore.getState();
      const updates = { ...payload };
      delete updates.conversationId;
      const { lastMessage, lastMessageAt } = updates;
      delete updates.lastMessage;
      delete updates.lastMessageAt;

      if (updates.lastMessageType === 'system') {
        delete updates.lastMessageType;
        delete updates.lastMessageRaw;
        delete updates.lastMessageActorId;
        delete updates.lastMessageSystemEventType;
        delete updates.lastMessageSystemActorId;
        delete updates.lastMessageSystemActorName;
        delete updates.lastMessageSystemTargetIds;
        delete updates.lastMessageSystemTargetNames;
        delete updates.lastMessageSystemAudienceIds;
        delete updates.lastMessageSystemData;
      }

      if (Object.keys(updates).length > 0) {
        store.updateChat(conversationId, updates);
      }

      if (typeof lastMessage !== 'undefined' || typeof lastMessageAt !== 'undefined') {
        if (updates.lastMessageType !== 'system') {
          store.updateChatLastMessage(conversationId, lastMessage, lastMessageAt ? new Date(lastMessageAt) : undefined);
        }
      }
    } catch (e) {
      console.warn('[socket] conversation:update error:', e);
    }
  };

  // Setup conversation update listeners
  socket.on('conversation:update', handleConversationUpdate);
  socket.on('conversation:updated', handleConversationUpdate);

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
