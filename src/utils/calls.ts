import api from '../config/api';
import signaling from '../services/signaling';
import { AGORA_APP_ID } from '../config/agora';

export interface RawCall {
  _id?: any;
  callId?: string;
  callerId?: string;
  calleeId?: string;
  callType?: string;
  callStatus?: string;
  isGroupCall?: boolean;
  groupId?: string;
  groupName?: string;
  groupAvatar?: string;
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  metadata?: any;
}

export const fetchCalls = async (userId: string, page = 1, limit = 50) => {
  const res = await api.get('/calls', { params: { userId, page, limit } });
  if (!res || !res.data) throw new Error('Invalid response');
  return res.data.calls as RawCall[];
};

export const fetchUsersByIds = async (ids: string[]) => {
  if (!ids || ids.length === 0) return [];
  const res = await api.post('/users/lookup', { ids });
  if (!res || !res.data) return [];
  return res.data.users || [];
};

const getParticipantId = (participant: any) =>
  typeof participant === 'string'
    ? participant
    : participant?.id || participant?._id || participant?.userId;

export const startConversationCall = ({
  navigation,
  chat,
  currentUserId,
  participant,
  conversationId,
  routeParams,
  isGroupConversation,
}: {
  navigation: any;
  chat: any;
  currentUserId?: string | null;
  participant?: any;
  conversationId?: string | null;
  routeParams?: any;
  isGroupConversation?: boolean;
}) => {
  const callType = routeParams?.callType || 'audio';
  const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const conversationKey = conversationId || chat?.conversationId || chat?.id;
  const isGroupChat = !!(isGroupConversation ?? chat?.isGroup);
  const directCallPeer = !isGroupChat
    ? (participant || chat?.participants?.find((p: any) => String(getParticipantId(p)) !== String(currentUserId)) || null)
    : null;
  const directCallPeerName = directCallPeer?.name || directCallPeer?.displayName || chat?.title || 'Unknown';
  const directCallPeerAvatar = directCallPeer?.avatar || directCallPeer?.profilePictureUrl || chat?.avatar || null;
  const groupRecipientIds = isGroupChat
    ? (chat?.participants || [])
        .map(getParticipantId)
        .filter(Boolean)
        .filter((participantId) => String(participantId) !== String(currentUserId))
        .map(String)
    : [];
  const targetRecipientIds = groupRecipientIds.length
    ? groupRecipientIds
    : [chat?.userId || derivedReceiverIdFromChat(chat, currentUserId, participant) || chat?.id].filter(Boolean);
  const groupParticipantProfiles = isGroupChat
    ? (chat?.participants || [])
        .map((p: any) => {
          const participantId = getParticipantId(p);
          if (!participantId) return null;
          return {
            userId: String(participantId),
            name: p.name || p.displayName || p.title || 'Unknown',
            avatar: p.avatar || p.profilePictureUrl || null,
          };
        })
        .filter(Boolean)
    : [];

  try {
    const perCallChannel = `call-${callId}`;
    signaling.inviteCall(targetRecipientIds, callType, {
      channel: perCallChannel,
      callId,
      isGroupCall: isGroupChat,
      groupId: conversationKey,
      groupName: chat?.title || 'Group',
      groupAvatar: chat?.groupProfilePicture || chat?.avatar,
      chatId: conversationKey,
      groupMemberIds: groupRecipientIds,
      groupParticipants: groupParticipantProfiles,
    });
    console.log('[CallFlow] Sent call invite:', { targetRecipientIds, callType, callId, isGroupCall: isGroupChat });
  } catch (e) {
    console.warn('[CallFlow] inviteCall failed', e);
  }

  navigation.navigate(isGroupChat ? 'GroupActiveCall' : 'ActiveCall', {
    callType,
    callerName: isGroupChat ? (chat?.title || 'Group') : chat?.title,
    callerAvatar: isGroupChat ? (chat?.groupProfilePicture || chat?.avatar) : chat?.avatar,
    peerName: isGroupChat ? undefined : directCallPeerName,
    peerAvatar: isGroupChat ? undefined : directCallPeerAvatar,
    calleeName: isGroupChat ? undefined : directCallPeerName,
    calleeAvatar: isGroupChat ? undefined : directCallPeerAvatar,
    chatId: conversationKey,
    calleeId: isGroupChat ? undefined : (derivedReceiverIdFromChat(chat, currentUserId, participant) || chat?.id),
    appId: AGORA_APP_ID,
    channel: `call-${callId}`,
    token: undefined,
    callId,
    isCaller: true,
    isGroupCall: isGroupChat,
    groupId: conversationKey,
    groupName: chat?.title || 'Group',
    groupAvatar: chat?.groupProfilePicture || chat?.avatar,
    groupParticipants: groupParticipantProfiles,
    returnRoute: {
      name: routeParams?.returnRouteName || 'Chat',
      params: routeParams?.returnRouteParams || routeParams,
    },
  });
};

const derivedReceiverIdFromChat = (chat: any, currentUserId?: string | null, participant?: any) => {
  if (participant) return participant?.id || participant?._id || participant?.userId;
  return chat?.participants?.find((p: any) => String(getParticipantId(p)) !== String(currentUserId))?.id;
};

export default { fetchCalls, fetchUsersByIds, startConversationCall };
