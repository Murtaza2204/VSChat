import api from '../config/api';

export const getMessages = async (conversationId) => {
  const res = await api.get('/messages', { params: { conversationId } });
  return res.data.messages;
};

export const sendMessage = async (
  conversationId,
  senderId,
  content,
  type = 'text',
  receiverId?,
  replyToId?,
  forwarded?: boolean,
  forwardedFrom?: any,
) => {
  const body: any = { conversationId, senderId, content, type };
  if (receiverId) body.receiverId = receiverId;
  if (replyToId) body.replyToId = replyToId;
  if (forwarded) body.forwarded = true;
  if (forwardedFrom) body.forwardedFrom = forwardedFrom;
  const res = await api.post('/messages', body);
  return res.data.message;
};

export const markConversationRead = async (conversationId, readerId) => {
  const res = await api.post('/messages/mark-conversation-read', { conversationId, readerId });
  return res.data;
};

export const deleteMessageForMe = async (messageId) => {
  try {
    const res = await api.post('/messages/delete-for-me', { messageId });
    console.info('[messagesApi] deleteForMe response', { messageId, status: res.status, data: res.data });
    return res.data;
  } catch (e) {
    console.warn('[messagesApi] deleteForMe error', e && e.message);
    throw e;
  }
};

export const deleteMessageForEveryone = async (messageId) => {
  try {
    const res = await api.post('/messages/delete-for-everyone', { messageId });
    console.info('[messagesApi] deleteForEveryone response', { messageId, status: res.status, data: res.data });
    return res.data;
  } catch (e) {
    console.warn('[messagesApi] deleteForEveryone error', e && e.message);
    throw e;
  }
};

export const reactMessage = async (messageId: string, reaction: string | null) => {
  try {
    const res = await api.post('/messages/react', { messageId, reaction });
    console.info('[messagesApi] reactMessage response', { messageId, reaction, status: res.status, data: res.data });
    return res.data;
  } catch (e) {
    console.warn('[messagesApi] reactMessage error', e && e.message);
    throw e;
  }
};

export default { getMessages, sendMessage, markConversationRead, deleteMessageForMe, deleteMessageForEveryone, reactMessage };
