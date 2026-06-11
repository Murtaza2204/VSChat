import api from '../config/api';

export const getMessages = async (conversationId) => {
  const res = await api.get('/messages', { params: { conversationId } });
  return res.data.messages;
};

export const sendMessage = async (conversationId, senderId, content, type = 'text', receiverId) => {
  const body = { conversationId, senderId, content, type };
  if (receiverId) body.receiverId = receiverId;
  const res = await api.post('/messages', body);
  return res.data.message;
};

export default { getMessages, sendMessage };
