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
  replyToMediaItemIndex?,
  replyToMediaItemId?,
  replyToMediaItemObjectKey?,
  forwarded?: boolean,
  forwardedFrom?: any,
) => {
  const body: any = { conversationId, senderId, content, type };
  if (receiverId) body.receiverId = receiverId;
  if (replyToId) body.replyToId = replyToId;
  if (typeof replyToMediaItemIndex === 'number') body.replyToMediaItemIndex = replyToMediaItemIndex;
  if (replyToMediaItemId) body.replyToMediaItemId = replyToMediaItemId;
  if (replyToMediaItemObjectKey) body.replyToMediaItemObjectKey = replyToMediaItemObjectKey;
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

export const deleteMessagesForMeBulk = async (messageIds = []) => {
  try {
    const res = await api.post('/messages/delete-for-me-bulk', { messageIds });
    return res.data;
  } catch (e) {
    console.warn('[messagesApi] deleteMessagesForMeBulk error', e && e.message);
    throw e;
  }
};

export const deleteMessagesForEveryoneBulk = async (messageIds = []) => {
  try {
    const res = await api.post('/messages/delete-for-everyone-bulk', { messageIds });
    return res.data;
  } catch (e) {
    console.warn('[messagesApi] deleteMessagesForEveryoneBulk error', e && e.message);
    throw e;
  }
};

export const forwardMessagesBulk = async (targetConversationId, messages = []) => {
  try {
    const res = await api.post('/messages/forward-bulk', { targetConversationId, messages });
    return res.data;
  } catch (e) {
    console.warn('[messagesApi] forwardMessagesBulk error', e && e.message);
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

export const removeMessageMedia = async (messageId: string, mediaItemIds: string[]) => {
  try {
    const res = await api.post('/messages/remove-media', { messageId, mediaItemIds });
    return res.data;
  } catch (e) {
    console.warn('[messagesApi] removeMessageMedia error', e && e.message);
    throw e;
  }
};

export default { getMessages, sendMessage, markConversationRead, deleteMessageForMe, deleteMessageForEveryone, deleteMessagesForMeBulk, deleteMessagesForEveryoneBulk, forwardMessagesBulk, reactMessage, removeMessageMedia };
