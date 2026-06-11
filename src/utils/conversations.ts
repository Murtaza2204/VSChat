import api from '../config/api';

export const getConversations = async (userId) => {
  const res = await api.get('/conversations', { params: { userId } });
  return res.data.conversations;
};

export const findOrCreateConversation = async (userId, otherUserId) => {
  const res = await api.post('/conversations', { userId, otherUserId });
  return res.data;
};

export default { getConversations, findOrCreateConversation };
