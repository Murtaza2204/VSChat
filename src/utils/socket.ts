import { io } from 'socket.io-client';
import { API_BASE } from '../config/api';

let socket;

export const connectSocket = (token) => {
  if (socket && socket.connected) return socket;
  socket = io(API_BASE.replace(/\/api$/, ''), { auth: { token } });
  return socket;
};

export default { connectSocket };
