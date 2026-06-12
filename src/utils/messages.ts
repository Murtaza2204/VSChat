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

export const markConversationRead = async (conversationId, readerId) => {
  const res = await api.post('/messages/mark-conversation-read', { conversationId, readerId });
  return res.data;
};

export default { getMessages, sendMessage, markConversationRead };
