import { io } from 'socket.io-client';
import { API_BASE } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

let socket: any;

export const connectSocket = (token?: string | null) => {
  if (socket && socket.connected) return socket;
  socket = io(API_BASE.replace(/\/api$/, ''), { auth: { token } });
  socket.on('connect', async () => {
    try {
      const rawUser = await AsyncStorage.getItem('user');
      const user = rawUser ? JSON.parse(rawUser) : null;
      if (user?.id) socket.emit('register', { userId: user.id });
    } catch (e) {}
  });
  return socket;
};

export default { connectSocket };
