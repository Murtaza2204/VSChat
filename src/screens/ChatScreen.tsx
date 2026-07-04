// @ts-nocheck
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  PermissionsAndroid,
  Platform,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Linking,
  Keyboard,
  NativeModules,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ToastAndroid } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Asset, launchCamera, launchImageLibrary } from 'react-native-image-picker';
let RNFetchBlob: any = null;
try {
  // require at runtime so app doesn't crash if native module isn't linked yet
  // (useful during development while rebuilding native binary).
  // eslint-disable-next-line global-require
  const blobUtilModule = require('react-native-blob-util');
  // react-native-blob-util exports the RNFetchBlob object as default or direct export
  RNFetchBlob = blobUtilModule.default || blobUtilModule;
} catch (e) {
  console.warn('[ChatScreen] Failed to load react-native-blob-util:', e);
  RNFetchBlob = null;
}
import { errorCodes, isErrorWithCode, pick } from '@react-native-documents/picker';
import Geolocation from 'react-native-geolocation-service';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import { MediaItem, Message } from '../types';
import Avatar from '../components/Avatar';
import ChatBubble from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';
import messagesApi from '../utils/messages';
import api from '../config/api';
import { connectSocket } from '../utils/socket';
import { completeUpload, getUploadUrl } from '../services/mediaUploadService';
import { fetchDownloadUrl } from '../services/mediaService';
import { buildMediaDownloadFileName, buildMediaDownloadUrl, getMediaStorageDirectory, extractMediaObjectKey } from '../utils/mediaDownload';
import useMediaUpload from '../hooks/useMediaUpload';
import useMedia from '../hooks/useMedia';
import FullScreenImageViewer from '../components/FullScreenImageViewer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import signaling from '../services/signaling';
import { AGORA_APP_ID } from '../config/agora';
import { markConversationNotificationsRead } from '../services/notifications';
import { startConversationCall } from '../utils/calls';
import { buildSystemMessageText } from '../utils/systemMessages';

// Trigger Android MediaStore scan so Gallery app recognizes newly downloaded files
const scanMediaFile = async (filePath: string, mediaType?: string | null) => {
  if (Platform.OS !== 'android') return;
  try {
    // Use MediaStore broadcast to trigger gallery scan
    const { NativeModule } = NativeModules;
    if (NativeModule && typeof NativeModule.scanFile === 'function') {
      await NativeModule.scanFile(filePath);
      console.log('[ChatScreen][media-scan] MediaStore scan triggered for', { filePath });
    } else {
      // Fallback: use sendBroadcast with Intent to scan
      // This is handled by Android automatically in most cases when file is written
      console.log('[ChatScreen][media-scan] NativeModule not available, relying on Android auto-scan');
    }
  } catch (e) {
    console.warn('[ChatScreen][media-scan] failed to trigger media scan', e);
  }
};

// Validate RNFetchBlob module has required methods
const validateRNFetchBlob = (module: any): boolean => {
  if (!module) return false;
  const hasRequiredMethods = 
    typeof module.config === 'function' &&
    typeof module.fetch === 'function' &&
    typeof module.wrap === 'function' &&
    module.fs && typeof module.fs.stat === 'function' &&
    typeof module.fs.exists === 'function';
  return hasRequiredMethods;
};

const isValidAvatarUri = (value?: string | null) =>
  !!value &&
  (value.startsWith('file://') ||
    value.startsWith('content://') ||
    value.startsWith('http://') ||
    value.startsWith('https://'));

const getParticipantId = (participant: any) =>
  typeof participant === 'string'
    ? participant
    : participant?.id || participant?._id || participant?.userId;

const getInitialsFromName = (name?: string | null) =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

const joinHumanList = (items: string[] = []) => {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
};

const isGenericDocumentName = (name?: string) => {
  const trimmed = String(name || '').trim();
  return (
    /^(media|attachment|document)(\.[a-z0-9]{1,5})?$/i.test(trimmed) ||
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(trimmed) ||
    /^[0-9a-f]{16,}$/i.test(trimmed) ||
    /^[0-9a-f-]{20,}$/i.test(trimmed)
  );
};

const buildMediaReactionSnippet = (message: any) => {
  const mediaItems = Array.isArray(message?.mediaItems) && message.mediaItems.length
    ? message.mediaItems
    : (Array.isArray(message?.attachments) && message.attachments.length
      ? message.attachments
      : (message?.media ? [message.media] : []));

  const getFilename = (item: any = {}) => {
    const candidates = [item.originalFilename, item.name, item.filename, item.fileName];
    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (value && !isGenericDocumentName(value)) return value;
    }
    return 'Document';
  };

  const classify = (item: any = {}) => {
    const rawType = String(item.mediaType || item.type || item.kind || '').toLowerCase();
    const mimeType = String(item.mimeType || item.mime || '').toLowerCase();
    if (rawType.includes('image') || rawType.includes('photo') || mimeType.startsWith('image/')) return 'photo';
    if (rawType.includes('video') || mimeType.startsWith('video/')) return 'video';
    if (rawType.includes('document') || rawType.includes('file') || rawType.includes('attachment') || mimeType.startsWith('application/')) return 'file';
    return 'unknown';
  };

  if (!mediaItems.length) {
    if (message?.type === 'image') return '📷 Photo';
    if (message?.type === 'video') return '🎥 Video';
    if (message?.type === 'file' || message?.type === 'document') return `📄 ${getFilename(message)}`;
    return String(message?.content || '').slice(0, 80);
  }

  const classified = mediaItems.map((item: any) => ({ ...item, kind: classify(item) }));
  const photos = classified.filter((item) => item.kind === 'photo');
  const videos = classified.filter((item) => item.kind === 'video');
  const files = classified.filter((item) => item.kind === 'file');

  if (files.length && photos.length === 0 && videos.length === 0) {
    return files.length === 1 ? `📄 ${getFilename(files[0])}` : `📄 ${files.length} Documents`;
  }
  if (photos.length > 0 && videos.length === 0) {
    return photos.length === 1 ? '📷 Photo' : `📷 ${photos.length} Photos`;
  }
  if (videos.length > 0 && photos.length === 0) {
    return videos.length === 1 ? '🎥 Video' : `🎥 ${videos.length} Videos`;
  }
  if (photos.length > 0 && videos.length > 0) {
    return `📎 ${photos.length + videos.length} Media`;
  }
  if (files.length > 0) {
    return `📎 ${photos.length + videos.length + files.length} Media`;
  }
  return String(message?.content || '').slice(0, 80);
};

const ChatScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
    const { chat: routeChat, conversationId: routeConversationId, participant, searchMode: routeSearchMode = false, searchQuery: routeSearchQuery = '' } = route.params || {};
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const currentUserId = user?.id;
  const { chats, addMessage, updateMessage, deleteMessage } = useChatStore();
  const storeChat = useMemo(() => {
    const fallbackId = routeConversationId || routeChat?.conversationId || routeChat?.id || participant?.id;
    return chats.find((item) => String(item.conversationId || item.id) === String(fallbackId)) || null;
  }, [chats, routeConversationId, routeChat, participant]);
  const chat = useMemo(
    () =>
      storeChat ||
      routeChat ||
      (participant
        ? {
            id: participant.id,
            title: participant.title,
            avatar: participant.avatar,
            phoneNumber: participant.phoneNumber,
            isGroup: false,
          }
        : null),
    [participant, routeChat, storeChat],
  );
  const conversationId =
    routeConversationId || routeChat?.conversationId || chat?.conversationId;
  const receiverIdFromRoute = participant?.id;
  const derivedReceiverId =
    receiverIdFromRoute ||
    (chat?.participants
      ? chat.participants.find((p) => String(p.id) !== String(currentUserId))?.id
      : undefined);
  const [loadedMessages, setLoadedMessages] = useState<Message[]>([]);
  const [isChatCleared, setIsChatCleared] = useState(false);
  const deletedForMeIdsRef = useRef(new Set<string>());
  const hiddenMediaItemIdsRef = useRef(new Map<string, Set<string>>());
  const [membersProfiles, setMembersProfiles] = useState<any[] | null>(null);
  const { state: uploadState, upload: uploadUsingHook, reset: resetUpload } = useMediaUpload();
  const chatMessages = useMemo(() => (conversationId ? loadedMessages : (chat?.messages || [])), [conversationId, loadedMessages, chat]);
  const sortedChatMessages = useMemo(() => {
    const toTime = (message: any) => {
      const value = message?.timestamp || message?.createdAt || 0;
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    };

    return [...(chatMessages || [])].sort((a: any, b: any) => {
      const timeDelta = toTime(a) - toTime(b);
      if (timeDelta !== 0) return timeDelta;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
  }, [chatMessages]);
  // format date label according to rules
  const getDateLabel = (d: Date) => {
    if (!d) return '';
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffMs = +todayDate - +date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: 'long' });
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // insert date separator items into list
  const messagesWithSeparators = useMemo(() => {
    const out: any[] = [];
    let lastDateKey: string | null = null;
    const msgs = sortedChatMessages || [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const t = m && m.timestamp ? new Date(m.timestamp) : new Date();
      const key = `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
      if (key !== lastDateKey) {
        const label = getDateLabel(t);
        out.push({ __dateSeparator: true, id: `date-${key}`, dateLabel: label, dateObj: t });
        lastDateKey = key;
      }
      out.push(m);
    }
    return out;
  }, [sortedChatMessages, nowTick]);

  const renderedMessagesWithSeparators = useMemo(
    () => [...messagesWithSeparators].reverse(),
    [messagesWithSeparators],
  );

  const getRenderedIndexForMessageId = React.useCallback((messageId?: string | null) => {
    if (!messageId || !messagesWithSeparators.length) return -1;
    const originalIndex = messagesWithSeparators.findIndex((item) => !item.__dateSeparator && String(item.id) === String(messageId));
    if (originalIndex === -1) return -1;
    return messagesWithSeparators.length - 1 - originalIndex;
  }, [messagesWithSeparators]);

  const [isSearchMode, setIsSearchMode] = useState<boolean>(!!routeSearchMode);
  const [searchQuery, setSearchQuery] = useState<string>(routeSearchQuery || '');
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState<number>(0);
  const searchInputRef = useRef<TextInput | null>(null);
  const normalizedSearchQuery = searchQuery.trim();
  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) return [] as Array<{ id: string; index: number }>;
    const query = normalizedSearchQuery.toLowerCase();
    return messagesWithSeparators
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item?.__dateSeparator)
      .filter(({ item }) => {
        const haystack = [
          item?.content,
          item?.senderName,
          item?.type,
          item?.caption,
          item?.metadata?.caption,
          item?.location?.title,
          item?.location?.address,
          item?.call?.type,
        ]
          .filter((part) => part !== undefined && part !== null)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .map(({ item, index }) => ({ id: String(item.id), index }));
  }, [messagesWithSeparators, normalizedSearchQuery]);
  useEffect(() => {
    if (routeSearchMode) {
      setIsSearchMode(true);
      setSearchQuery(routeSearchQuery || '');
    }
  }, [routeSearchMode, routeSearchQuery]);

  useEffect(() => {
    if (!isSearchMode) return;
    requestAnimationFrame(() => searchInputRef.current?.focus?.());
  }, [isSearchMode]);

  useEffect(() => {
    if (!isSearchMode) return;
    setActiveSearchMatchIndex(0);
  }, [normalizedSearchQuery, isSearchMode]);

  useEffect(() => {
    if (!isSearchMode || !normalizedSearchQuery || !searchMatches.length) return;
    const target = searchMatches[Math.min(activeSearchMatchIndex, searchMatches.length - 1)];
    if (!target) return;
    const renderedIndex = messagesWithSeparators.length - 1 - target.index;
    requestAnimationFrame(() => {
      try {
        flatListRef.current?.scrollToIndex({ index: renderedIndex, animated: true, viewPosition: 0.4 });
      } catch (e) {
        console.warn('[ChatScreen] scroll to search result failed', e);
      }
    });
  }, [activeSearchMatchIndex, isSearchMode, messagesWithSeparators.length, normalizedSearchQuery, searchMatches]);

  const openSearchMode = () => {
    setIsSearchMode(true);
    requestAnimationFrame(() => searchInputRef.current?.focus?.());
  };

  const closeSearchMode = () => {
    setIsSearchMode(false);
    setSearchQuery('');
    setActiveSearchMatchIndex(0);
  };

  const jumpToSearchMatch = (direction: 1 | -1) => {
    if (!searchMatches.length) return;
    setActiveSearchMatchIndex((current) => {
      const nextIndex = (current + direction + searchMatches.length) % searchMatches.length;
      return nextIndex;
    });
  };

  const isGroupConversation = !!chat?.isGroup || (chat?.participants?.length || 0) > 2;
  const groupMemberCount = (chat.participants?.length || 0) + (isGroupConversation ? 1 : 0);
  const groupSubtitle = isGroupConversation
    ? chat.participants?.length
      ? chat.participants.map((participant) => participant.name).join(', ')
      : `${groupMemberCount} members`
    : chat.participants?.length
    ? chat.participants.find((p) => String(p.id) !== String(currentUserId))?.name || ''
    : '';
  const [activeGroupCall, setActiveGroupCall] = useState<any | null>(null);
  const activeGroupCallRef = useRef<any | null>(null);
  const endedGroupCallIdsRef = useRef<Set<string>>(new Set());
  const [messageText, setMessageText] = useState('');
  const [replyMessage, setReplyMessage] = useState<Message | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [forwardTargetMessages, setForwardTargetMessages] = useState<Message[]>([]);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [selectedForwardTargets, setSelectedForwardTargets] = useState<string[]>([]);
  const [forwardNote, setForwardNote] = useState('');
  const [nativeReactionInputVisible, setNativeReactionInputVisible] = useState(false);
  const [nativeReactionText, setNativeReactionText] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectionMenuVisible, setSelectionMenuVisible] = useState(false);
  const [locationMenuVisible, setLocationMenuVisible] = useState(false);
  const [liveDurationVisible, setLiveDurationVisible] = useState(false);
  const [mediaPreviewVisible, setMediaPreviewVisible] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<MediaItem[]>([]);
  const [mediaCaption, setMediaCaption] = useState('');
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [viewerMessage, setViewerMessage] = useState<Message | null>(null);
  const [viewerResolvedUrls, setViewerResolvedUrls] = useState<Record<string, string>>({});
  const { url: viewerObjectUrl } = useMedia(viewerMessage?.metadata?.objectKey, !!viewerMessage);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const viewerScrollRef = React.useRef<ScrollView | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const pendingMediaDownloadKeysRef = useRef(new Set<string>());
  const completedMediaDownloadKeysRef = useRef(new Set<string>());
  const nativeReactionInputRef = useRef<TextInput | null>(null);
  const nativeReactionHandledRef = useRef(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
  const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20 MB
  const liveLocationWatchRef = useRef<number | null>(null);
  const liveLocationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeGroupCallRef.current = activeGroupCall;
  }, [activeGroupCall]);

  const normalizeCallParticipantId = (participant: any) =>
    String(participant?.userId || participant?.id || participant?._id || participant || '');

  const isCallParticipantJoined = (participant: any) => {
    if (!participant) return false;
    const status = String(participant.status || '').toLowerCase();
    return status === 'joined' || (!!participant.joinedAt && !participant.leftAt);
  };

  const activeGroupCallVisible = useMemo(() => {
    if (!isGroupConversation || !activeGroupCall) return false;
    const callStatus = String(activeGroupCall.callStatus || '').toLowerCase();
    if (callStatus === 'ended' || activeGroupCall.endedAt) return false;
    if (!currentUserId) return false;
    const participants = Array.isArray(activeGroupCall.participants) ? activeGroupCall.participants : [];
    return !participants.some((participant) => (
      normalizeCallParticipantId(participant) === String(currentUserId) && isCallParticipantJoined(participant)
    ));
  }, [activeGroupCall, currentUserId, isGroupConversation]);

  const activeGroupCallDisplayParticipants = useMemo(() => {
    if (!activeGroupCall || !Array.isArray(activeGroupCall.participants)) return [];
    const participants = activeGroupCall.participants
      .filter((participant: any) => normalizeCallParticipantId(participant) !== String(currentUserId))
      .filter((participant: any) => {
        const status = String(participant?.status || '').toLowerCase();
        return status !== 'declined' && status !== 'left';
      })
      .filter((participant: any) => isCallParticipantJoined(participant) || String(participant?.status || '').toLowerCase() === 'invited')
      .slice(0, 2);
    return participants;
  }, [activeGroupCall, currentUserId]);

  const getEndedGroupCallStorageKey = React.useCallback(
    (groupId?: string | null) => (groupId ? `endedGroupCall:${String(groupId)}` : null),
    [],
  );

  const markEndedGroupCall = React.useCallback(
    async (groupId?: string | null, callId?: string | null) => {
      const key = getEndedGroupCallStorageKey(groupId || conversationId);
      if (!key || !callId) return;
      endedGroupCallIdsRef.current.add(String(callId));
      try {
        await AsyncStorage.setItem(key, String(callId));
      } catch (e) {}
    },
    [conversationId, getEndedGroupCallStorageKey],
  );

  const clearEndedGroupCallMarker = React.useCallback(
    async (groupId?: string | null, callId?: string | null) => {
      const key = getEndedGroupCallStorageKey(groupId || conversationId);
      if (!key) return;
      if (callId) endedGroupCallIdsRef.current.delete(String(callId));
      try {
        await AsyncStorage.removeItem(key);
      } catch (e) {}
    },
    [conversationId, getEndedGroupCallStorageKey],
  );

  const refreshActiveGroupCall = React.useCallback(async () => {
    if (!isGroupConversation || !conversationId || !currentUserId) {
      setActiveGroupCall(null);
      return;
    }

    try {
      const response = await api.get('/calls/active', {
        params: {
          groupId: conversationId,
          userId: currentUserId,
        },
      });
      const nextCall = response?.data?.call || null;
      const storageKey = getEndedGroupCallStorageKey(conversationId);
      const storedEndedCallId = storageKey ? await AsyncStorage.getItem(storageKey) : null;
      if (nextCall?.callId && storedEndedCallId && String(storedEndedCallId) === String(nextCall.callId)) {
        setActiveGroupCall(null);
        return;
      }
      if (nextCall?.callId && storedEndedCallId && String(storedEndedCallId) !== String(nextCall.callId)) {
        await clearEndedGroupCallMarker(conversationId, storedEndedCallId);
      }
      setActiveGroupCall(nextCall);
    } catch (error) {
      console.warn('[ChatScreen] Failed to load active group call:', error);
    }
  }, [clearEndedGroupCallMarker, conversationId, currentUserId, getEndedGroupCallStorageKey, isGroupConversation]);

  useEffect(() => {
    refreshActiveGroupCall();

    if (!navigation?.addListener) return undefined;
    const unsubscribeFocus = navigation.addListener('focus', refreshActiveGroupCall);
    return () => {
      try { unsubscribeFocus?.(); } catch (e) {}
    };
  }, [navigation, refreshActiveGroupCall]);

  useEffect(() => {
    if (!isGroupConversation || !conversationId) {
      setActiveGroupCall(null);
      return undefined;
    }

    const onSessionState = (payload: any) => {
      const payloadGroupId = String(payload?.groupId || '');
      const payloadCallId = String(payload?.callId || '');
      const currentCallId = String(activeGroupCallRef.current?.callId || '');
      const matchesCurrentChat =
        (payloadGroupId && String(conversationId) === payloadGroupId) ||
        (payloadCallId && currentCallId && payloadCallId === currentCallId);

      if (!matchesCurrentChat) return;

      const callStatus = String(payload?.callStatus || '').toLowerCase();
      if (callStatus === 'ended' || payload?.endedAt) {
        if (payloadCallId) markEndedGroupCall(payloadGroupId || conversationId, payloadCallId);
        setActiveGroupCall((current) => (
          current && String(current.callId || '') === payloadCallId ? null : current
        ));
        return;
      }

      if (payloadCallId) clearEndedGroupCallMarker(payloadGroupId || conversationId, payloadCallId);
      setActiveGroupCall(payload);
    };

    const onEnded = (payload: any) => {
      const payloadGroupId = String(payload?.groupId || '');
      const payloadCallId = String(payload?.callId || '');
      const currentCallId = String(activeGroupCallRef.current?.callId || '');
      const matchesCurrentChat =
        (payloadGroupId && String(conversationId) === payloadGroupId) ||
        (payloadCallId && currentCallId && payloadCallId === currentCallId);

      if (!matchesCurrentChat) return;
      if (payloadCallId) markEndedGroupCall(payloadGroupId || conversationId, payloadCallId);
      setActiveGroupCall((current) => (
        current && String(current.callId || '') === payloadCallId ? null : current
      ));
    };

    const unsubscribeSession = signaling.onCallSessionState(onSessionState);
    const unsubscribeEnded = signaling.onCallEnded(onEnded);

    return () => {
      try { unsubscribeSession?.(); } catch (e) {}
      try { unsubscribeEnded?.(); } catch (e) {}
    };
  }, [conversationId, isGroupConversation, refreshActiveGroupCall]);

  // Helper to resolve media URIs before opening viewer
  const resolveMediaUris = async (items: MediaItem[]): Promise<MediaItem[]> => {
    console.log('[resolveMediaUris] starting with', items?.length, 'items');
    if (!items || !items.length) return [];
    const resolved = await Promise.all(
      items.map(async (item) => {
        console.log('[resolveMediaUris] processing item', { id: item.id, hasUri: !!item.uri, hasObjectKey: !!item.objectKey });
        if (item.uri) return item;
        if (item.objectKey) {
          try {
            console.log('[resolveMediaUris] fetching download url for objectKey:', item.objectKey);
            const uri = await fetchDownloadUrl(item.objectKey);
            console.log('[resolveMediaUris] got uri:', uri?.substring?.(0, 50));
            return { ...item, uri: uri || item.uri || '' };
          } catch (e) {
            console.error('[resolveMediaUris] error fetching download url', e);
            return { ...item, uri: item.uri || '' };
          }
        }
        return item;
      })
    );
    const filtered = resolved.filter((item) => !!item.uri);
    console.log('[resolveMediaUris] returning', filtered.length, 'items with uris');
    return filtered;
  };

  const autoDownloadReceivedMedia = async (message: Message) => {
    if (!message?.id || !currentUserId) return;
    const senderId = String(message.senderId || '');
    if (senderId === String(currentUserId)) return;
    console.log('[ChatScreen][auto-download] received media message', {
      messageId: message.id,
      senderId,
      messageType: message.type,
      mediaItemsCount: Array.isArray(message.mediaItems) ? message.mediaItems.length : 0,
      metadataObjectKey: message.metadata?.objectKey,
      mediaUrl: message.mediaUrl,
      directDownloadUrl: (message as any).downloadUrl,
    });

    const mediaItems = Array.isArray(message.mediaItems) ? message.mediaItems : [];
    const mediaCandidates = mediaItems.length
      ? mediaItems
      : [
          {
            id: message.metadata?.objectKey || message.id,
            objectKey: message.metadata?.objectKey || (message as any).objectKey,
            mimeType: message.metadata?.mimeType,
            type: message.metadata?.mediaType || message.type || 'file',
          },
        ];

    const mediaTypeSet = new Set(['image', 'video', 'audio', 'document', 'file', 'mediaGroup']);
    const shouldDownload = mediaCandidates.some((candidate: any) => {
      const type = candidate?.type || message.metadata?.mediaType || message.type || 'file';
      return !!candidate?.objectKey && mediaTypeSet.has(String(type));
    });

    console.log('[ChatScreen][auto-download] download decision', {
      messageId: message.id,
      shouldDownload,
      candidateCount: mediaCandidates.length,
      mediaCandidates: mediaCandidates.map((candidate: any) => ({
        id: candidate?.id,
        objectKey: candidate?.objectKey,
        type: candidate?.type,
        uri: candidate?.uri,
      })),
    });

    if (!shouldDownload) return;

    const downloadBaseUrl = 'https://pub-9e006aecccb34fa0af4dc9a24327c25f.r2.dev';
    
    // Use hardcoded Android paths with VSChat subfolder for organization
    const dirs: any = Platform.OS === 'android'
      ? {
          PictureDir: '/storage/emulated/0/Pictures/VSChat',
          MovieDir: '/storage/emulated/0/Movies/VSChat',
          DownloadDir: '/storage/emulated/0/Download/VSChat',
          DocumentDir: '/storage/emulated/0/Download/VSChat',
          MusicDir: '/storage/emulated/0/Music/VSChat',
        }
      : {
          PictureDir: '/var/mobile/Media/DCIM/100APPLE/VSChat',
          MovieDir: '/var/mobile/Media/DCIM/VSChat',
          DownloadDir: '/var/mobile/Downloads/VSChat',
          DocumentDir: '/var/mobile/Downloads/VSChat',
          MusicDir: '/var/mobile/Music/VSChat',
        };

    // Detailed diagnostics for RNFetchBlob availability
    const isRNFetchBlobValid = validateRNFetchBlob(RNFetchBlob);
    const blobMethods = RNFetchBlob ? Object.keys(RNFetchBlob).slice(0, 20) : [];
    console.log('[ChatScreen][auto-download] RNFetchBlob status', {
      rnFetchBlobAvailable: !!RNFetchBlob,
      isValid: isRNFetchBlobValid,
      hasConfig: !!RNFetchBlob?.config,
      hasFetch: !!RNFetchBlob?.fetch,
      hasWrap: !!RNFetchBlob?.wrap,
      hasFs: !!RNFetchBlob?.fs,
      hasFsStat: !!RNFetchBlob?.fs?.stat,
      hasFsExists: !!RNFetchBlob?.fs?.exists,
      platform: Platform.OS,
      availableMethods: blobMethods,
      dirs,
    });

    if (!isRNFetchBlobValid) {
      console.warn('[ChatScreen][auto-download] RNFetchBlob not properly initialized or missing required methods', {
        available: !!RNFetchBlob,
        config: typeof RNFetchBlob?.config,
        fetch: typeof RNFetchBlob?.fetch,
        wrap: typeof RNFetchBlob?.wrap,
        fs: typeof RNFetchBlob?.fs,
        moduleKeys: RNFetchBlob ? Object.keys(RNFetchBlob) : [],
        hint: 'Try: cd WhatsAppClone && npm run android (to rebuild native modules)',
      });
      return;
    }

    await Promise.all(
      mediaCandidates.map(async (candidate: any) => {
        const objectKey = candidate?.objectKey || (message as any).objectKey;
        const mediaType = candidate?.type || message.metadata?.mediaType || message.type || 'file';
        if (!objectKey) {
          console.log('[ChatScreen][auto-download] no objectKey, skipping', { messageId: message.id });
          return;
        }

        // objectKey is already in the correct format (e.g., "media/abc/def.jpg")
        // No need to extract from URL - use it directly
        const resolvedObjectKey = objectKey.startsWith('http') 
          ? extractMediaObjectKey(objectKey, downloadBaseUrl)
          : objectKey;
          
        console.log('[ChatScreen][auto-download] resolved objectKey', {
          messageId: message.id,
          original: objectKey,
          resolved: resolvedObjectKey,
        });

        if (!resolvedObjectKey) {
          console.warn('[ChatScreen][auto-download] failed to resolve objectKey', { messageId: message.id, objectKey });
          return;
        }

        // Extract just the filename from the full objectKey path
        // e.g., "media/6a2d001c4c0067e214f7bc46/2026/06/a10ebccf-b887-45ab-b52e-4563d0e9f6d4.jpg"
        // becomes "a10ebccf-b887-45ab-b52e-4563d0e9f6d4.jpg"
        const objectKeyFilename = resolvedObjectKey.split('/').pop() || resolvedObjectKey;
        
        // Remove extension from filename (if present) to avoid .jpg.jpg
        // "a10ebccf-b887-45ab-b52e-4563d0e9f6d4.jpg" becomes "a10ebccf-b887-45ab-b52e-4563d0e9f6d4"
        const filenameWithoutExt = objectKeyFilename.includes('.') 
          ? objectKeyFilename.split('.').slice(0, -1).join('.')
          : objectKeyFilename;

        const fileName = buildMediaDownloadFileName({
          mediaId: filenameWithoutExt,
          messageId: String(message.id),
          objectKey: objectKeyFilename,  // Pass just the filename part
          mimeType: candidate?.mimeType || message.metadata?.mimeType,
        });
        const destinationDir = getMediaStorageDirectory(mediaType, dirs);
        console.log('[ChatScreen][auto-download] destination check', {
          messageId: message.id,
          destinationDir,
          mediaType,
          objectKeyFilename,
          fileName,
          filenameWithoutExt,
          dirs,
        });

        const destinationPath = `${destinationDir}/${fileName}`;
        const downloadKey = `${String(message.id)}:${fileName}`;
        console.log('[ChatScreen][auto-download] preparing download', {
          messageId: message.id,
          fileName,
          destinationPath,
          resolvedObjectKey,
        });
        if (pendingMediaDownloadKeysRef.current.has(downloadKey) || completedMediaDownloadKeysRef.current.has(downloadKey)) {
          console.log('[ChatScreen][auto-download] skipping duplicate request', { messageId: message.id, fileName });
          return;
        }

        let exists = false;
        try {
          if (RNFetchBlob.fs && typeof RNFetchBlob.fs.exists === 'function') {
            exists = await RNFetchBlob.fs.exists(destinationPath);
          }
        } catch (e) {
          console.warn('[ChatScreen][auto-download] media existence check failed', e);
          exists = false;
        }
        if (exists) {
          console.log('[ChatScreen][auto-download] file already exists, skipping', { messageId: message.id, destinationPath });
          completedMediaDownloadKeysRef.current.add(downloadKey);
          return;
        }

        pendingMediaDownloadKeysRef.current.add(downloadKey);

        // Create destination directory if it doesn't exist
        try {
          if (RNFetchBlob.fs && typeof RNFetchBlob.fs.mkdir === 'function') {
            await RNFetchBlob.fs.mkdir(destinationDir);
            console.log('[ChatScreen][auto-download] directory created/verified', { destinationDir });
          }
        } catch (mkdirErr) {
          console.warn('[ChatScreen][auto-download] directory creation failed', { destinationDir, error: mkdirErr });
        }

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          let downloadUrl = '';
          try {
            // Fetch download URL from backend instead of building manually
            try {
              // Pass mediaType to help backend choose the right public URL
              downloadUrl = await fetchDownloadUrl(resolvedObjectKey, true, mediaType);
            } catch (urlError) {
              console.warn('[ChatScreen][auto-download] failed to fetch download URL, skipping', { messageId: message.id, resolvedObjectKey, mediaType, error: urlError });
              return;
            }
            
            if (!downloadUrl) {
              console.warn('[ChatScreen][auto-download] no download URL available, skipping', { messageId: message.id, resolvedObjectKey });
              return;
            }
            
            console.log('[ChatScreen][auto-download] attempt', { 
              attempt, 
              messageId: message.id, 
              downloadUrl: downloadUrl,  // Full URL for debugging
              destinationPath 
            });
            
            // Download with timeout, proper response handling, and headers
            const configOptions: any = {
              path: destinationPath,
              // Ensure RNFetchBlob writes a cached file to disk when using a
              // custom path. `fileCache: true` is more reliable for binary
              // downloads on Android.
              fileCache: true,
            };
            // Only enable `trusty` for non-HTTPS or obvious dev hosts to avoid
            // triggering native trust-manager issues on Android for normal HTTPS
            // public URLs. `trusty` allows self-signed certs and should not be
            // used for public endpoints.
            try {
              const lower = String(downloadUrl || '').toLowerCase();
              if (lower.startsWith('http://') || lower.includes('localhost') || lower.includes('127.0.0.1')) {
                configOptions.trusty = true;
              }
              // If we can infer a file extension, let RNFetchBlob append it.
              try {
                const extMatch = (objectKeyFilename || '').match(/\.([a-z0-9]+)$/i);
                if (extMatch && extMatch[1]) configOptions.appendExt = extMatch[1].toLowerCase();
              } catch (e) {}
            } catch (e) {
              // ignore and proceed without `trusty`
            }

            const response = await RNFetchBlob.config(configOptions).fetch('GET', downloadUrl, {
              // Add headers to avoid Cloudflare blocking
              'User-Agent': 'Mozilla/5.0 (Android) WhatsAppClone/1.0',
              'Accept': 'image/*,*/*;q=0.8',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Cache-Control': 'no-cache'
            });
            
            // Verify HTTP response status
            const responseStatus = response?.respInfo?.status || response?.status || 0;
            const responseHeaders = response?.respInfo?.headers || {};
            const contentType = responseHeaders['content-type'] || responseHeaders['Content-Type'] || 'unknown';
            const contentLength = responseHeaders['content-length'] || responseHeaders['Content-Length'] || 'unknown';
            
            console.log('[ChatScreen][auto-download] response status', { 
              messageId: message.id, 
              status: responseStatus,
              statusText: response?.respInfo?.statusText || 'unknown',
              contentType,
              contentLength,
              allHeaders: responseHeaders
            });
            
            if (responseStatus < 200 || responseStatus >= 300) {
              console.error('[ChatScreen][auto-download] HTTP error status', { 
                messageId: message.id, 
                status: responseStatus,
                contentType,
                downloadUrl 
              });
              throw new Error(`HTTP error: ${responseStatus}`);
            }
            
            // Verify response is actually an image
            if (!contentType.includes('image') && !contentType.includes('octet-stream')) {
              console.error('[ChatScreen][auto-download] response is not an image', { 
                messageId: message.id, 
                contentType,
                downloadUrl,
                suggestion: 'Server returned non-image content type'
              });
              throw new Error(`Response is not an image: ${contentType}`);
            }
            
            let finalExists = false;
            let fileSize = 0;
            try {
              if (RNFetchBlob.fs && typeof RNFetchBlob.fs.exists === 'function') {
                finalExists = await RNFetchBlob.fs.exists(destinationPath);
              } else {
                // If fs.exists not available, assume success since fetch didn't throw
                finalExists = true;
              }
              // Log RNFetchBlob response path if available for diagnostics
              try {
                const respPath = (response && (typeof response.path === 'function' ? response.path() : response.path)) || null;
                console.log('[ChatScreen][auto-download] RNFetchBlob response path', { messageId: message.id, respPath });
              } catch (e) {}
              
              // Check file size to ensure it's not empty/corrupted
              if (finalExists && RNFetchBlob.fs && typeof RNFetchBlob.fs.stat === 'function') {
                try {
                  const stat = await RNFetchBlob.fs.stat(destinationPath);
                  fileSize = stat.size || 0;
                  console.log('[ChatScreen][auto-download] file stat', { messageId: message.id, fileSize, path: destinationPath });
                  
                  // If file is suspiciously small, read it to check if it's an error page
                  if (fileSize < 1000 && fileSize > 0) {
                    console.warn('[ChatScreen][auto-download] file is suspiciously small', { fileSize });
                    // Try to read first bytes as base64 to detect binary image header
                    try {
                      if (RNFetchBlob.fs && typeof RNFetchBlob.fs.readFile === 'function') {
                        const previewBase64 = await RNFetchBlob.fs.readFile(destinationPath, 'base64');
                        const previewSnippet = previewBase64.substring(0, 32);
                        console.warn('[ChatScreen][auto-download] file preview (base64 snippet):', previewSnippet);
                        // JPEG base64 starts with '/9j/' often, PNG starts with 'iVBOR'
                        const looksLikeJpeg = previewBase64.startsWith('/9j');
                        const looksLikePng = previewBase64.startsWith('iVBOR');
                        if (looksLikeJpeg || looksLikePng) {
                          console.warn('[ChatScreen][auto-download] small file appears to contain image bytes (maybe truncated)', { looksLikeJpeg, looksLikePng });
                        } else {
                          // Could be an HTML error page or other text
                          const previewText = Buffer.from(previewBase64, 'base64').toString('utf8').substring(0, 500);
                          console.warn('[ChatScreen][auto-download] file preview text (first 500 chars):', previewText);
                          if (previewText.includes('<!DOCTYPE') || previewText.includes('<html') || previewText.includes('error') || previewText.includes('403') || previewText.includes('404') || previewText.includes('cloudflare')) {
                            throw new Error('Downloaded file appears to be error page, not image');
                          }
                        }
                      }
                    } catch (readErr) {
                      console.warn('[ChatScreen][auto-download] could not read file preview:', readErr);
                    }
                    throw new Error(`Downloaded file is too small: ${fileSize} bytes`);
                  }
                  
                  if (fileSize === 0) {
                    console.warn('[ChatScreen][auto-download] downloaded file is empty', { messageId: message.id, destinationPath });
                    throw new Error('Downloaded file is empty');
                  }
                } catch (statErr) {
                  console.warn('[ChatScreen][auto-download] failed to stat file', statErr);
                }
              }
            } catch (e) {
              console.warn('[ChatScreen][auto-download] post-download check failed', e);
              finalExists = true; // assume success
            }
            
            console.log('[ChatScreen][auto-download] result', { attempt, messageId: message.id, finalExists, fileSize, destinationPath });
            if (finalExists && fileSize > 0) {
              completedMediaDownloadKeysRef.current.add(downloadKey);
              console.log('[ChatScreen][auto-download] download successful', { messageId: message.id, fileName, fileSize, destinationPath });
              // Trigger MediaStore scan so file appears in Gallery
              await scanMediaFile(destinationPath, mediaType);
              return;
            }
            throw new Error(`Downloaded file check failed: exists=${finalExists}, size=${fileSize}`);

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            // For transient failures before the final attempt, log as info
            if (attempt < 3) {
              console.log('[ChatScreen][auto-download] download error on attempt', {
                attempt,
                messageId: message.id,
                errorMsg,
                errorType: error?.constructor?.name,
                retrying: true,
              });
            } else {
              // Final attempt: try fallback first before emitting a warning
              console.log('[ChatScreen][auto-download] download error on final attempt, trying fallback', {
                attempt,
                messageId: message.id,
                errorMsg,
                errorType: error?.constructor?.name,
              });

              // Fallback: try to fetch the file as base64 in-memory and write it
              // using RNFetchBlob.fs.writeFile. This uses a different native
              // path and can succeed when the config path download was
              // interrupted or truncated.
              let fallbackSucceeded = false;
              try {
                console.log('[ChatScreen][auto-download] attempting fallback download via RNFetchBlob.fetch (base64) for', { messageId: message.id, downloadUrl });
                const fallbackResp: any = await RNFetchBlob.fetch('GET', downloadUrl, {
                  'User-Agent': 'Mozilla/5.0 (Android) WhatsAppClone/1.0',
                  'Accept': 'image/*,*/*;q=0.8',
                  'Accept-Encoding': 'identity',
                  'Connection': 'keep-alive',
                });
                const fallbackStatus = fallbackResp?.respInfo?.status || fallbackResp?.status || 0;
                console.log('[ChatScreen][auto-download] fallback response status', { messageId: message.id, fallbackStatus });
                if (fallbackStatus >= 200 && fallbackStatus < 300) {
                  // Get base64 string and write to destination
                  const base64Data = fallbackResp.base64();
                  console.log('[ChatScreen][auto-download] fallback base64 length', { messageId: message.id, len: base64Data?.length });
                  // Remove any existing partial file before writing
                  try {
                    if (await RNFetchBlob.fs.exists(destinationPath)) {
                      await RNFetchBlob.fs.unlink(destinationPath);
                    }
                  } catch (unlinkErr) {
                    console.warn('[ChatScreen][auto-download] could not unlink existing file before fallback write', unlinkErr);
                  }
                  try {
                    await RNFetchBlob.fs.writeFile(destinationPath, base64Data, 'base64');
                  } catch (writeErr) {
                    console.warn('[ChatScreen][auto-download] fallback writeFile error', writeErr);
                    throw writeErr;
                  }
                  // verify written file
                  let fbExists = false;
                  let fbSize = 0;
                  try {
                    fbExists = await RNFetchBlob.fs.exists(destinationPath);
                    if (fbExists) {
                      const statFb = await RNFetchBlob.fs.stat(destinationPath);
                      fbSize = statFb.size || 0;
                    }
                  } catch (fbStatErr) {
                    console.warn('[ChatScreen][auto-download] fallback stat failed', fbStatErr);
                  }
                  console.log('[ChatScreen][auto-download] fallback write result', { messageId: message.id, fbExists, fbSize });
                  if (fbExists && fbSize > 0) {
                    completedMediaDownloadKeysRef.current.add(downloadKey);
                    console.log('[ChatScreen][auto-download] fallback download successful', { messageId: message.id, destinationPath, fbSize });
                    // Trigger MediaStore scan so file appears in Gallery
                    await scanMediaFile(destinationPath, mediaType);
                    fallbackSucceeded = true;
                  }
                }
              } catch (fbError) {
                console.warn('[ChatScreen][auto-download] fallback download failed', fbError);
              }

              if (!fallbackSucceeded) {
                console.warn('[ChatScreen][auto-download] media download failed after retries', {
                  messageId: message.id,
                  objectKey,
                  resolvedObjectKey,
                  destinationPath,
                  finalError: errorMsg,
                  suggestion: 'Check network connection or try again. If issue persists, file may not be accessible.',
                });
              }

              return;
            }
            // Exponential backoff: 1s, 2s, 4s
            const delayMs = (Math.pow(2, attempt - 1)) * 1000;
            console.log('[ChatScreen][auto-download] retrying in', delayMs, 'ms');
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }),
    );

    pendingMediaDownloadKeysRef.current.clear();
  };

  const liveLocationDurations = [
    { label: '15 min', value: 15 * 60 * 1000 },
    { label: '1 hr', value: 60 * 60 * 1000 },
    { label: '8 hr', value: 8 * 60 * 60 * 1000 },
  ];

  const menuOptions = [
    'New group',
    isGroupConversation ? 'View group info' : 'View contact',
    'Search',
    'Media, links, and docs',
    'Mute notifications',
    'Disappearing messages',
    'Chat theme',
    'More',
  ];
  const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '😭'];

  const screenWidth = Dimensions.get('window').width;

  const normalizeServerMessage = (msg: any): Message => {
    const senderId = String(msg.senderId || '');
    const isOwn = senderId === String(currentUserId);
    const type = msg.type === 'document' ? 'file' : (msg.type || 'text');
    const senderAvatar =
      msg.senderAvatar || msg.profilePictureUrl || msg.senderProfilePictureUrl || undefined;
    const call =
      type === 'call'
        ? {
            ...(msg.call || {}),
            type:
              msg.call?.type ||
              (String(msg.content || '').toLowerCase().includes('video') ? 'video' : 'voice'),
            status: msg.call?.status || 'noAnswer',
            direction: isOwn ? 'outgoing' : 'incoming',
          }
        : msg.call;

    // derive current user's reaction from reactions array when present
    const reactionsArr = Array.isArray(msg.reactions) ? msg.reactions.map((r: any) => ({ userId: String(r.userId || r.reactBy || r.reactedBy), reaction: r.reaction })) : [];
    const myReactionObj = reactionsArr.find((r: any) => String(r.userId) === String(currentUserId));

    // Extract media items from server response (handles multiple possible field names)
    let mediaItems: Message['mediaItems'] = undefined;

    // Try direct mediaItems array first
    if (Array.isArray(msg.mediaItems) && msg.mediaItems.length > 0) {
      mediaItems = msg.mediaItems.map((item: any) => ({
        id: item.id || item._id || item.objectKey || item.key || item.url,
        uri: item.url || item.uri || item.downloadUrl,
        objectKey: item.objectKey || item.key,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        type: item.type || item.mediaType || (item.url?.includes('video') ? 'video' : 'image'),
        name: item.originalFilename || item.name || item.filename || 'Media',
      })).filter((item: any) => !!(item.uri || item.objectKey));
    }
    // Try attachments array as fallback
    else if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      mediaItems = msg.attachments.map((item: any) => ({
        id: item.id || item._id || item.objectKey || item.key || item.url,
        uri: item.url || item.uri || item.downloadUrl,
        objectKey: item.objectKey || item.key,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        type: item.type || item.mediaType || (item.url?.includes('video') ? 'video' : 'image'),
        name: item.originalFilename || item.name || item.filename || 'Attachment',
      })).filter((item: any) => !!(item.uri || item.objectKey));
    }
    // Try media field as fallback (single media object)
    else if (msg.media && !Array.isArray(msg.media)) {
      const singleMediaItem = {
        id: msg.media.id || msg.media._id || msg.media.objectKey || msg.media.key || msg.media.url,
        uri: msg.media.url || msg.media.uri || msg.media.downloadUrl,
        objectKey: msg.media.objectKey || msg.media.key,
        mimeType: msg.media.mimeType,
        fileSize: msg.media.fileSize,
        type: msg.media.type || msg.media.mediaType || (msg.media.url?.includes('video') ? 'video' : 'image'),
        name: msg.media.originalFilename || msg.media.name || msg.media.filename || 'Media',
      };
      mediaItems = (singleMediaItem.uri || singleMediaItem.objectKey) ? [singleMediaItem] : [];
    }
    // Handle metadata field if present (from MessageRecord)
    else if (msg.metadata && msg.metadata.objectKey && (type === 'image' || type === 'video')) {
      if (msg.downloadUrl) {
        mediaItems = [{
          id: msg.metadata.objectKey,
          uri: msg.downloadUrl,
          type: msg.metadata.mediaType || type || 'image',
          name: msg.metadata.originalFilename || 'Media',
        }];
      }
    }

    // Extract location if present
    const location = msg.location ? {
      latitude: msg.location.latitude || msg.location.lat,
      longitude: msg.location.longitude || msg.location.lng,
      expiresAt: msg.location.expiresAt,
      durationLabel: msg.location.durationLabel,
    } : undefined;

    const normalized: Message = {
      id: String(msg._id || msg.id),
      senderId,
      senderName: msg.senderName || (isOwn ? 'You' : ''),
      content: msg.content || '',
      type,
      timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
      read: msg.status === 'seen',
      status: msg.status || 'sent',
      senderAvatar: isValidAvatarUri(senderAvatar) ? senderAvatar : undefined,
      call,
      replyToId: msg.replyToId ? String(msg.replyToId) : undefined,
      replyToMediaItemIndex: typeof msg.replyToMediaItemIndex === 'number' ? msg.replyToMediaItemIndex : undefined,
      replyToMediaItemId: msg.replyToMediaItemId ? String(msg.replyToMediaItemId) : undefined,
      replyToMediaItemObjectKey: msg.replyToMediaItemObjectKey ? String(msg.replyToMediaItemObjectKey) : undefined,
      forwarded: !!msg.forwarded,
      forwardedFrom: msg.forwardedFrom || null,
      reaction: msg.reaction || (myReactionObj ? myReactionObj.reaction : undefined),
      reactions: reactionsArr,
      systemEventType: msg.systemEventType || msg.metadata?.systemEventType || undefined,
      systemActorId: msg.systemActorId || msg.metadata?.systemActorId || undefined,
      systemActorName: msg.systemActorName || msg.metadata?.systemActorName || undefined,
      systemTargetIds: Array.isArray(msg.systemTargetIds || msg.metadata?.systemTargetIds)
        ? (msg.systemTargetIds || msg.metadata?.systemTargetIds || [])
        : undefined,
      systemTargetNames: Array.isArray(msg.systemTargetNames || msg.metadata?.systemTargetNames)
        ? (msg.systemTargetNames || msg.metadata?.systemTargetNames || [])
        : undefined,
      systemAudienceIds: Array.isArray(msg.systemAudienceIds || msg.metadata?.systemAudienceIds)
        ? (msg.systemAudienceIds || msg.metadata?.systemAudienceIds || [])
        : undefined,
      systemData: msg.systemData || msg.metadata?.systemData || undefined,
    };

    // Add media fields if present
    if (mediaItems && mediaItems.length > 0) {
      const docName = msg.metadata?.originalFilename || msg.originalFilename || (typeof msg.content === 'string' ? msg.content : null);
      normalized.mediaItems = mediaItems.map((item: any) => (
        (type === 'file' || type === 'document') && docName && (!item.name || /^(media|attachment|document)$/i.test(String(item.name)))
          ? { ...item, name: docName }
          : item
      ));
      if (docName && (type === 'file' || type === 'document')) {
        (normalized as any).originalFilename = docName;
      }
    }
    if (msg.mediaUrl) normalized.mediaUrl = msg.mediaUrl;
    if (msg.downloadUrl && !mediaItems) normalized.mediaUrl = msg.downloadUrl;
    if (msg.metadata?.objectKey) normalized.metadata = msg.metadata;
    else {
      const keyedMedia = msg.mediaItems?.find?.((item: any) => item.objectKey || item.key)
        || msg.attachments?.find?.((item: any) => item.objectKey || item.key)
        || msg.media;
      const objectKey = msg.objectKey || keyedMedia?.objectKey || keyedMedia?.key;
      if (objectKey) {
        normalized.metadata = {
          objectKey,
          mimeType: msg.mimeType || keyedMedia?.mimeType,
          fileSize: msg.fileSize || keyedMedia?.fileSize,
          mediaType: msg.mediaType || keyedMedia?.mediaType || type,
          originalFilename: msg.originalFilename || keyedMedia?.originalFilename,
        };
      }
    }
    if ((type === 'file' || type === 'document') && !normalized.metadata?.originalFilename) {
      const fallbackDocName = msg.metadata?.originalFilename || msg.originalFilename || (typeof msg.content === 'string' ? msg.content : null);
      if (fallbackDocName) {
        normalized.metadata = {
          ...(normalized.metadata || { objectKey: msg.metadata?.objectKey || msg.objectKey || '' }),
          originalFilename: fallbackDocName,
        };
      }
    }
    if (location) normalized.location = location;
    if (Array.isArray(msg.mediaReactions)) {
      normalized.mediaReactions = msg.mediaReactions.map((reaction: any) => ({
        mediaItemId: String(reaction.mediaItemId || reaction.mediaItemObjectKey || reaction.mediaItemKey || ''),
        userId: String(reaction.userId || reaction.reactBy || reaction.reactedBy || ''),
        reaction: reaction.reaction,
        reactedAt: reaction.reactedAt ? new Date(reaction.reactedAt) : undefined,
      })).filter((reaction: any) => reaction.mediaItemId && reaction.userId && reaction.reaction);
    }

    return normalized;
  };

  const getStableMediaItemIds = (item: any) => [item?.id, item?.objectKey, item?.key]
    .filter(Boolean)
    .map((value) => String(value));

  const aggregateReactionSummary = (reactions: any[] = []) => {
    const totals: Record<string, number> = {};
    reactions.forEach((reaction) => {
      if (!reaction || !reaction.reaction) return;
      totals[reaction.reaction] = (totals[reaction.reaction] || 0) + 1;
    });

    return Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .map((reaction) => ({ reaction, count: totals[reaction] }));
  };

  const getVisibleMediaReactionSummary = (message: Message) => {
    const mediaItems = Array.isArray(message?.mediaItems) ? message.mediaItems : [];
    const mediaReactions = Array.isArray(message?.mediaReactions) ? message.mediaReactions : [];
    if (!mediaItems.length || !mediaReactions.length) return [];

    const visibleIds = new Set(
      mediaItems.flatMap((item) => getStableMediaItemIds(item)),
    );

    const filtered = mediaReactions.filter((reaction: any) => visibleIds.has(String(reaction.mediaItemId)));
    return aggregateReactionSummary(filtered);
  };

  const applyMediaReactionUpdate = (reactions: any[] = [], mediaItemId: string, userId: string, reaction: string | null) => {
    const normalizedMediaItemId = String(mediaItemId);
    const normalizedUserId = String(userId);
    const existing = Array.isArray(reactions) ? [...reactions] : [];
    const currentReaction = existing.find((item) => String(item.userId) === normalizedUserId && String(item.mediaItemId) === normalizedMediaItemId);
    const nextReaction = currentReaction?.reaction === reaction ? null : reaction;

    if (nextReaction) {
      if (currentReaction) {
        return existing.map((item) => (
          String(item.userId) === normalizedUserId && String(item.mediaItemId) === normalizedMediaItemId
            ? { ...item, mediaItemId: normalizedMediaItemId, userId: normalizedUserId, reaction: nextReaction, reactedAt: new Date() }
            : item
        ));
      }

      return [
        ...existing,
        { mediaItemId: normalizedMediaItemId, userId: normalizedUserId, reaction: nextReaction, reactedAt: new Date() },
      ];
    }

    return existing.filter(
      (item) => !(String(item.userId) === normalizedUserId && String(item.mediaItemId) === normalizedMediaItemId),
    );
  };

  const mediaItemMatchesHiddenSelection = (messageId: string, item: any) => {
    const hiddenIds = hiddenMediaItemIdsRef.current.get(String(messageId));
    if (!hiddenIds || hiddenIds.size === 0) return false;

    const itemIds = [item?.id, item?.objectKey, item?.key, item?.uri]
      .filter(Boolean)
      .map((value) => String(value));

    return itemIds.some((id) => hiddenIds.has(id));
  };

  const getVisibleMessageForRender = (message: Message) => {
    if (!message) return null;

    const hiddenIds = hiddenMediaItemIdsRef.current.get(String(message.id));
    if (!hiddenIds || hiddenIds.size === 0) return message;

    if (Array.isArray(message.mediaItems) && message.mediaItems.length > 0) {
      const remainingMediaItems = message.mediaItems.filter(
        (item) => !mediaItemMatchesHiddenSelection(String(message.id), item),
      );

      if (remainingMediaItems.length === message.mediaItems.length) return message;

      if (remainingMediaItems.length > 0) {
        return {
          ...message,
          mediaItems: remainingMediaItems,
          type: remainingMediaItems.length > 1 ? 'mediaGroup' : remainingMediaItems[0].type || message.type,
        };
      }

      return null;
    }

    const mediaKeys = [message.mediaUrl, message.metadata?.objectKey]
      .filter(Boolean)
      .map((value) => String(value));

    if (mediaKeys.some((key) => hiddenIds.has(key))) {
      return null;
    }

    return message;
  };

  const getParticipantDisplayNameById = (participantId?: string | null) => {
    if (!participantId) return '';
    const normalizedId = String(participantId);
    if (currentUserId && normalizedId === String(currentUserId)) {
      return 'You';
    }

    const sourceLists = [membersProfiles || [], chat?.participants || []];
    for (const list of sourceLists) {
      const found = (list || []).find((participant: any) => String(getParticipantId(participant)) === normalizedId);
      if (!found) continue;
      return found.displayName || found.name || found.title || found.phoneNumber || found.phone || '';
    }

    return '';
  };

  const renderSystemMessageText = (message: Message) => {
    if (!message) return '';

    const primary = buildSystemMessageText({
      message,
      currentUserId,
      getParticipantDisplayNameById,
    });

    if (primary) return primary;

    // Fallback: if the formatter produced an empty string (e.g. missing actor info),
    // attempt a local reconstruction using participant lookup so group-change
    // events still show a deterministic actor or "You" like member add/remove.
    const eventType = String(message.systemEventType || message.metadata?.systemEventType || '').toLowerCase();
    const actorId = String(message.systemActorId || message.senderId || '');
    const isSelf = currentUserId && actorId && String(actorId) === String(currentUserId);
    const actorNameLocal = isSelf
      ? 'You'
      : (message.systemActorName || message.senderName || getParticipantDisplayNameById(actorId) || '').trim();

    const actorPrefix = actorNameLocal ? `${actorNameLocal} ` : '';
    const data = message.systemData || message.metadata?.systemData || {};

    const genericRegex = /\b(someone|a member)\b/i;
    switch (eventType) {
      case 'group_description_changed':
        return actorNameLocal ? `${actorPrefix}changed the group description.` : String(message.content || '');
      case 'group_photo_changed':
        return actorNameLocal ? `${actorPrefix}changed the group photo.` : String(message.content || '');
      case 'group_name_changed': {
        const newName = data.newName || data.title || data.groupName || '';
        return actorNameLocal && newName
          ? `${actorPrefix}changed the group name to "${newName}".`
          : String(message.content || '');
      }
      default:
        // Avoid rendering stale generic placeholders like "Someone"—log for diagnostics
        if (typeof message.content === 'string' && genericRegex.test(message.content)) {
          console.warn('[SystemMessage][generic-fallback] suppressed generic content', {
            id: message.id,
            eventType,
            systemActorId: message.systemActorId,
            systemActorName: message.systemActorName,
            senderId: message.senderId,
            senderName: message.senderName,
            content: message.content,
            membersProfilesSnapshot: (membersProfiles || []).map((p: any) => ({ id: p?.id || p?._id || p, name: p?.displayName || p?.name || p?.title })),
          });
          return '';
        }

        return String(message.content || '');
    }
  };

  const hideMediaItemsLocally = (messageId: string, mediaItemIds: string[]) => {
    const normalizedMessageId = String(messageId);
    const existingHiddenIds = hiddenMediaItemIdsRef.current.get(normalizedMessageId) || new Set<string>();
    mediaItemIds.forEach((id) => existingHiddenIds.add(String(id)));
    hiddenMediaItemIdsRef.current.set(normalizedMessageId, existingHiddenIds);

    try {
      const storageKey = `hiddenMediaItems:${String(conversationId || chat?.id || '')}`;
      const payload: Record<string, string[]> = {};
      hiddenMediaItemIdsRef.current.forEach((ids, key) => {
        payload[key] = Array.from(ids);
      });
      AsyncStorage.setItem(storageKey, JSON.stringify(payload)).catch(() => {});
    } catch (e) {}

    // Force a rerender so the filtered view updates immediately.
    setLoadedMessages((prev) => [...prev]);
  };

  const mapAssetToMediaItem = (asset: Asset, index: number): MediaItem | null => {
    if (!asset.uri) {
      return null;
    }

    const type = asset.type?.startsWith('video') ? 'video' : 'image';

    return {
      id: `${Date.now()}-${index}-${Math.random()}-${asset.fileName || asset.uri}`,
      uri: asset.uri,
      type,
      name: asset.fileName || (type === 'video' ? 'Video' : 'Photo'),
      mimeType: asset.type || (type === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileSize: asset.fileSize || 0,
      loading: true,
    };
  };

  const openMediaPreview = (assets?: Asset[]) => {
    const mediaItems = (assets || [])
      .map(mapAssetToMediaItem)
      .filter((item): item is MediaItem => !!item);

    if (!mediaItems.length) {
      return;
    }

    setPendingMedia(mediaItems);
    setMediaCaption('');
    setMediaPreviewVisible(true);

    setTimeout(() => {
      setPendingMedia((items) => items.map((item) => ({ ...item, loading: false })));
    }, 600);
  };

  const appendMediaToPreview = (assets?: Asset[]) => {
    const mediaItems = (assets || [])
      .map(mapAssetToMediaItem)
      .filter((item): item is MediaItem => !!item);

    if (!mediaItems.length) {
      return;
    }

    setPendingMedia((items) => [...items, ...mediaItems]);
    setMediaPreviewVisible(true);

    setTimeout(() => {
      setPendingMedia((items) => items.map((item) => ({ ...item, loading: false })));
    }, 600);
  };

  const appendDocumentsToPreview = async () => {
    try {
      const docs = await pick({ mode: 'open', allowMultiSelection: true });
      const selectedDocs = Array.isArray(docs) ? docs : [docs];
      const validDocs = selectedDocs.filter((doc) => !!doc?.uri);
      if (!validDocs.length) {
        return;
      }

      const tooLargeCount = validDocs.filter((doc) => {
        const size = doc.size || doc.fileSize || 0;
        return size > MAX_DOCUMENT_SIZE;
      }).length;

      if (tooLargeCount) {
        Alert.alert(
          'Document too large',
          `${tooLargeCount} selected file${tooLargeCount > 1 ? 's' : ''} exceed the ${Math.round(
            MAX_DOCUMENT_SIZE / (1024 * 1024),
          )} MB limit and were excluded.`,
        );
      }

      const getNameFromUri = (uri?: string) => {
        if (!uri) return undefined;
        const cleaned = uri.split('?')[0].split('#')[0];
        const candidate = cleaned.split('/').pop() || '';
        return candidate || undefined;
      };

      const isGenericName = (name?: string) => {
        if (!name) return true;
        const trimmed = String(name).trim();
        return /^(media|attachment|document)(\.[a-z0-9]{1,5})?$/i.test(trimmed);
      };

      const documentItems = validDocs
        .filter((doc) => {
          const size = doc.size || doc.fileSize || 0;
          return size <= MAX_DOCUMENT_SIZE;
        })
        .map((doc) => {
          const uriName = getNameFromUri(doc.uri);
          const name = !isGenericName(doc.name) ? doc.name : uriName || doc.name || 'Document';
          return {
            id: `${Date.now()}-doc-${Math.random()}`,
            uri: doc.uri,
            type: 'document' as const,
            name,
            mimeType: doc.mimeType || doc.type || 'application/octet-stream',
            fileSize: doc.size || doc.fileSize || 0,
            loading: true,
          };
        })
        .filter((item) => !!item.uri);

      if (!documentItems.length) {
        return;
      }

      setPendingMedia((items) => [...items, ...documentItems]);
      setMediaPreviewVisible(true);
      setTimeout(() => {
        setPendingMedia((items) => items.map((item) => ({ ...item, loading: false })));
      }, 600);
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      Alert.alert('Document', 'Unable to open file picker.');
    }
  };

  const handleAddMoreMedia = async () => {
    if (isSendingMedia) return;

    if (pendingMedia.every((item) => item.type === 'document')) {
      await appendDocumentsToPreview();
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'mixed',
      quality: 0.8,
      selectionLimit: 0,
    });

    if (result.didCancel) {
      return;
    }

    if (result.errorMessage) {
      Alert.alert('Gallery', result.errorMessage);
      return;
    }

    if (result.assets && result.assets.length > 0) {
      appendMediaToPreview(result.assets);
    }
  };

  const closeMediaPreview = () => {
    if (isSendingMedia) return;
    setMediaPreviewVisible(false);
    setPendingMedia([]);
    setMediaCaption('');
  };

  const removePendingMedia = (id: string) => {
    if (isSendingMedia) return;
    setPendingMedia((items) => {
      const nextItems = items.filter((item) => item.id !== id);
      if (!nextItems.length) {
        setMediaPreviewVisible(false);
        setMediaCaption('');
      }
      return nextItems;
    });
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    const content = messageText.trim();
    setMessageText('');

    if (conversationId) {
      try {
        if (!currentUserId) {
          console.warn('Cannot send message: no authenticated user');
          return;
        }

        try {
          const token = await AsyncStorage.getItem('accessToken');
          const socket = connectSocket(token);
          if (socket && socket.connected) {
            // optimistic local message
            const tempId = Math.random().toString();
            const optimistic: any = { id: tempId, senderId: currentUserId, senderName: 'You', content, type: 'text', timestamp: new Date(), read: false, status: 'sent' };
            if (replyMessage) {
              optimistic.replyToId = replyMessage.id;
              if (typeof replyMessage.replyToMediaItemIndex === 'number') {
                optimistic.replyToMediaItemIndex = replyMessage.replyToMediaItemIndex;
              }
              if (replyMessage.replyToMediaItemId) optimistic.replyToMediaItemId = replyMessage.replyToMediaItemId;
              if (replyMessage.replyToMediaItemObjectKey) optimistic.replyToMediaItemObjectKey = replyMessage.replyToMediaItemObjectKey;
              setReplyMessage(null);
            }
            setLoadedMessages((m) => [...m, optimistic]);
            // also update chat store so chat list shows latest message
            try {
              const target = useChatStore.getState().chats.find((c) => String(c.conversationId) === String(conversationId) || String(c.id) === String(chat?.id));
              if (target) useChatStore.getState().addMessage(target.id, optimistic);
            } catch (e) {}
            // for group chats, don't send receiverId
            const receiverId = isGroupConversation ? undefined : derivedReceiverId;
            const payload: any = { conversationId, senderId: currentUserId, receiverId, content, type: 'text', clientTempId: tempId };
            if (optimistic.replyToId) payload.replyToId = optimistic.replyToId;
            if (typeof optimistic.replyToMediaItemIndex === 'number') payload.replyToMediaItemIndex = optimistic.replyToMediaItemIndex;
            if (optimistic.replyToMediaItemId) payload.replyToMediaItemId = optimistic.replyToMediaItemId;
            if (optimistic.replyToMediaItemObjectKey) payload.replyToMediaItemObjectKey = optimistic.replyToMediaItemObjectKey;
            socket.emit('message:send', payload);
          }
          else {
            const receiverId = isGroupConversation ? undefined : derivedReceiverId;
            const sent = await messagesApi.sendMessage(
              conversationId,
              currentUserId,
              content,
              'text',
              receiverId,
              replyMessage?.id,
              replyMessage?.replyToMediaItemIndex,
              replyMessage?.replyToMediaItemId,
              replyMessage?.replyToMediaItemObjectKey,
            );
            const finalMsg = { id: sent._id, senderId: sent.senderId, senderName: sent.senderId === currentUserId ? 'You' : sent.senderName || 'Them', content: sent.content, type: sent.type, timestamp: new Date(sent.createdAt), read: false, status: sent.status || 'sent', replyToId: sent.replyToId, replyToMediaItemIndex: sent.replyToMediaItemIndex, replyToMediaItemId: sent.replyToMediaItemId, replyToMediaItemObjectKey: sent.replyToMediaItemObjectKey };
            setLoadedMessages((m) => [...m, finalMsg]);
            try {
              const target = useChatStore.getState().chats.find((c) => String(c.conversationId) === String(conversationId) || String(c.id) === String(chat?.id));
              if (target) useChatStore.getState().addMessage(target.id, finalMsg as any);
            } catch (e) {}
          }
        } catch (e) {
          console.warn('Send message failed', (e as any)?.message || String(e));
        }
      } catch (e) {
        console.warn('Send message failed', (e as any)?.message || String(e));
      }
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      return;
    }

    // fallback to local store behavior
    const newMessage: Message = {
      id: Math.random().toString(),
      senderId: currentUserId,
      senderName: user?.name || 'You',
      content,
      type: 'text',
      timestamp: new Date(),
      read: true,
    };
    if (replyMessage) {
      newMessage.replyToId = replyMessage.id;
      setReplyMessage(null);
    }
    addMessage(chat.id, newMessage);
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
  };

  // Listen for socket events to reconcile messages for this conversation when open
  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;
    let activeSocket: any = null;
    let onSent: ((msg: any) => void) | null = null;
    let onReceive: ((msg: any) => void) | null = null;
    let onStatus: ((status: any) => void) | null = null;
    let onMediaReacted: ((payload: any) => void) | null = null;

    const upsertMessage = (incoming: Message) => {
      if (deletedForMeIdsRef.current.has(String(incoming.id))) return;
      setLoadedMessages((prev) => {
        const exists = prev.some((m) => String(m.id) === String(incoming.id));
        if (exists) {
          return prev.map((m) => {
            if (String(m.id) !== String(incoming.id)) return m;
            // preserve existing reaction if incoming doesn't include it
            const preserved = { ...(m || {}) };
            const merged = { ...m, ...incoming };
            if ((merged as any).reaction === undefined && preserved.reaction !== undefined) {
              merged.reaction = preserved.reaction;
            }
            return merged;
          });
        }
        // new incoming message: add to loaded messages (don't update chat store here - do it outside setter)
        return [...prev, incoming];
      });
      // trigger side effects after state update (outside the setter to avoid React warning)
      try {
        const target = useChatStore.getState().chats.find((c) => String(c.conversationId) === String(conversationId) || String(c.id) === String(chat?.id));
        if (target) useChatStore.getState().addMessage(target.id, incoming as any);
      } catch (e) {}
      void autoDownloadReceivedMedia(incoming);
    };

    const start = async () => {
      try {
        const userRes = await AsyncStorage.getItem('user');
        const currentUser = userRes ? JSON.parse(userRes) : null;
        if (currentUser) {
          try { await messagesApi.markConversationRead(String(conversationId), currentUser.id); } catch (e) { /* ignore */ }
          try { const chatState = useChatStore.getState(); chatState.markChatAsRead(chat?.id || String(conversationId)); } catch (e) {}
        }
      } catch (e) {}
      try {
        const token = await AsyncStorage.getItem('accessToken');
        const socket = connectSocket(token);
        activeSocket = socket;

        onSent = (msg) => {
          if (!mounted) return;
          const convId = String(msg.conversationId || msg.conversation);
          if (convId !== String(conversationId)) return;
          const normalized = normalizeServerMessage(msg);
          if (deletedForMeIdsRef.current.has(String(normalized.id))) return;
          if (msg.clientTempId) {
            setLoadedMessages((prev) => prev.map((m) => {
              if (String(m.id) !== String(msg.clientTempId)) return m;
              const preservedReaction = (m as any).reaction;
              const merged = { ...normalized };
              if ((merged as any).reaction === undefined && preservedReaction !== undefined) {
                (merged as any).reaction = preservedReaction;
              }
              return merged;
            }));
          } else {
            upsertMessage(normalized);
          }
        };

        onReceive = async (msg) => {
          if (!mounted) return;
          const convId = String(msg.conversationId || msg.conversation);
          if (convId !== String(conversationId)) return;
          const normalized = normalizeServerMessage({ ...msg, status: msg.status || 'delivered' });
          if (!deletedForMeIdsRef.current.has(String(normalized.id))) upsertMessage(normalized);
          if (currentUserId && String(msg.senderId) !== String(currentUserId)) {
            try { await messagesApi.markConversationRead(String(conversationId), currentUserId); } catch (e) {}
          }
        };

        onStatus = (status) => {
          if (!mounted || !status?.messageId) return;
          setLoadedMessages((prev) =>
            prev.map((message) => {
              if (String(message.id) !== String(status.messageId)) return message;
              const updates: any = { status: status.status || message.status };
              if (typeof status.readCount === 'number') updates.readCount = status.readCount;
              if (typeof status.totalRecipients === 'number') updates.totalRecipients = status.totalRecipients;
              if (status.status === 'seen' || (typeof updates.readCount === 'number' && typeof updates.totalRecipients === 'number' && updates.readCount >= updates.totalRecipients)) {
                updates.read = true;
                updates.seenAt = status.seenAt || new Date();
              } else if (status.status === 'delivered') {
                if (message.read !== true) updates.read = false;
              }
              return { ...message, ...updates };
            }),
          );
        };

        onMediaReacted = (payload) => {
          if (!mounted) return;
          const incoming = payload?.message || payload;
          const convId = String(incoming?.conversationId || payload?.conversationId || '');
          if (!convId || convId !== String(conversationId)) return;
          if (!incoming?.id && !incoming?._id) return;
          const normalized = normalizeServerMessage(incoming);
          setLoadedMessages((prev) => prev.map((message) => (
            String(message.id) === String(normalized.id) ? normalized : message
          )));
          if (viewerMessage && String(viewerMessage.id) === String(normalized.id)) {
            setViewerMessage(normalized as any);
          }
          try {
            updateMessage(String(normalized.id), normalized as any);
          } catch (e) {}
        };

        socket.on('message:sent', onSent);
        socket.on('message:receive', onReceive);
        socket.on('message:status', onStatus);
        socket.on('message:media-reacted', onMediaReacted);
      } catch (e) {
        // ignore
      }
    };

    start();

    return () => {
      mounted = false;
      if (activeSocket) {
        if (onSent) activeSocket.off('message:sent', onSent);
        if (onReceive) activeSocket.off('message:receive', onReceive);
        if (onStatus) activeSocket.off('message:status', onStatus);
        if (onMediaReacted) activeSocket.off('message:media-reacted', onMediaReacted);
      }
    };
  }, [conversationId, currentUserId, viewerMessage]);

  const handleStartCall = (callType: 'audio' | 'video') => {
    startConversationCall({
      navigation,
      chat,
      participant,
      currentUserId,
      conversationId,
      routeParams: {
        ...route.params,
        callType,
        returnRouteName: 'Chat',
        returnRouteParams: route.params,
      },
      isGroupConversation,
    });
  };

  const handleJoinActiveGroupCall = () => {
    if (!activeGroupCall || !isGroupConversation) return;

    const callType = activeGroupCall.callType || 'audio';
    const sessionParticipants = Array.isArray(activeGroupCall.participants)
      ? activeGroupCall.participants
      : (chat?.participants || []);

    navigation.navigate('GroupActiveCall', {
      callType,
      callerName: activeGroupCall.groupName || chat?.title || 'Group',
      callerAvatar: activeGroupCall.groupAvatar || (chat as any)?.groupProfilePicture || chat?.avatar || null,
      appId: activeGroupCall.appId || activeGroupCall.metadata?.appId || AGORA_APP_ID,
      channel: activeGroupCall.channel || activeGroupCall.metadata?.channel || `call-${activeGroupCall.callId}`,
      token: activeGroupCall.token || activeGroupCall.metadata?.token || null,
      callId: activeGroupCall.callId,
      isCaller: String(activeGroupCall.callerId || '') === String(currentUserId || ''),
      isReceiver: true,
      isGroupCall: true,
      groupId: activeGroupCall.groupId || conversationId,
      groupName: activeGroupCall.groupName || chat?.title || 'Group',
      groupAvatar: activeGroupCall.groupAvatar || (chat as any)?.groupProfilePicture || chat?.avatar || null,
      groupParticipants: sessionParticipants,
      returnRoute: {
        name: 'Chat',
        params: route.params,
      },
    });
  };

  const openGroupDetails = () => {
    if (!chat || !isGroupConversation) return;
    navigation.navigate('GroupDetails', { groupId: chat.conversationId, chat });
  };

  const handleSendMediaDeprecated = () => {
    // ⚠️ DEPRECATED: This function is kept for backward compatibility but should NOT be used.
    // Media uploads now go through ImageUploader component which:
    // 1. Uploads to S3 with signed URL
    // 2. Calls /api/media/complete-upload to create message
    // 3. Never stores local file paths in MongoDB
    // See: ImageUploader component in src/components/media/ImageUploader.tsx
    if (!pendingMedia.length) return;
    closeMediaPreview();
  };

  const isGenericDocumentName = (name?: string) => {
    if (!name) return true;
    const trimmed = String(name).trim();
    return (
      /^(media|attachment|document)$/i.test(trimmed) ||
      /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(trimmed) ||
      /^[0-9a-f]{16,}$/i.test(trimmed) ||
      /^[0-9a-f-]{20,}$/i.test(trimmed)
    );
  };

  const resolveDocumentName = (item: MediaItem, index: number) => {
    const rawName = item.name || (item as any).filename || (item as any).originalFilename || '';
    if (rawName && !isGenericDocumentName(rawName)) return rawName;

    const uriPart = (item.uri || '').split('?')[0].split('#')[0].split('/').pop() || '';
    if (uriPart && !isGenericDocumentName(uriPart)) return uriPart;

    const ext = (item.mimeType || '').split('/').pop()?.toLowerCase() || item.type || 'doc';
    return `Document-${index + 1}.${ext}`;
  };

  const uploadPendingMediaItem = async (item: MediaItem, index: number) => {
    const fileName = resolveDocumentName(item, index);
    const mimeType = item.mimeType || (item.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const fileSize = item.fileSize || 0;

    const urlResponse = await getUploadUrl(conversationId, fileName, mimeType);
    const uploadUrl = urlResponse?.uploadUrl;
    const key = urlResponse?.key;
    if (!uploadUrl || !key) {
      throw new Error('Server returned invalid upload URL response');
    }

    if (!validateRNFetchBlob(RNFetchBlob)) {
      console.warn('[ChatScreen] RNFetchBlob not available or missing required functions, using fallback upload');
      const uploadResult = await uploadUsingHook({
        chatId: conversationId,
        file: { uri: item.uri || '', name: fileName, type: mimeType, size: fileSize },
        mediaType: item.type,
        skipCompleteUpload: true,
      });

      if (!uploadResult || !uploadResult.success) {
        throw new Error(uploadResult?.error || 'Upload failed');
      }

      return {
        objectKey: uploadResult.key || key,
        mimeType,
        fileSize,
        mediaType: item.type,
        originalFilename: fileName,
        order: index,
      };
    }

    let localPath = item.uri || '';
    if (localPath.startsWith('file://')) localPath = localPath.replace('file://', '');
    if (localPath.startsWith('content://')) {
      try {
        const stat = await RNFetchBlob.fs.stat(localPath);
        if (stat && stat.path) localPath = stat.path;
      } catch (e) {
        console.warn('Failed to stat content uri, proceeding with original uri', e);
      }
    }
    try {
      const uploadResp = await RNFetchBlob.fetch(
        'PUT',
        uploadUrl,
        { 'Content-Type': mimeType },
        RNFetchBlob.wrap(localPath),
      );

      const status = uploadResp.info().status;
    if (status < 200 || status >= 300) {
      throw new Error(`Failed to upload ${fileName} (status ${status})`);
    }

      return {
      objectKey: key,
      mimeType,
      fileSize,
      mediaType: item.type,
      originalFilename: fileName,
      order: index,
    };
    } catch (e) {
      console.warn('[ChatScreen] RNFetchBlob upload failed, falling back to JS upload hook', e);
      const uploadResult2 = await uploadUsingHook({
        chatId: conversationId,
        file: { uri: item.uri || '', name: fileName, type: mimeType, size: fileSize },
        mediaType: item.type,
        skipCompleteUpload: true,
      });

      if (!uploadResult2 || !uploadResult2.success) {
        throw new Error(uploadResult2?.error || e?.message || 'Upload failed');
      }

      return {
        objectKey: uploadResult2.key || key,
        mimeType,
        fileSize,
        mediaType: item.type,
        originalFilename: fileName,
        order: index,
      };
    }
  };

  const openDocumentMessage = async (message: Message) => {
    try {
      const objectKey = message.metadata?.objectKey || message.mediaItems?.[0]?.objectKey;
      const mediaType = message.metadata?.mediaType || message.type || 'file';
      const uri =
        message.mediaUrl ||
        message.mediaItems?.[0]?.uri ||
        (objectKey ? await fetchDownloadUrl(objectKey, true, mediaType) : undefined);

      if (!uri) {
        Alert.alert('Open Document', 'Unable to open document');
        return;
      }

      const normalizedUri = encodeURI(uri.trim());
      if (/^https?:\/\//i.test(normalizedUri)) {
        await Linking.openURL(normalizedUri);
        return;
      }

      const supported = await Linking.canOpenURL(normalizedUri);
      if (supported) {
        await Linking.openURL(normalizedUri);
        return;
      }

      Alert.alert('Open Document', 'Cannot open this document URL');
    } catch (e) {
      console.warn('Open document failed', e);
      Alert.alert('Open Document', 'Failed to open document');
    }
  };

  const handleSendMedia = async () => {
    if (!pendingMedia.length || isSendingMedia) return;
    if (!conversationId) {
      const docs = pendingMedia.filter((item) => item.type === 'document');
      if (docs.length && docs.length === pendingMedia.length) {
        docs.forEach((item) => {
          const resolvedName = resolveDocumentName(item, 0);
          const localMessage: Message = {
            id: Math.random().toString(),
            senderId: currentUserId,
            senderName: user?.name || 'You',
            content: mediaCaption.trim(),
            type: 'file',
            timestamp: new Date(),
            read: true,
            mediaItems: [{ ...item, name: resolvedName, loading: false }],
            metadata: {
              objectKey: item.uri || '',
              mimeType: item.mimeType || null,
              fileSize: item.fileSize || null,
              mediaType: 'document',
              originalFilename: resolvedName,
            },
          };
          addMessage(chat.id, localMessage);
        });
      } else {
        const localMessage: Message = {
          id: Math.random().toString(),
          senderId: currentUserId,
          senderName: user?.name || 'You',
          content: mediaCaption.trim(),
          type: pendingMedia.length > 1 ? 'mediaGroup' : pendingMedia[0].type,
          timestamp: new Date(),
          read: true,
          mediaItems: pendingMedia.map((item) => ({ ...item, loading: false })),
        };
        addMessage(chat.id, localMessage);
      }
      closeMediaPreview();
      return;
    }

    try {
      setIsSendingMedia(true);
      const uploadedItems = [];
      for (let index = 0; index < pendingMedia.length; index += 1) {
        uploadedItems.push(await uploadPendingMediaItem(pendingMedia[index], index));
      }

      const documentItems = uploadedItems.filter((item) => item.mediaType === 'document');
      const otherItems = uploadedItems.filter((item) => item.mediaType !== 'document');

      if (documentItems.length && otherItems.length === 0) {
        for (const item of documentItems) {
          const message = await completeUpload({
            chatId: conversationId,
            content: mediaCaption.trim() || undefined,
            objectKey: item.objectKey,
            mimeType: item.mimeType,
            fileSize: item.fileSize,
            mediaType: item.mediaType,
            originalFilename: item.originalFilename || resolveDocumentName({ ...item, uri: item.objectKey } as any, item.order || 0),
          });
          if (message) await handleMediaUploadComplete(message);
        }
      } else {
        if (otherItems.length) {
          const message = await completeUpload({
            chatId: conversationId,
            content: mediaCaption.trim() || undefined,
            items: uploadedItems,
          });
          if (message) await handleMediaUploadComplete(message);
        } else {
          // only document items but no other items
          for (const item of documentItems) {
            const message = await completeUpload({
              chatId: conversationId,
              content: mediaCaption.trim() || undefined,
              objectKey: item.objectKey,
              mimeType: item.mimeType,
              fileSize: item.fileSize,
              mediaType: item.mediaType,
              originalFilename: item.originalFilename || resolveDocumentName({ ...item, uri: item.objectKey } as any, item.order || 0),
            });
            if (message) await handleMediaUploadComplete(message);
          }
        }
      }

      setMediaPreviewVisible(false);
      setPendingMedia([]);
      setMediaCaption('');
    } catch (error: any) {
      console.error('Media upload error:', error);
      Alert.alert('Error', error?.message || 'Failed to upload media');
    } finally {
      setIsSendingMedia(false);
    }
  };

  // Refresh messages after media upload completes via ImageUploader
  const handleMediaUploadComplete = async (message: any) => {
    if (!message) {
      console.warn('[ChatScreen] handleMediaUploadComplete: no message received');
      return;
    }
    try {
      console.log('[ChatScreen] handleMediaUploadComplete received message:', {
        id: message._id || message.id,
        type: message.type,
        hasMediaItems: !!message.mediaItems,
        mediaItemsLength: Array.isArray(message.mediaItems) ? message.mediaItems.length : 0,
        hasMediaUrl: !!message.mediaUrl,
        hasAttachments: !!message.attachments,
      });

      // Message was created via complete-upload on backend with proper metadata
      // Normalize and add to local state
      const normalized = normalizeServerMessage(message);

      console.log('[ChatScreen] normalized message:', {
        id: normalized.id,
        type: normalized.type,
        hasMediaItems: !!normalized.mediaItems,
        mediaItemsLength: normalized.mediaItems ? normalized.mediaItems.length : 0,
        mediaItems: normalized.mediaItems?.map(m => ({ id: m.id, uri: m.uri, type: m.type })),
      });

      setLoadedMessages((messages) => {
        const exists = messages.some((item) => String(item.id) === String(normalized.id));
        return exists
          ? messages.map((item) => String(item.id) === String(normalized.id) ? normalized : item)
          : [...messages, normalized];
      });
      try {
        const target = useChatStore.getState().chats.find((c) => String(c.conversationId) === String(conversationId) || String(c.id) === String(chat?.id));
        if (target) useChatStore.getState().addMessage(target.id, normalized as any);
      } catch (e) {}
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } catch (e) {
      console.warn('Error processing uploaded media message', e);
    }
  };

  const addAttachmentMessage = (
    content: string,
    type: Message['type'],
    mediaUrl?: string,
  ) => {
    const newMessage: Message = {
      id: Math.random().toString(),
      senderId: currentUserId,
      senderName: user?.name || 'You',
      content,
      type,
      timestamp: new Date(),
      read: true,
      mediaUrl,
    };

    addMessage(chat.id, newMessage);

    if (replyMessage) {
      updateMessage(newMessage.id, { replyToId: replyMessage.id });
      setReplyMessage(null);
    }

    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  };

  const addLocationMessage = (
    content: string,
    type: 'location' | 'liveLocation',
    latitude: number,
    longitude: number,
    durationLabel?: string,
    expiresAt?: number,
  ) => {
    const newMessage: Message = {
      id: Math.random().toString(),
      senderId: currentUserId,
      senderName: user?.name || 'You',
      content,
      type,
      timestamp: new Date(),
      read: true,
      location: {
        latitude,
        longitude,
        durationLabel,
        expiresAt,
      },
    };

    if (conversationId) {
      if (!currentUserId) {
        console.warn('Cannot send location: no authenticated user');
      } else {
        messagesApi
          .sendMessage(
            conversationId,
            currentUserId,
            newMessage.content,
            newMessage.type,
            derivedReceiverId,
          )
          .then((sent) =>
            setLoadedMessages((m) => [
              ...m,
              {
                id: sent._id,
                senderId: sent.senderId,
                senderName:
                  sent.senderId === currentUserId ? 'You' : sent.senderName || 'Them',
                content: sent.content,
                type: sent.type,
                timestamp: new Date(sent.createdAt),
                read: false,
                status: sent.status || 'sent',
              },
            ]),
          )
          .catch((e) => console.warn('Send location failed', e));
      }
    } else {
      addMessage(chat.id, newMessage);
    }

    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    return newMessage.id;
  };

  const clearLiveLocationWatch = () => {
    if (liveLocationWatchRef.current !== null) {
      Geolocation.clearWatch(liveLocationWatchRef.current);
      liveLocationWatchRef.current = null;
    }

    if (liveLocationTimeoutRef.current) {
      clearTimeout(liveLocationTimeoutRef.current);
      liveLocationTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!conversationId) return;

    const chatState = useChatStore.getState();
    chatState.setCurrentChat({
      ...(chat || {}),
      id: chat?.id || String(conversationId),
      conversationId: String(conversationId),
    });
    markConversationNotificationsRead(String(conversationId)).catch(() => {});

    return () => {
      const current = useChatStore.getState().currentChat;
      const currentConversationId = current && String((current as any).conversationId || current.id);
      if (currentConversationId === String(conversationId)) {
        useChatStore.getState().setCurrentChat(null);
      }
    };
  }, [conversationId, chat]);

  const requestCameraPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        return status === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    } catch (error) {
      console.error('Camera permission error:', error);
      return false;
    }
  };

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'ios') {
        const status = await Geolocation.requestAuthorization('whenInUse');
        return status === 'granted';
      }

      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return status === PermissionsAndroid.RESULTS.GRANTED;
      }

      return true;
    } catch (error) {
      console.error('Location permission error:', error);
      Alert.alert('Permission Error', 'Unable to request location permission.');
      return false;
    }
  };

  const getCurrentPosition = async () => {
    try {
      const hasPermission = await requestLocationPermission();

      if (!hasPermission) {
        Alert.alert('Location Permission', 'Location permission is required to share your location.');
        return null;
      }

      return new Promise<Geolocation.GeoPosition | null>((resolve) => {
        try {
          Geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => {
              console.error('Geolocation error:', error);
              Alert.alert('Location Error', error.message || 'Unable to get your location. Please try again.');
              resolve(null);
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 10000,
            },
          );
        } catch (err) {
          console.error('Geolocation exception:', err);
          Alert.alert('Location Error', 'An error occurred while getting your location.');
          resolve(null);
        }
      });
    } catch (error) {
      console.error('getCurrentPosition error:', error);
      Alert.alert('Location Error', 'Unable to access location service.');
      return null;
    }
  };

  const handleGalleryPress = async () => {
    const result = await launchImageLibrary({
      mediaType: 'mixed',
      quality: 0.8,
      selectionLimit: 0,
    });

    if (result.didCancel) {
      return;
    }

    if (result.errorMessage) {
      Alert.alert('Gallery', result.errorMessage);
      return;
    }

    if (result.assets && result.assets.length > 0) {
      openMediaPreview(result.assets);
    }
  };

  const handleGalleryPressDeprecated = async () => {
    const result = await launchImageLibrary({
      mediaType: 'mixed',
      quality: 0.8,
      selectionLimit: 0,
    });

    if (result.didCancel) {
      return;
    }

    if (result.errorMessage) {
      Alert.alert('Gallery', result.errorMessage);
      return;
    }

    // Process each selected asset
    if (result.assets && result.assets.length > 0) {
      openMediaPreview(result.assets);
      return;

      for (const asset of result.assets) {
        try {
          const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
          const mimeType = asset.type || 'image/jpeg';
          const fileSize = asset.fileSize || 0;

          // Get signed upload URL
          const urlResponse = await getUploadUrl(conversationId, fileName, mimeType);
          console.log('[ChatScreen] getUploadUrl response:', urlResponse);
          const uploadUrl = urlResponse?.uploadUrl;
          const key = urlResponse?.key;
          if (!uploadUrl || !key) {
            throw new Error('Server returned invalid upload URL response');
          }

          // Upload to S3 / R2 using native file streaming (works reliably on RN)
          if (!RNFetchBlob) {
            // Native module not installed — fall back to JS upload using useMediaUpload hook
            try {
              console.log('[ChatScreen] RNFetchBlob missing — using JS upload fallback');
              const uploadResult = await uploadUsingHook({
                chatId: conversationId,
                file: { uri: asset.uri || '', name: fileName, type: mimeType, size: fileSize },
                mediaType: 'image',
              });

              if (!uploadResult || !uploadResult.success) {
                const errMsg = uploadResult?.error || 'Upload failed';
                console.error('[ChatScreen] JS upload fallback failed', errMsg);
                Alert.alert('Error', errMsg);
                continue;
              }

              const message = uploadResult.message;
              if (message) {
                await handleMediaUploadComplete(message);
              }
            } catch (e: any) {
              console.error('[ChatScreen] JS upload fallback error', e);
              Alert.alert('Error', e?.message || 'Failed to upload image');
            }
            continue;
          }
          // Resolve path for RNFetchBlob (remove file:// prefix if present)
          let localPath = asset.uri || '';
          if (localPath.startsWith('file://')) localPath = localPath.replace('file://', '');
          // On Android content:// URIs may be returned; resolve to filesystem path
          if (localPath.startsWith('content://')) {
            try {
              const stat = await RNFetchBlob.fs.stat(localPath);
              if (stat && stat.path) localPath = stat.path;
            } catch (e) {
              // fallback: proceed with original uri (RNFetchBlob may still handle content://)
              console.warn('Failed to stat content uri, proceeding with original uri', e);
            }
          }

          console.log('[ChatScreen] uploading media to signed URL', {
            uploadUrl,
            localPath,
            mimeType,
            key,
          });
          const uploadResp = await RNFetchBlob.fetch(
            'PUT',
            uploadUrl,
            { 'Content-Type': mimeType },
            RNFetchBlob.wrap(localPath)
          );

          const status = uploadResp.info().status;
          if (status < 200 || status >= 300) {
            Alert.alert('Error', `Failed to upload ${fileName} (status ${status})`);
            continue;
          }

          // Complete upload and create message
          const message = await completeUpload({
            chatId: conversationId,
            objectKey: key,
            mimeType: mimeType,
            fileSize: fileSize,
            mediaType: 'image',
            content: mediaCaption || undefined,
          });

          // Add to chat
          if (message) {
            await handleMediaUploadComplete(message);
          }
        } catch (error: any) {
          console.error('Image upload error:', error);
          Alert.alert('Error', error.message || 'Failed to upload image');
        }
      }
    }
  };

  const handleCameraPress = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert('Camera Permission', 'Camera permission is required to take photos.');
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: true,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorMessage) {
        Alert.alert('Camera', result.errorMessage);
        return;
      }

      const asset = result.assets?.[0];
      if (asset?.uri) {
        openMediaPreview([asset]);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Camera Error', 'An error occurred while accessing the camera.');
    }
  };

  const handleDocumentPress = async () => {
    try {
      const docs = await pick({ mode: 'open', allowMultiSelection: true });
      const selectedDocs = Array.isArray(docs) ? docs : [docs];
      const validDocs = selectedDocs.filter((doc) => !!doc?.uri);
      if (!validDocs.length) {
        return;
      }

      const tooLargeDocs = validDocs.filter((doc) => {
        const size = doc.size || doc.fileSize || 0;
        return size > MAX_DOCUMENT_SIZE;
      });

      if (tooLargeDocs.length) {
        Alert.alert(
          'Document too large',
          `${tooLargeDocs.length} selected file${tooLargeDocs.length > 1 ? 's' : ''} exceed the ${Math.round(
            MAX_DOCUMENT_SIZE / (1024 * 1024),
          )} MB limit and were excluded.`,
        );
      }

      const getNameFromUri = (uri?: string) => {
        if (!uri) return undefined;
        const cleaned = uri.split('?')[0].split('#')[0];
        const candidate = cleaned.split('/').pop() || '';
        return candidate || undefined;
      };
      const isGenericName = (name?: string) => {
        if (!name) return true;
        const trimmed = String(name).trim();
        return /^(media|attachment|document)(\.[a-z0-9]{1,5})?$/i.test(trimmed);
      };
      const mediaItems = validDocs
        .filter((doc) => {
          const size = doc.size || doc.fileSize || 0;
          return size <= MAX_DOCUMENT_SIZE;
        })
        .map((doc) => {
          const uriName = getNameFromUri(doc.uri);
          const name = !isGenericName(doc.name)
            ? doc.name
            : uriName || doc.name || 'Document';
          return {
            id: `${Date.now()}-doc-${Math.random()}`,
            uri: doc.uri,
            type: 'document' as const,
            name,
            mimeType: doc.mimeType || doc.type || 'application/octet-stream',
            fileSize: doc.size || doc.fileSize || 0,
            loading: true,
          };
        })
        .filter((item) => !!item.uri);

      if (!mediaItems.length) {
        return;
      }

      setPendingMedia(mediaItems);
      setMediaCaption('');
      setMediaPreviewVisible(true);
      setTimeout(() => {
        setPendingMedia((items) => items.map((item) => ({ ...item, loading: false })));
      }, 600);
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }

      Alert.alert('Document', 'Unable to open file picker.');
    }
  };

    const loadMessages = React.useCallback(async () => {
      if (!conversationId) {
        setLoadedMessages([]);
        setIsChatCleared(false);
        return;
      }

    try {
      let clearedAt: Date | null = null;
      try {
        const rawClearedChats = await AsyncStorage.getItem('clearedChats');
        const clearedChatMap = rawClearedChats ? JSON.parse(rawClearedChats) : {};
        const clearedAtRaw = clearedChatMap && typeof clearedChatMap === 'object'
          ? clearedChatMap[String(conversationId)] || clearedChatMap[String(chat?.id || '')]
          : null;
        clearedAt = clearedAtRaw ? new Date(clearedAtRaw) : null;

        const storageKey = `hiddenMediaItems:${String(conversationId || chat?.id || '')}`;
        const rawHidden = await AsyncStorage.getItem(storageKey);
        const parsedHidden = rawHidden ? JSON.parse(rawHidden) : {};
        const nextHiddenMap = new Map<string, Set<string>>();
        Object.entries(parsedHidden || {}).forEach(([messageId, ids]) => {
          if (!Array.isArray(ids) || !ids.length) return;
          nextHiddenMap.set(String(messageId), new Set(ids.map((id) => String(id))));
        });
        hiddenMediaItemIdsRef.current = nextHiddenMap;
      } catch (e) {}

      const msgs = await messagesApi.getMessages(conversationId);
      const normalizedMessages = (msgs || [])
        .map(normalizeServerMessage)
        .filter((message) => !clearedAt || new Date(message.timestamp || message.createdAt || 0) > clearedAt);
      setLoadedMessages(normalizedMessages);
      setIsChatCleared(!!clearedAt && normalizedMessages.length === 0);
      normalizedMessages.forEach((message) => {
        void autoDownloadReceivedMedia(message);
      });
      } catch (e) {
        console.warn('Failed to load messages', (e as any)?.message || String(e));
      }
    }, [conversationId, currentUserId]);

    useEffect(() => {
      loadMessages();
    }, [loadMessages]);

    // fetch participant profiles for group chats to map senderId -> name/avatar
    useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!chat || !isGroupConversation) return;
        try {
          const myId = (user && user.id) || null;
          const convRes = await api.get('/conversations', { params: { userId: myId } });
          const convos = convRes.data.conversations || [];
          const convId = routeConversationId || chat.conversationId || chat.id;
          const match = convos.find((c) => String(c._id) === String(convId) || String(c.id) === String(convId));
          const participants = (match && match.participants) || chat.participants || [];
          const participantIds = (participants || [])
            .map(getParticipantId)
            .filter(Boolean)
            .map(String);
          if (participantIds.length) {
            const usersResp = await api.post('/users/lookup', { ids: participantIds });
            const users = usersResp.data.users || [];
            if (!cancelled) setMembersProfiles(users);
          } else {
            setMembersProfiles([]);
          }
        } catch (e) {
          // ignore
        }
      })();
      return () => { cancelled = true; };
    }, [chat, routeConversationId, user]);

    useEffect(() => {
      const unsubscribe = navigation.addListener?.('focus', loadMessages);
      return unsubscribe;
    }, [navigation, loadMessages]);

  const handleCurrentLocationPress = async () => {
    try {
      setLocationMenuVisible(false);
      const position = await getCurrentPosition();

      if (!position) {
        return;
      }

      addLocationMessage(
        'Current location',
        'location',
        position.coords.latitude,
        position.coords.longitude,
      );
    } catch (error) {
      console.error('handleCurrentLocationPress error:', error);
      Alert.alert('Location Error', 'An error occurred while sharing your location.');
    }
  };

  const handleLiveLocationDurationPress = async (durationMs: number, label: string) => {
    try {
      setLiveDurationVisible(false);
      clearLiveLocationWatch();

      const position = await getCurrentPosition();

      if (!position) {
        return;
      }

      const expiresAt = Date.now() + durationMs;
      const messageId = addLocationMessage(
        `Live location - ${label}`,
        'liveLocation',
        position.coords.latitude,
        position.coords.longitude,
        label,
        expiresAt,
      );

      liveLocationWatchRef.current = Geolocation.watchPosition(
        (nextPosition) => {
          try {
            updateMessage(messageId, {
              location: {
                latitude: nextPosition.coords.latitude,
                longitude: nextPosition.coords.longitude,
                durationLabel: label,
                expiresAt,
              },
            });
          } catch (err) {
            console.error('Error updating location message:', err);
          }
        },
        (error) => {
          console.error('Live location watch error:', error);
          Alert.alert('Live Location', error.message || 'Unable to update live location.');
          clearLiveLocationWatch();
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10,
          interval: 30000,
          fastestInterval: 10000,
        },
      );

      liveLocationTimeoutRef.current = setTimeout(() => {
        clearLiveLocationWatch();
      }, durationMs);
    } catch (error) {
      console.error('handleLiveLocationDurationPress error:', error);
      Alert.alert('Location Error', 'An error occurred while starting live location.');
      clearLiveLocationWatch();
    }
  };

  const handleLongPressMessage = (message: Message) => {
    // enter selection mode and select the long-pressed message
    setSelectedMessages([message]);
    setActionMessage(message);
  };

  const handleToggleSelectMessage = (message: Message) => {
    // if not in selection mode, ignore
    if (!selectedMessages || selectedMessages.length === 0) return;
    const exists = selectedMessages.find((m) => String(m.id) === String(message.id));
    if (exists) {
      const next = selectedMessages.filter((m) => String(m.id) !== String(message.id));
      setSelectedMessages(next);
      setActionMessage(next.length === 1 ? next[0] : null);
    } else {
      const next = [...selectedMessages, message];
      setSelectedMessages(next);
      setActionMessage(next.length === 1 ? next[0] : null);
    }
  };

  const forwardTargetChats = chats.filter((c) => c.id !== chat.id);
  const frequentForwardTargets = forwardTargetChats.slice(0, 4);
  const recentForwardTargets = forwardTargetChats.slice(4);
  const selectedForwardNames = selectedForwardTargets
    .map((targetId) => chats.find((item) => item.id === targetId)?.title)
    .filter(Boolean)
    .join(', ');

  const getForwardTargetSubtitle = (targetChat: typeof chats[number]) => {
    if (targetChat.isGroup) {
      const participantNames =
        targetChat.participants?.map((participant) => participant.name).join(', ') || 'Group chat';
      return participantNames;
    }

    return targetChat.lastMessage || 'Tap to select';
  };

  const closeForwardPicker = () => {
    setForwardModalVisible(false);
    setForwardTargetMessages([]);
    setSelectedForwardTargets([]);
    setForwardNote('');
  };

  const handleToggleForwardTarget = (targetChatId: string) => {
    setSelectedForwardTargets((current) =>
      current.includes(targetChatId)
        ? current.filter((id) => id !== targetChatId)
        : [...current, targetChatId],
    );
  };

  const handleSendForward = () => {
    if (!forwardTargetMessages || !forwardTargetMessages.length || !selectedForwardTargets.length) return;
    const targetChatIdToOpen = selectedForwardTargets[0];
    const { forwardMessage, setCurrentChat } = useChatStore.getState();
    // Optimistically update local store for each selected target
    selectedForwardTargets.forEach((targetChatId) => {
      forwardTargetMessages.forEach((forwardMsg) => {
        forwardMessage(targetChatId, forwardMsg);
      });

      if (forwardNote.trim()) {
        addMessage(targetChatId, {
          id: Math.random().toString(),
          senderId: 'me',
          senderName: 'You',
          content: forwardNote.trim(),
          type: 'text',
          timestamp: new Date(),
          read: true,
        });
      }

      // persist forwarded messages to server in order
      try {
        const targetChat = useChatStore
          .getState()
          .chats.find((c) => c.id === targetChatId || String(c.conversationId) === String(targetChatId));
        const convId = targetChat?.conversationId || targetChatId;
        // Prepare payloads including media metadata so server can persist forwarded media
        const msgsToSend = forwardTargetMessages.map((m) => ({
          content: m.content,
          type: m.type,
          forwardedFrom: m.forwardedFrom || { senderName: m.senderName, originalContent: m.content },
          metadata: m.metadata || undefined,
          mediaItems: m.mediaItems || undefined,
          mediaUrl: m.mediaUrl || undefined,
        }));

        // Use forward-bulk endpoint so server can persist media metadata for forwarded messages
        (async () => {
          try {
            await messagesApi.forwardMessagesBulk(convId, msgsToSend);
            // After forwarding media, send the note as a text message if provided
            if (forwardNote.trim()) {
              try {
                await messagesApi.sendMessage(
                  convId,
                  currentUserId,
                  forwardNote.trim(),
                  'text',
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  false,
                  undefined,
                );
              } catch (noteErr) {
                console.warn('Failed to send forward note', noteErr);
              }
            }
          } catch (err) {
            console.warn('Forward persist failed', err);
          }
        })();
      } catch (e) {
        console.warn('Forward scheduling failed', e);
      }
    });

    const targetChatToOpen = useChatStore
      .getState()
      .chats.find((targetChat) => targetChat.id === targetChatIdToOpen);

    closeForwardPicker();
    setSelectedMessages([]);
    setActionMessage(null);

    if (targetChatToOpen) {
      setCurrentChat(targetChatToOpen);
      navigation.navigate('Chat', { chat: targetChatToOpen });
    }
  };

  const openForwardForMessage = (messageOrMessages: Message | Message[]) => {
    const arr = Array.isArray(messageOrMessages) ? messageOrMessages : [messageOrMessages];
    setForwardTargetMessages(arr);
    setSelectedForwardTargets([]);
    setForwardNote('');
    setForwardModalVisible(true);
  };

  const handleForwardNewGroupPress = () => {
    const messageToForward = forwardTargetMessages && forwardTargetMessages.length ? forwardTargetMessages[0] : null;

    closeForwardPicker();
    setSelectedMessages([]);
    setActionMessage(null);
    navigation.navigate('NewGroup', { forwardMessage: messageToForward });
  };

  const handleReplyToActionMessage = () => {
    const single = selectedMessages.length === 1 ? selectedMessages[0] : actionMessage;
    if (!single) return;
    setReplyMessage(single);
    setSelectedMessages([]);
    setActionMessage(null);
  };

  const handleToggleStarActionMessage = () => {
    const single = selectedMessages.length === 1 ? selectedMessages[0] : actionMessage;
    if (!single) return;
    updateMessage(single.id, { starred: !single.starred });
    setActionMessage((message) => (message ? { ...message, starred: !message.starred } : message));
    setSelectedMessages([]);
  };

  const handleDeleteActionMessage = () => {
    const items = selectedMessages.length ? selectedMessages : (actionMessage ? [actionMessage] : []);
    if (!items.length) return;
    const isServerId = (id: string) => /^[a-fA-F0-9]{24}$/.test(String(id));
    if (!items.every((it) => isServerId(it.id))) {
      Alert.alert('Not ready', 'One or more messages are not yet synced with server. Try again in a moment.');
      return;
    }
    const allAreSenders = items.every((it) => String(it.senderId) === String(currentUserId));

    if (allAreSenders) {
      Alert.alert('Delete messages', 'Choose deletion option', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', onPress: async () => {
          // optimistic local delete for all
          const ids = items.map((m) => String(m.id));
          try {
            ids.forEach((id) => { try { deleteMessage(id); } catch (e) {} });
            setLoadedMessages((prev) => prev.filter((m) => !ids.includes(String(m.id))));
            try { ids.forEach((id) => { deletedForMeIdsRef.current.add(String(id)); setTimeout(() => deletedForMeIdsRef.current.delete(String(id)), 10000); }); } catch (e) {}
          } catch (e) { console.warn('local delete failed', e); }

          try {
            await messagesApi.deleteMessagesForMeBulk(ids);
          } catch (e) {
            console.warn('delete for me failed, reverting locally', e);
            try {
              const msgs = await messagesApi.getMessages(conversationId);
              setLoadedMessages(msgs.map(normalizeServerMessage));
            } catch (err) { console.warn('failed to reload messages after revert', err); }
          }

          setSelectedMessages([]);
          setActionMessage(null);
        } },
        { text: 'Delete for everyone', style: 'destructive', onPress: async () => {
          try {
            const ids = items.map((m) => String(m.id));
            const res = await messagesApi.deleteMessagesForEveryoneBulk(ids);
            // update local messages to show deleted placeholder for sender
            const text = 'You deleted this message';
            setLoadedMessages((prev) => prev.map((m) => ids.includes(String(m.id)) ? { ...m, content: text, type: 'deleted', deletedForEveryone: true } : m));
          } catch (e) { console.warn('delete for everyone failed', e); }
          setSelectedMessages([]);
          setActionMessage(null);
        } },
      ]);
    } else {
      // receiver can only delete for me
      Alert.alert('Delete messages', 'Delete these messages for you?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const ids = items.map((m) => String(m.id));
          try {
            ids.forEach((id) => { try { deleteMessage(id); } catch (e) {} });
            setLoadedMessages((prev) => prev.filter((m) => !ids.includes(String(m.id))));
            try { ids.forEach((id) => { deletedForMeIdsRef.current.add(String(id)); setTimeout(() => deletedForMeIdsRef.current.delete(String(id)), 10000); }); } catch (e) {}
          } catch (e) { console.warn('local delete failed', e); }

          try {
            await messagesApi.deleteMessagesForMeBulk(ids);
          } catch (e) {
            console.warn('delete for me failed, reverting locally', e);
            try {
              const msgs = await messagesApi.getMessages(conversationId);
              setLoadedMessages(msgs.map(normalizeServerMessage));
            } catch (err) { console.warn('failed to reload messages after revert', err); }
          }

          setSelectedMessages([]);
          setActionMessage(null);
        } },
      ]);
    }
  };

  const handleReactToActionMessage = (reaction: string) => {
    const single = selectedMessages.length === 1 ? selectedMessages[0] : actionMessage;
    if (!single) return;
    const currentUser = currentUserId;
    const existingReactions = Array.isArray(single.reactions) ? [...single.reactions] : [];
    const had = existingReactions.find((r) => String(r.userId) === String(currentUser));
    const nextReaction = single.reaction === reaction ? undefined : reaction;

    // compute next reactions array (replace, add or remove current user's reaction)
    let nextReactions;
    if (nextReaction) {
      if (had) {
        nextReactions = existingReactions.map((r) => (String(r.userId) === String(currentUser) ? { ...r, reaction: nextReaction } : r));
      } else {
        nextReactions = [...existingReactions, { userId: String(currentUser), reaction: nextReaction }];
      }
    } else {
      // remove
      nextReactions = existingReactions.filter((r) => String(r.userId) !== String(currentUser));
    }

    // optimistic update in UI (global store + local loadedMessages)
    updateMessage(single.id, { reaction: nextReaction, reactions: nextReactions });
    setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(single.id) ? { ...m, reaction: nextReaction, reactions: nextReactions } : m)));
    (async () => {
      try {
        const res = await messagesApi.reactMessage(single.id, nextReaction || null);
        // Handle backend response to ensure consistency
        if (res?.message) {
          const normalized = normalizeServerMessage(res.message);
          setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(normalized.id) ? normalized : m)));
          try {
            updateMessage(String(normalized.id), normalized as any);
          } catch (e) {}
        }
      } catch (e) {
        console.warn('react API failed, reverting', e);
        // revert local change by reloading messages
        try {
          const msgs = await messagesApi.getMessages(conversationId);
          setLoadedMessages(msgs.map(normalizeServerMessage));
        } catch (err) { console.warn('failed to reload messages after react revert', err); }
      }
    })();
    // Clear action message after reacting to return to original state
    setSelectedMessages([]);
    setActionMessage(null);
  };

  const handleNativeEmojiReaction = (reaction: string) => {
    const single = selectedMessages.length === 1 ? selectedMessages[0] : actionMessage;
    if (!single) return;

    const currentUser = currentUserId;
    const existingReactions = Array.isArray(single.reactions) ? [...single.reactions] : [];
    const nextReactions = existingReactions.some((r) => String(r.userId) === String(currentUser))
      ? existingReactions.map((r) => (String(r.userId) === String(currentUser) ? { ...r, reaction } : r))
      : [...existingReactions, { userId: String(currentUser), reaction }];

    updateMessage(single.id, { reaction, reactions: nextReactions });
    setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(single.id) ? { ...m, reaction, reactions: nextReactions } : m)));

    (async () => {
      try {
        const res = await messagesApi.reactMessage(single.id, reaction);
        if (res?.message) {
          const normalized = normalizeServerMessage(res.message);
          setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(normalized.id) ? normalized : m)));
          try {
            updateMessage(String(normalized.id), normalized as any);
          } catch (e) {}
        }
      } catch (e) {
        console.warn('react API failed, reverting', e);
        try {
          const msgs = await messagesApi.getMessages(conversationId);
          setLoadedMessages(msgs.map(normalizeServerMessage));
        } catch (err) { console.warn('failed to reload messages after react revert', err); }
      }
    })();

    setNativeReactionInputVisible(false);
    setNativeReactionText('');
    nativeReactionHandledRef.current = false;
    Keyboard.dismiss();
    setSelectedMessages([]);
    setActionMessage(null);
  };

  const handleNativeReactionInputChange = (text: string) => {
    if (nativeReactionHandledRef.current) return;
    const trimmed = text.trim();
    setNativeReactionText(text);
    if (!trimmed) return;
    nativeReactionHandledRef.current = true;
    handleNativeEmojiReaction(trimmed);
  };

  const openNativeReactionInput = () => {
    nativeReactionHandledRef.current = false;
    setNativeReactionText('');
    setNativeReactionInputVisible(true);
  };

  useEffect(() => {
    if (!nativeReactionInputVisible) return;
    const timer = setTimeout(() => {
      nativeReactionInputRef.current?.focus?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [nativeReactionInputVisible]);

  const handleAttachmentOption = async (option: string) => {
    if (option === 'Gallery') {
      await handleGalleryPress();
      return;
    }

    if (option === 'Camera') {
      await handleCameraPress();
      return;
    }

    if (option === 'Document') {
      await handleDocumentPress();
      return;
    }

    if (option === 'Location') {
      setLocationMenuVisible(true);
    }
  };

  // periodic tick to refresh date labels, ensures 'Today'/'Yesterday' update at midnight
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let socket: any = null;
    let mounted = true;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        socket = connectSocket(token);
        socket.on('message:deleted', (payload: any) => {
          if (!mounted) return;
          const { messageId, deletedBy } = payload || {};
          if (!messageId) return;
          const text = String(deletedBy) === String(currentUserId) ? 'You deleted this message' : 'This message was deleted';
          // clear reactions when a message is deleted for everyone
          updateMessage(String(messageId), { content: text, type: 'deleted', deletedForEveryone: true, reactions: [], reaction: undefined });
          setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(messageId) ? { ...m, content: text, type: 'deleted', deletedForEveryone: true, reactions: [], reaction: undefined } : m)));
        });
        socket.on('message:reacted', (payload: any) => {
          if (!mounted) return;
          try {
            const { messageId, reaction, reactedBy, reactions } = payload || {};
            if (!messageId) return;
            // normalize reactions array
            const normalizedReactions = Array.isArray(reactions) ? reactions.map((r: any) => ({ userId: String(r.userId), reaction: r.reaction })) : (reaction ? [{ userId: String(reactedBy), reaction }] : []);
            // derive current user's reaction
            const myReactionObj = normalizedReactions.find((r: any) => String(r.userId) === String(currentUserId));
            const myReaction = myReactionObj ? myReactionObj.reaction : undefined;
            // update global store and local loaded messages
            try { updateMessage(String(messageId), { reaction: myReaction, reactions: normalizedReactions }); } catch (e) {}
            setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(messageId) ? { ...m, reaction: myReaction, reactions: normalizedReactions } : m)));
            // ensure chat list shows the reaction preview immediately by using the
            // centralized update path which understands reaction payloads
            try {
              const store = useChatStore.getState();
              const chatItem = store.chats.find((c) => String(c.conversationId) === String(conversationId) || String(c.id) === String(chat?.id));
              // Prefer the reacted message's content as snippet if available
              let snippet = '';
              try {
                const reactedMsg = chatItem && chatItem.messages ? (chatItem.messages.find((m: any) => String(m.id) === String(messageId))) : null;
                if (reactedMsg) snippet = buildMediaReactionSnippet(reactedMsg);
                else if (chatItem && chatItem.messages && chatItem.messages.length) {
                  const latest = chatItem.messages.slice().sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-1)[0];
                  snippet = buildMediaReactionSnippet(latest);
                }
              } catch (e) { snippet = ''; }
              // Use updateChatLastMessage with a reaction payload so store formats preview
              store.updateChatLastMessage(conversationId, { reactedBy: reactedBy, reaction, raw: snippet, originalActorId: chatItem?.lastMessageActorId }, new Date());
            } catch (e) {}
          } catch (e) {}
        });
        socket.on('message:hidden', (payload: any) => {
          if (!mounted) return;
          try {
            const { messageId } = payload || {};
            if (!messageId) return;
            // remove from global store and local loaded messages
            try { deleteMessage(String(messageId)); } catch (e) {}
            setLoadedMessages((prev) => prev.filter((m) => String(m.id) !== String(messageId)));
            try { deletedForMeIdsRef.current.add(String(messageId)); setTimeout(() => deletedForMeIdsRef.current.delete(String(messageId)), 10000); } catch (e) {}
          } catch (e) {}
        });
      } catch (e) {}
    })();

    return () => {
      mounted = false;
      try { if (socket) {
        socket.off('message:deleted');
        socket.off('message:hidden');
        socket.off('message:reacted');
      } } catch (e) {}
    };
  }, []);

  useEffect(() => {
    return () => clearLiveLocationWatch();
  }, []);

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    // date separator item
    if (item && item.__dateSeparator) {
      return (
        <View style={styles.dateSeparatorWrap} key={item.id}>
          <View style={[styles.dateSeparatorContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.dateSeparatorText, { color: theme.textSecondary }]}>{item.dateLabel}</Text>
          </View>
      </View>
    );
  }

    const renderItem = getVisibleMessageForRender(item);
    if (!renderItem) return null;
    const displayContent = renderItem.type === 'system'
      ? renderSystemMessageText(renderItem)
      : renderItem.content;

    const repliedMessage = item.replyToId
      ? sortedChatMessages.find((m) => m.id === item.replyToId)
      : null;
    const sender =
      (membersProfiles && membersProfiles.find((p) => String(p.id) === String(item.senderId))) ||
      chat.participants?.find((participant) => String(getParticipantId(participant)) === String(item.senderId)) ||
      null;
    const profileAvatar = sender && (sender.profilePictureUrl || sender.avatar);

    const fullSenderName =
      (item.senderName && item.senderName !== 'Them' ? item.senderName : '') ||
      (sender && (sender.displayName || sender.name || sender.title)) ||
      'Unknown';
    const resolvedSenderName = fullSenderName;

    const shouldShowSender = isGroupConversation && item.senderId !== currentUserId && item.type !== 'system';
    const searchMatchIndex = searchMatches.findIndex((match) => String(match.id) === String(item.id));

    return (
      <ChatBubble
        message={displayContent}
        timestamp={renderItem.timestamp}
        isOwn={renderItem.senderId === currentUserId}
        theme={theme}
        read={renderItem.read}
        status={renderItem.status}
        type={renderItem.type}
        call={renderItem.call}
        mediaUrl={renderItem.mediaUrl}
        mediaItems={renderItem.mediaItems}
        metadata={renderItem.metadata}
        location={renderItem.location}
        onMediaPress={(index?: number) => {
          console.log('[onMediaPress] called', { itemId: item?.id, index });
          (async () => {
            try {
              const idx = index || 0;
              // Resolve media URIs before opening viewer
              if (item?.mediaItems && item.mediaItems.length > 0) {
                console.log('[onMediaPress] resolving', item.mediaItems.length, 'items');
                const resolved = await resolveMediaUris(item.mediaItems);
                console.log('[onMediaPress] resolved to', resolved.length, 'items');
                if (resolved.length > 0) {
                  setViewerStartIndex(idx);
                  setViewerMessage({ ...item, mediaItems: resolved });
                  return;
                }
              }
              // Fallback: open anyway
              setViewerStartIndex(idx);
              setViewerMessage(item);
            } catch (e) {
              console.error('[onMediaPress] error', e);
            }
          })()
        }}
        onDocumentPress={() => openDocumentMessage(renderItem)}
        onForwardPress={() => openForwardForMessage(renderItem)}
        isSelected={selectedMessages.some((m) => String(m.id) === String(renderItem.id))}
        highlighted={isSearchMode && searchMatchIndex !== -1}
        reaction={renderItem.reaction}
        reactions={renderItem.reactions}
        mediaReactionSummary={getVisibleMediaReactionSummary(renderItem)}
        forwarded={renderItem.forwarded}
        showSenderInfo={shouldShowSender}
        isGroupChat={isGroupConversation}
        senderName={resolvedSenderName}
        senderAvatar={
          isValidAvatarUri(renderItem.senderAvatar)
            ? renderItem.senderAvatar
            : isValidAvatarUri(profileAvatar)
              ? profileAvatar
              : renderItem.senderId === currentUserId && isValidAvatarUri(user?.avatar)
                ? user?.avatar
                : undefined
        }
        onLongPress={() => handleLongPressMessage(renderItem)}
        onPress={() => handleToggleSelectMessage(renderItem)}
        replyTo={repliedMessage}
        replyToIndex={renderItem.replyToMediaItemIndex}
        replyToMediaItemId={renderItem.replyToMediaItemId}
        replyToMediaItemObjectKey={renderItem.replyToMediaItemObjectKey}
        onReplyPress={() => {
          if (repliedMessage) {
            const targetIndex = getRenderedIndexForMessageId(String(repliedMessage.id));
            if (targetIndex !== -1) {
              flatListRef.current?.scrollToIndex({
                index: targetIndex,
                animated: true,
                viewPosition: 0.5,
              });
              // Highlight the original message
              setActionMessage(repliedMessage);
              setTimeout(() => setActionMessage(null), 1500);
            }
          }
        }}
        onOpenReplyMedia={(msg, mediaIndex) => {
          console.log('[ChatScreen] onOpenReplyMedia called', { msgId: msg?.id, mediaCount: msg?.mediaItems?.length, mediaIndex, replyToMediaItemIndex: msg?.replyToMediaItemIndex });
          (async () => {
              try {
                // Prefer a stable media-item identity, then fall back to index.
                const stableIndex = (() => {
                  if (!msg?.mediaItems || !msg.mediaItems.length) return -1;
                  const ids = [msg.replyToMediaItemId, msg.replyToMediaItemObjectKey].filter(Boolean).map((value) => String(value));
                  if (!ids.length) return -1;
                  return msg.mediaItems.findIndex((mediaItem: any) => {
                    const itemIds = [mediaItem?.id, mediaItem?.objectKey, mediaItem?.key].filter(Boolean).map((value) => String(value));
                    return ids.some((id) => itemIds.includes(id));
                  });
                })();
                // Prefer the mediaIndex argument (from the replying message) when opening a replied media
                const idx = stableIndex !== -1 ? stableIndex : (typeof mediaIndex === 'number' ? mediaIndex : (typeof msg?.replyToMediaItemIndex === 'number' ? msg.replyToMediaItemIndex : 0));
                console.log('[onOpenReplyMedia] starting resolution for', msg?.mediaItems?.length, 'items, using index', idx);
              // Resolve media URIs before opening viewer so images load properly
              if (msg?.mediaItems && msg.mediaItems.length > 0) {
                const resolved = await resolveMediaUris(msg.mediaItems);
                console.log('[onOpenReplyMedia] resolved to', resolved.length, 'items');
                if (resolved.length > 0) {
                  // Only show viewer if we have resolved media
                  console.log('[onOpenReplyMedia] setting viewer with resolved media at index', idx);
                  setViewerStartIndex(idx);
                  setViewerMessage({ ...msg, mediaItems: resolved });
                  return;
                }
              }
              // Fallback: open anyway (single mediaUrl case)
              console.log('[onOpenReplyMedia] fallback - opening viewer without media items');
              setViewerStartIndex(idx);
              setViewerMessage(msg);
            } catch (e) {
              console.error('[onOpenReplyMedia] error', e);
            }
          })()
        }}
      />
    );
  };

  useEffect(() => {
    const items = viewerMessage?.mediaItems || [];
    const missing = items.filter((item: any) => item?.objectKey && !item.uri && !viewerResolvedUrls[item.objectKey]);
    if (!missing.length) return undefined;

    let cancelled = false;
    Promise.all(
      missing.map(async (item: any) => {
        try {
          const uri = await fetchDownloadUrl(item.objectKey);
          return [item.objectKey, uri] as const;
        } catch (e) {
          return [item.objectKey, ''] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setViewerResolvedUrls((current) => {
        const next = { ...current };
        entries.forEach(([key, uri]) => {
          if (uri) next[key] = uri;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [viewerMessage, viewerResolvedUrls]);

  const viewerMediaItems = (() => {
    console.log('[viewerMediaItems] computing with mediaItemsCount=', viewerMessage?.mediaItems?.length, 'hasMediaUrl=', !!viewerMessage?.mediaUrl || !!viewerObjectUrl);
    let result = (viewerMessage?.mediaItems
      ? viewerMessage.mediaItems
          .map((item: any) => ({
            ...item,
            uri: item.uri || (item.objectKey ? viewerResolvedUrls[item.objectKey] : undefined),
          }))
          .filter((item: any) => !!item.uri)
      : undefined) ||
    ((viewerMessage?.mediaUrl || viewerObjectUrl) &&
    (viewerMessage?.type === 'image' || viewerMessage?.type === 'video')
      ? [
          {
            id: viewerMessage?.metadata?.objectKey || viewerMessage?.mediaUrl || viewerObjectUrl,
            uri: viewerMessage?.mediaUrl || viewerObjectUrl,
            type: viewerMessage?.type,
            name: viewerMessage?.content,
          } as MediaItem,
        ]
      : []);

    // Filter out hidden media items (deleted for me)
    if (viewerMessage && result && result.length > 0) {
      result = result.filter((item) => !mediaItemMatchesHiddenSelection(String(viewerMessage.id), item));
    }

    console.log('[viewerMediaItems] result count=', result?.length, 'items=', result?.map((i: any) => ({ id: i.id, hasUri: !!i.uri })));
    return result;
  })();

  const handleReactToViewerMedia = async (payload: { messageId: string; mediaItemId: string; mediaItemObjectKey?: string; reaction: string | null }) => {
    try {
      if (!payload?.messageId || !payload?.mediaItemId || !conversationId || !currentUserId) return;

      const optimisticMessage = (message: Message) => ({
        ...message,
        mediaReactions: applyMediaReactionUpdate(
          Array.isArray(message?.mediaReactions) ? message.mediaReactions : [],
          payload.mediaItemId,
          currentUserId,
          payload.reaction,
        ),
      });

      setLoadedMessages((prev) => prev.map((item) => (
        String(item.id) === String(payload.messageId) ? optimisticMessage(item) : item
      )));
      if (viewerMessage && String(viewerMessage.id) === String(payload.messageId)) {
        setViewerMessage((current) => current ? optimisticMessage(current) : current);
      }
      try {
        updateMessage(String(payload.messageId), {
          mediaReactions: applyMediaReactionUpdate(
            Array.isArray(loadedMessages.find((item) => String(item.id) === String(payload.messageId))?.mediaReactions)
              ? loadedMessages.find((item) => String(item.id) === String(payload.messageId))?.mediaReactions
              : [],
            payload.mediaItemId,
            currentUserId,
            payload.reaction,
          ),
        } as any);
      } catch (e) {}

      const res = await messagesApi.reactMediaMessage(payload.messageId, payload.mediaItemId, payload.reaction, payload.mediaItemObjectKey);
      if (res?.message) {
        const normalized = normalizeServerMessage(res.message);
        setLoadedMessages((prev) => prev.map((item) => (
          String(item.id) === String(normalized.id) ? normalized : item
        )));
        if (viewerMessage && String(viewerMessage.id) === String(normalized.id)) {
          setViewerMessage(normalized as any);
        }
        try {
          updateMessage(String(normalized.id), normalized as any);
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[ChatScreen] react media failed', e && e.message);
    }
  };

  const getForwardCheckStyle = (selected: boolean) => [
    styles.forwardCheck,
    selected
      ? { borderColor: theme.primary, backgroundColor: theme.primary }
      : { borderColor: theme.textSecondary },
  ];

  const renderForwardTargetRow = (targetChat: typeof chats[number]) => {
    const selected = selectedForwardTargets.includes(targetChat.id);

    return (
      <TouchableOpacity
        key={targetChat.id}
        activeOpacity={0.75}
        onPress={() => handleToggleForwardTarget(targetChat.id)}
        style={styles.forwardTargetRow}
      >
        <Avatar
          source={(targetChat as any).groupProfilePicture || targetChat.avatar || (targetChat.isGroup ? '👥' : undefined)}
          size="medium"
          theme={theme}
          style={styles.forwardAvatar}
        />
        <View style={styles.forwardTargetTextBlock}>
          <Text style={[styles.forwardTargetTitle, { color: theme.text }]} numberOfLines={1}>
            {targetChat.title}
          </Text>
          <Text
            style={[styles.forwardTargetSubtitle, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {getForwardTargetSubtitle(targetChat)}
          </Text>
        </View>
        <View style={getForwardCheckStyle(selected)}>
          {selected ? <Icon name="checkmark" size={22} color={theme.background} /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.chatHeader,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {(selectedMessages && selectedMessages.length > 0) ? (
          <>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => { setSelectedMessages([]); setActionMessage(null); }}
            >
              <Icon name="arrow-back" size={26} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.selectionCount, { color: theme.text }]}>{selectedMessages.length}</Text>
            <View style={styles.selectionActions}>
              {selectedMessages.length === 1 ? (
                <TouchableOpacity
                  style={styles.selectionActionButton}
                  activeOpacity={0.75}
                  onPress={handleReplyToActionMessage}
                >
                  <Icon name="arrow-undo" size={24} color={theme.text} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.selectionActionButton}
                activeOpacity={0.75}
                onPress={handleToggleStarActionMessage}
              >
                <Icon
                  name={(selectedMessages.length === 1 ? selectedMessages[0].starred : actionMessage && actionMessage.starred) ? 'star' : 'star-outline'}
                  size={25}
                  color={theme.text}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.selectionActionButton}
                activeOpacity={0.75}
                onPress={handleDeleteActionMessage}
              >
                <Icon name="trash-outline" size={25} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.selectionActionButton}
                activeOpacity={0.75}
                onPress={() => openForwardForMessage(selectedMessages.length ? selectedMessages : actionMessage)}
              >
                <Icon name="arrow-redo" size={25} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectionActionButton} activeOpacity={0.75}>
                <TouchableOpacity onPress={() => setSelectionMenuVisible(true)} style={{ padding: 6 }}>
                  <Icon name="ellipsis-vertical" size={22} color={theme.text} />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.backButton}
              onPress={isSearchMode ? closeSearchMode : () => navigation.goBack()}
            >
              <Icon name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            {isSearchMode ? (
              <View style={{ flex: 1, marginLeft: SPACING.sm, marginRight: SPACING.xs }}>
                <View style={[styles.searchBar, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                  <Icon name="search" size={20} color={theme.textSecondary} />
                  <TextInput
                    ref={searchInputRef}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search messages"
                    placeholderTextColor={theme.textSecondary}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                    onSubmitEditing={() => jumpToSearchMatch(1)}
                    style={[styles.searchInput, { color: theme.text }]}
                  />
                  {!!searchQuery && (
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => setSearchQuery('')}
                      style={styles.searchClearButton}
                    >
                      <Icon name="close-circle" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.searchMetaRow}>
                  <Text style={[styles.searchStatusText, { color: theme.textSecondary }]}>
                    {!normalizedSearchQuery
                      ? 'Type to search messages'
                      : searchMatches.length
                        ? `${Math.min(activeSearchMatchIndex + 1, searchMatches.length)} of ${searchMatches.length}`
                        : 'No messages found'}
                  </Text>
                  <View style={styles.searchNavRow}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => jumpToSearchMatch(-1)}
                      disabled={!searchMatches.length}
                      style={styles.searchNavButton}
                    >
                      <Icon name="chevron-up" size={18} color={searchMatches.length ? theme.primary : theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => jumpToSearchMatch(1)}
                      disabled={!searchMatches.length}
                      style={styles.searchNavButton}
                    >
                      <Icon name="chevron-down" size={18} color={searchMatches.length ? theme.primary : theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.headerProfileButton}
                activeOpacity={0.75}
                onPress={() =>
                  navigation.navigate('ContactInfo', {
                    chat: {
                      ...chat,
                      phoneNumber: (participant as any)?.phoneNumber || (chat as any)?.phoneNumber,
                      profilePictureUrl: (participant as any)?.profilePictureUrl || (chat as any)?.profilePictureUrl,
                      displayName: (participant as any)?.title || (participant as any)?.displayName || (chat as any)?.displayName || chat.title,
                    },
                  })
                }
              >
                <Avatar source={(chat as any).groupProfilePicture || chat.avatar || (isGroupConversation ? '👥' : (chat.title ? chat.title.charAt(0) : ''))} size="medium" theme={theme} />
                <View style={styles.headerTextBlock}>
                  <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                    {chat.title}
                  </Text>
                  {isGroupConversation && (
                    <Text
                      style={[styles.headerSubtitle, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {groupSubtitle}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}

            {!isSearchMode && (
              <>
                <TouchableOpacity
                  style={styles.headerIconButton}
                  activeOpacity={0.75}
                  onPress={() => handleStartCall('video')}
                >
                  <Icon name="videocam-outline" size={26} color={theme.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.headerIconButton}
                  activeOpacity={0.75}
                  onPress={() => handleStartCall('audio')}
                >
                  <Icon name="call-outline" size={24} color={theme.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.headerIconButton}
                  activeOpacity={0.75}
                  onPress={() => setMenuVisible(true)}
                >
                  <Icon name="ellipsis-vertical" size={22} color={theme.primary} />
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>

      <Modal
        visible={selectionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectionMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setSelectionMenuVisible(false)}>
          <View style={[styles.menuContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            {/* Copy */}
            {selectedMessages.length === 1 && selectedMessages[0].type === 'text' && selectedMessages[0].content ? (
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.75}
                onPress={async () => {
                  try {
                    const text = selectedMessages[0].content;
                    Clipboard.setString(text);
                    if (Platform.OS === 'android') ToastAndroid.show('Message copied to clipboard', ToastAndroid.SHORT);
                    else Alert.alert('Message copied to clipboard');
                    setSelectedMessages([]);
                    setActionMessage(null);
                    setSelectionMenuVisible(false);
                  } catch (e) {
                    console.warn('copy failed', e);
                    Alert.alert('Copy failed', 'Could not copy message');
                    setSelectionMenuVisible(false);
                  }
                }}
              >
                <Text style={[styles.menuText, { color: theme.text }]}>Copy</Text>
              </TouchableOpacity>
            ) : null}

            {/* Cancel Selection */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.75}
              onPress={() => { setSelectedMessages([]); setActionMessage(null); setSelectionMenuVisible(false); }}
            >
              <Text style={[styles.menuText, { color: theme.text }]}>Cancel Selection</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View
            style={[
              styles.menuContainer,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.text,
              },
            ]}
          >
            {menuOptions.map((option, index) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.menuItem,
                  index === menuOptions.length - 1 && styles.menuItemWithArrow,
                ]}
                activeOpacity={0.75}
                onPress={() => setMenuVisible(false)}
              >
                <Text style={[styles.menuText, { color: theme.text }]} numberOfLines={1}>
                  {option}
                </Text>
                {option === 'More' && (
                  <Icon name="chevron-forward" size={20} color={theme.textSecondary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={locationMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationMenuVisible(false)}
      >
        <Pressable
          style={styles.locationBackdrop}
          onPress={() => setLocationMenuVisible(false)}
        >
          <Pressable
            style={[
              styles.locationSheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.locationSheetTitle, { color: theme.text }]}>
              Share location
            </Text>

            <TouchableOpacity
              style={styles.locationAction}
              activeOpacity={0.75}
              onPress={handleCurrentLocationPress}
            >
              <View style={[styles.locationActionIcon, { backgroundColor: theme.inputBackground }]}>
                <Icon name="location" size={22} color={theme.primary} />
              </View>
              <View style={styles.locationActionTextBlock}>
                <Text style={[styles.locationActionTitle, { color: theme.text }]}>
                  Send current location
                </Text>
                <Text style={[styles.locationActionSubtitle, { color: theme.textSecondary }]}>
                  Share your location once
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locationAction}
              activeOpacity={0.75}
              onPress={() => {
                setLocationMenuVisible(false);
                setLiveDurationVisible(true);
              }}
            >
              <View style={[styles.locationActionIcon, { backgroundColor: theme.inputBackground }]}>
                <Icon name="navigate-circle" size={22} color={theme.primary} />
              </View>
              <View style={styles.locationActionTextBlock}>
                <Text style={[styles.locationActionTitle, { color: theme.text }]}>
                  Share live location
                </Text>
                <Text style={[styles.locationActionSubtitle, { color: theme.textSecondary }]}>
                  Updates until the selected time ends
                </Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={liveDurationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLiveDurationVisible(false)}
      >
        <Pressable
          style={styles.locationBackdrop}
          onPress={() => setLiveDurationVisible(false)}
        >
          <Pressable
            style={[
              styles.locationSheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.locationSheetTitle, { color: theme.text }]}>
              Live location duration
            </Text>

            {liveLocationDurations.map((duration) => (
              <TouchableOpacity
                key={duration.label}
                style={styles.durationOption}
                activeOpacity={0.75}
                onPress={() =>
                  handleLiveLocationDurationPress(duration.value, duration.label)
                }
              >
                <Text style={[styles.durationText, { color: theme.text }]}>
                  {duration.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {activeGroupCallVisible && isGroupConversation && (
        <View style={[styles.callBannerContainer, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleJoinActiveGroupCall}
            style={[
              styles.callBannerCard,
              {
                backgroundColor: '#24C25E',
                shadowColor: '#000',
              },
            ]}
          >
            <View style={styles.callBannerAvatars}>
              {activeGroupCallDisplayParticipants.length ? (
                activeGroupCallDisplayParticipants.map((participant: any, index: number) => {
                  const name = participant?.name || participant?.displayName || participant?.title || 'Member';
                  const avatarUri = participant?.avatar || participant?.profilePictureUrl || null;
                  return (
                    <View
                      key={`${normalizeCallParticipantId(participant)}-${index}`}
                      style={[
                        styles.callBannerAvatarOverlap,
                        index > 0 && styles.callBannerAvatarStacked,
                      ]}
                    >
                      {isValidAvatarUri(avatarUri) ? (
                        <Image source={{ uri: avatarUri }} style={styles.callBannerAvatarImage} />
                      ) : (
                        <View style={[styles.callBannerAvatarFallback, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                          <Text style={styles.callBannerAvatarFallbackText}>{getInitialsFromName(name) || '?'}</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              ) : (
                <View style={styles.callBannerAvatarOverlap}>
                  <View style={[styles.callBannerAvatarFallback, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                    <Icon name="people" size={18} color="#FFFFFF" />
                  </View>
                </View>
              )}
            </View>

            <View style={styles.callBannerTextBlock}>
              <Text style={styles.callBannerTitle} numberOfLines={1}>
                Tap to join
              </Text>
              <Text style={styles.callBannerSubtitle} numberOfLines={1}>
                {String(activeGroupCall.callType || 'audio') === 'video' ? 'Video call in progress' : 'Voice call in progress'}
              </Text>
            </View>

            <View style={styles.callBannerJoinPill}>
              <Icon name="call" size={16} color="#0C2B17" />
              <Text style={styles.callBannerJoinText}>Join</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={renderedMessagesWithSeparators}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        inverted
        style={styles.chatList}
        onEndReachedThreshold={0.1}
        ListEmptyComponent={() => (
          <View style={styles.emptyChatState}>
            <Text style={[styles.emptyChatTitle, { color: theme.text }]}> 
              {isChatCleared ? 'Chat cleared' : 'No messages yet'}
            </Text>
            <Text style={[styles.emptyChatSubtitle, { color: theme.textSecondary }]}> 
              {isChatCleared
                ? 'This conversation is empty on your device only.'
                : 'Start the conversation by sending a message.'}
            </Text>
          </View>
        )}
      />

      {actionMessage && (
        <View
          style={[
            styles.reactionTray,
            {
              backgroundColor: theme.surface,
              shadowColor: theme.text,
            },
          ]}
        >
          {quickReactions.map((reaction) => {
            const isActiveReaction = actionMessage.reaction === reaction;
            const isInReactionsArray = Array.isArray(actionMessage.reactions) && actionMessage.reactions.some((r: any) => String(r.userId) === String(currentUserId) && r.reaction === reaction);
            const isActive = isActiveReaction || isInReactionsArray;
            return (
              <TouchableOpacity
                key={reaction}
                activeOpacity={0.75}
                onPress={() => handleReactToActionMessage(reaction)}
                style={[
                  styles.reactionButton,
                  isActive && {
                    borderWidth: 2,
                    borderColor: theme.primary,
                    backgroundColor: `${theme.primary}20`,
                  },
                ]}
              >
                <Text style={styles.reactionEmoji}>{reaction}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={openNativeReactionInput}
            style={[styles.reactionPlusButton, { backgroundColor: theme.border }]}
          >
            <Icon name="add" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      )}

      {nativeReactionInputVisible && (
        <View style={styles.nativeReactionInputWrapper} pointerEvents="none">
          <Text style={styles.nativeReactionInputHint}>Open the emoji keyboard to react</Text>
          <TextInput
            ref={nativeReactionInputRef}
            value={nativeReactionText}
            onChangeText={handleNativeReactionInputChange}
            autoCapitalize="none"
            autoCorrect={false}
            caretHidden
            showSoftInputOnFocus
            keyboardType="default"
            style={styles.nativeReactionInput}
            onBlur={() => {
              setNativeReactionInputVisible(false);
              setNativeReactionText('');
              nativeReactionHandledRef.current = false;
            }}
          />
        </View>
      )}

      <Modal
        visible={forwardModalVisible}
        animationType="slide"
        onRequestClose={closeForwardPicker}
      >
        <SafeAreaView style={[styles.forwardContainer, { backgroundColor: theme.background }]}>
          <View
            style={[
              styles.forwardHeader,
              { backgroundColor: theme.surface, borderBottomColor: theme.border },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={closeForwardPicker}
              style={styles.backButton}
            >
              <Icon name="arrow-back" size={28} color={theme.text} />
            </TouchableOpacity>
            <View style={styles.forwardHeaderTextBlock}>
              <Text style={[styles.forwardHeaderTitle, { color: theme.text }]} numberOfLines={1}>
                Forward to...
              </Text>
              <Text style={[styles.forwardHeaderSubtitle, { color: theme.textSecondary }]}>
                {selectedForwardTargets.length} selected
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={handleForwardNewGroupPress}
              style={styles.forwardHeaderIcon}
            >
              <Icon name="people-outline" size={28} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.75} style={styles.forwardHeaderIcon}>
              <Icon name="search" size={30} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.forwardList}
            contentContainerStyle={styles.forwardListContent}
            keyboardShouldPersistTaps="handled"
          >
            {frequentForwardTargets.length ? (
              <>
                <Text style={[styles.forwardSectionTitle, { color: theme.textSecondary }]}>
                  Frequently contacted
                </Text>
                {frequentForwardTargets.map(renderForwardTargetRow)}
              </>
            ) : null}

            {recentForwardTargets.length ? (
              <>
                <Text style={[styles.forwardSectionTitle, { color: theme.textSecondary }]}>
                  Recent chats
                </Text>
                {recentForwardTargets.map(renderForwardTargetRow)}
              </>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.forwardFooter,
              { backgroundColor: theme.surface, borderTopColor: theme.border },
            ]}
          >
            <TextInput
              value={forwardNote}
              onChangeText={setForwardNote}
              placeholder="Add a message..."
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.forwardNoteInput,
                {
                  backgroundColor: theme.inputBackground,
                  color: theme.text,
                },
              ]}
            />
            <View style={styles.forwardSelectedBar}>
              <Text
                style={[styles.forwardSelectedNames, { color: theme.text }]}
                numberOfLines={1}
              >
                {selectedForwardNames || 'Select chats to forward'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!selectedForwardTargets.length}
                onPress={handleSendForward}
                style={[
                  styles.forwardSendButton,
                  {
                    backgroundColor: selectedForwardTargets.length
                      ? theme.primary
                      : theme.border,
                  },
                ]}
              >
                <Icon name="send" size={28} color={theme.background} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={mediaPreviewVisible}
        animationType="slide"
        onRequestClose={closeMediaPreview}
      >
        <SafeAreaView style={[styles.mediaPreviewContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.mediaPreviewHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={closeMediaPreview}
              style={styles.previewHeaderButton}
            >
              <Icon name="close" size={30} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.previewTitle, { color: theme.text }]}>
              Recents
            </Text>
            <View style={[styles.hdBadge, { borderColor: theme.text }]}>
              <Text style={[styles.hdText, { color: theme.text }]}>HD</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.previewGridContent}>
            {pendingMedia.map((item, index) => (
              <View key={item.id} style={styles.previewTile}>
                {item.type === 'image' ? (
                  <Image source={{ uri: item.uri }} style={styles.previewImage} resizeMode="cover" />
                ) : item.type === 'video' ? (
                  <View style={[styles.previewVideo, { backgroundColor: theme.inputBackground }]}> 
                    <Icon name="play-circle" size={44} color={theme.primary} />
                    <Text style={[styles.previewVideoText, { color: theme.textSecondary }]}>Video</Text>
                  </View>
                ) : (
                  <View style={[styles.previewDocument, { backgroundColor: theme.inputBackground }]}> 
                    <Icon name="document-text" size={36} color={theme.primary} />
                    <Text style={[styles.previewDocumentText, { color: theme.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={[styles.previewDocumentSubText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {item.fileSize ? `${(item.fileSize / (1024 * 1024)).toFixed(1)} MB` : 'Document'}
                    </Text>
                  </View>
                )}

                {item.loading && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => removePendingMedia(item.id)}
                  style={styles.removeMediaButton}
                >
                  <Icon name="close" size={16} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={[styles.selectionBadge, { backgroundColor: theme.primary }]}> 
                  <Text style={styles.selectionBadgeText}>{index + 1}</Text>
                </View>
              </View>
            ))}

            {/* Add tile after the last media */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleAddMoreMedia}
              style={[styles.addPreviewTile, { borderColor: theme.border }]}
            >
              <View style={styles.addTileInner}>
                <Icon name="add" size={28} color={theme.text} />
                <Text style={[styles.addTileText, { color: theme.textSecondary }]}>Add</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          <View style={[styles.captionBar, { backgroundColor: theme.surface }]}>
            <View style={styles.captionThumbWrap}>
              {pendingMedia[0]?.type === 'image' ? (
                <Image source={{ uri: pendingMedia[0].uri }} style={styles.captionThumb} />
              ) : pendingMedia[0]?.type === 'video' ? (
                <View style={[styles.captionThumb, styles.captionVideoThumb]}>
                  <Icon name="play" size={20} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.captionThumb, styles.captionDocumentThumb, { backgroundColor: theme.inputBackground }]}> 
                  <Icon name="document-text" size={24} color={theme.primary} />
                </View>
              )}
              <View style={styles.captionAttachBadge}>
                <Icon name="attach" size={18} color="#FFFFFF" />
              </View>
            </View>

            <TextInput
              value={mediaCaption}
              onChangeText={setMediaCaption}
              placeholder="Add a caption..."
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.captionInput,
                {
                  backgroundColor: theme.inputBackground,
                  color: theme.text,
                },
              ]}
              multiline
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSendMedia}
              disabled={isSendingMedia || !pendingMedia.length}
              style={[
                styles.mediaSendButton,
                { backgroundColor: isSendingMedia ? theme.border : theme.primary },
              ]}
            >
              {isSendingMedia ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <Icon name="send" size={28} color={theme.background} />
              )}
              {pendingMedia.length > 1 && (
                <View style={styles.sendCountBadge}>
                  <Text style={styles.sendCountText}>{pendingMedia.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <FullScreenImageViewer
        visible={!!viewerMessage}
        mediaItems={viewerMediaItems}
        startIndex={viewerStartIndex}
        onRequestClose={() => setViewerMessage(null)}
        message={viewerMessage}
        onForwardPress={(messageOrMessages) => openForwardForMessage(messageOrMessages)}
        onReplyPress={(messageOrMessages) => {
          try {
            const single = Array.isArray(messageOrMessages) ? (messageOrMessages.length ? messageOrMessages[0] : null) : messageOrMessages;
            if (!single) return;
            console.log('[ChatScreen] onReplyPress received messageOrMessages, first id=', single.id, 'replyToMediaItemIndex=', single.replyToMediaItemIndex, 'mediaItemsCount=', single.mediaItems?.length);
            const norm = normalizeServerMessage(single);
            console.log('[ChatScreen] onReplyPress normalized replyMessage id=', norm.id, 'replyToMediaItemIndex=', norm.replyToMediaItemIndex, 'mediaItemsCount=', norm.mediaItems?.length);
            setReplyMessage(norm);
            setSelectedMessages([]);
            setActionMessage(null);
            setViewerMessage(null);
          } catch (e) {}
        }}
        onDeletePress={async (messageOrMessages) => {
          try {
            const items = Array.isArray(messageOrMessages) ? messageOrMessages : (messageOrMessages ? [messageOrMessages] : (viewerMessage ? [viewerMessage] : []));
            if (!items || !items.length) return;

            const partial = messageOrMessages && messageOrMessages.messageId && Array.isArray(messageOrMessages.mediaItemIds) ? messageOrMessages : null;

            // Check if current user is the sender
            let isSender = false;
            if (partial) {
              // Get the message from loadedMessages to check sender
              const msg = loadedMessages.find((m) => String(m.id) === String(partial.messageId));
              isSender = msg && String(msg.senderId) === String(currentUserId);
            } else if (items.length > 0) {
              // Check if current user sent the first message
              isSender = String(items[0].senderId) === String(currentUserId);
            }

            const deleteButtons: any[] = [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete for me', style: 'default', onPress: async () => {
                if (partial) {
                  const messageId = String(partial.messageId);
                  const mediaItemIds = Array.from(new Set((partial.mediaItemIds || []).map((id: string) => String(id))));
                  try {
                    // Filter out deleted items FIRST before calling hideMediaItemsLocally
                    // This ensures loadedMessages is updated before hideMediaItemsLocally triggers setLoadedMessages
                    if (viewerMessage && String(viewerMessage.id) === messageId) {
                      const filteredMediaItems = (viewerMessage.mediaItems || []).filter((item: any) => {
                        const itemId = String(item.id || item.objectKey || item.key || '');
                        return !mediaItemIds.includes(itemId);
                      });
                      
                      // Update loadedMessages FIRST so hideMediaItemsLocally doesn't overwrite it
                      setLoadedMessages((prev) =>
                        prev.map((m) =>
                          String(m.id) === messageId
                            ? { ...m, mediaItems: filteredMediaItems }
                            : m
                        )
                      );
                      
                      if (filteredMediaItems.length === 0) {
                        // No items left, close the viewer after deletion
                        setViewerMessage(null);
                      } else {
                        // Update viewerMessage with filtered items
                        const newViewerMessage = { ...viewerMessage, mediaItems: filteredMediaItems };
                        setViewerMessage(newViewerMessage);
                      }
                    }
                    
                    // Now call hideMediaItemsLocally - it will use the updated loadedMessages
                    hideMediaItemsLocally(messageId, mediaItemIds);
                  } catch (e) {
                    console.warn('local media hide failed', e);
                  }

                  setSelectedMessages([]);
                  setActionMessage(null);
                  return;
                }

                const ids = items.map((m) => String(m.id));
                try {
                  ids.forEach((id) => { try { deleteMessage(id); } catch (e) {} });
                  setLoadedMessages((prev) => prev.filter((m) => !ids.includes(String(m.id))));
                  try { ids.forEach((id) => { deletedForMeIdsRef.current.add(String(id)); setTimeout(() => deletedForMeIdsRef.current.delete(String(id)), 10000); }); } catch (e) {}
                } catch (e) { console.warn('local delete failed', e); }

                try {
                  await messagesApi.deleteMessagesForMeBulk(ids);
                } catch (e) {
                  console.warn('delete for me failed, reverting locally', e);
                  try {
                    const msgs = await messagesApi.getMessages(conversationId);
                    setLoadedMessages(msgs.map(normalizeServerMessage));
                  } catch (err) { console.warn('failed to reload messages after revert', err); }
                }

                setSelectedMessages([]);
                setActionMessage(null);
                setViewerMessage(null);
              } },
            ];

            // Only add "Delete for everyone" option if current user is the sender
            if (isSender) {
              deleteButtons.push(
                { text: 'Delete for everyone', style: 'destructive', onPress: async () => {
                if (partial) {
                  const { messageId, mediaItemIds } = partial;
                  try {
                    const res = await messagesApi.removeMessageMedia(messageId, mediaItemIds);
                    const updated = res && res.message ? res.message : null;
                    if (updated) {
                      const norm = normalizeServerMessage(updated);
                      if (norm.deletedForEveryone) {
                        const text = String(norm.deletedBy) === String(currentUserId) ? 'You deleted this message' : 'This message was deleted';
                        try { updateMessage(String(norm.id), { content: text, type: 'deleted', deletedForEveryone: true, reactions: [], reaction: undefined }); } catch (e) {}
                        setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(norm.id) ? { ...m, content: text, type: 'deleted', deletedForEveryone: true, reactions: [], reaction: undefined } : m)));
                        
                        // Update viewerMessage if it matches
                        if (viewerMessage && String(viewerMessage.id) === messageId) {
                          setViewerMessage(null);
                        }
                      } else {
                        try { updateMessage(String(norm.id), norm); } catch (e) {}
                        setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(norm.id) ? norm : m)));
                        
                        // Update viewerMessage with the normalized message containing the updated mediaItems
                        if (viewerMessage && String(viewerMessage.id) === messageId) {
                          if ((norm.mediaItems && norm.mediaItems.length === 0) || (!norm.mediaItems && !norm.mediaUrl)) {
                            setViewerMessage(null);
                          } else {
                            setViewerMessage(norm as any);
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn('remove media API failed', e);
                    Alert.alert('Delete failed', 'Unable to delete selected images.');
                  }
                } else {
                  const ids = items.map((m) => String(m.id));
                  try {
                    const res = await messagesApi.deleteMessagesForEveryoneBulk(ids);
                    const updatedArr = res && (res.messages || res.messagesUpdated || res.messages || null) ? (res.messages || res.messagesUpdated) : null;
                    if (Array.isArray(updatedArr) && updatedArr.length) {
                      // apply server-updated messages
                      updatedArr.forEach((um) => {
                        try {
                          const norm = normalizeServerMessage(um);
                          if (norm.deletedForEveryone) {
                            const text = String(norm.deletedBy) === String(currentUserId) ? 'You deleted this message' : 'This message was deleted';
                            try { updateMessage(String(norm.id), { content: text, type: 'deleted', deletedForEveryone: true, reactions: [], reaction: undefined }); } catch (e) {}
                            setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(norm.id) ? { ...m, content: text, type: 'deleted', deletedForEveryone: true } : m)));
                          } else {
                            try { updateMessage(String(norm.id), norm); } catch (e) {}
                            setLoadedMessages((prev) => prev.map((m) => (String(m.id) === String(norm.id) ? norm : m)));
                          }
                        } catch (e) {}
                      });
                    } else {
                      // fallback: optimistic placeholder for sender
                      const text = 'You deleted this message';
                      setLoadedMessages((prev) => prev.map((m) => ids.includes(String(m.id)) ? { ...m, content: text, type: 'deleted', deletedForEveryone: true } : m));
                    }
                  } catch (e) {
                    console.warn('delete for everyone failed', e);
                  }
                }

                setSelectedMessages([]);
                setActionMessage(null);
                setViewerMessage(null);
              } }
              );
            }

            Alert.alert('Delete', 'Choose deletion option', deleteButtons);
          } catch (e) {
            console.warn('delete action failed', e);
          }
        }}
        onReactPress={handleReactToViewerMedia}
      />

      <MessageInput
        value={messageText}
        onChangeText={setMessageText}
        onSend={handleSendMessage}
        onEmojiPress={() => {}}
        onAttachmentPress={() => {}}
        onAttachmentOptionSelect={handleAttachmentOption}
        onCameraPress={handleCameraPress}
        theme={theme}
        replyTo={replyMessage}
        onCancelReply={() => setReplyMessage(null)}
        disabled={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatHeader: {
    minHeight: 64,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SPACING.sm,
    paddingRight: SPACING.xs,
  },
  callBannerContainer: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  callBannerCard: {
    minHeight: 56,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  callBannerAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  callBannerAvatarOverlap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  callBannerAvatarStacked: {
    marginLeft: -10,
  },
  callBannerAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  callBannerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBannerAvatarFallbackText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
  },
  callBannerTextBlock: {
    flex: 1,
    minWidth: 0,
    marginRight: SPACING.sm,
  },
  callBannerTitle: {
    color: '#0C2B17',
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  callBannerSubtitle: {
    color: '#0C2B17',
    fontSize: FONT_SIZES.xs,
    marginTop: 1,
    opacity: 0.82,
  },
  callBannerJoinPill: {
    minHeight: 36,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: '#B6FFCA',
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  callBannerJoinText: {
    color: '#0C2B17',
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
  },
  backButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  headerProfileButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.xs,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
    marginLeft: SPACING.md,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  headerIconButton: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    minHeight: 42,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontSize: FONT_SIZES.md,
  },
  searchClearButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchMetaRow: {
    marginTop: SPACING.xs / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchStatusText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    marginRight: SPACING.sm,
  },
  searchNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchNavButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCount: {
    minWidth: 30,
    fontSize: 26,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
  selectionActions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  selectionActionButton: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuContainer: {
    position: 'absolute',
    top: 62,
    right: SPACING.sm,
    width: 280,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  menuItem: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  menuItemWithArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: SPACING.md,
  },
  chatList: {
    flex: 1,
  },
  emptyChatState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
  },
  emptyChatTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  emptyChatSubtitle: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  dateSeparatorWrap: {
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  dateSeparatorContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    minWidth: 88,
    alignItems: 'center',
  },
  dateSeparatorText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  reactionTray: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 92,
    minHeight: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    elevation: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    zIndex: 30,
  },
  reactionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 22,
  },
  reactionPlusButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeReactionInput: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    width: 1,
    height: 1,
    opacity: 0,
  },
  nativeReactionInputWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 150,
    alignItems: 'center',
    zIndex: 40,
  },
  nativeReactionInputHint: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#666',
    marginBottom: SPACING.xs,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  forwardContainer: {
    flex: 1,
  },
  forwardHeader: {
    minHeight: 72,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SPACING.sm,
  },
  forwardHeaderTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  forwardHeaderTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '600',
  },
  forwardHeaderSubtitle: {
    fontSize: FONT_SIZES.base,
    marginTop: 2,
  },
  forwardHeaderIcon: {
    width: 46,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardList: {
    flex: 1,
  },
  forwardListContent: {
    paddingBottom: 132,
  },
  forwardTargetRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  forwardAvatar: {
    marginRight: SPACING.lg,
  },
  forwardTargetTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  forwardTargetTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
  },
  forwardTargetSubtitle: {
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.xs,
  },
  forwardCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.lg,
  },
  forwardSectionTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg,
  },
  forwardFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  forwardNoteInput: {
    minHeight: 56,
    maxHeight: 96,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.xl,
  },
  forwardSelectedBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  forwardSelectedNames: {
    flex: 1,
    minWidth: 0,
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    marginRight: SPACING.lg,
  },
  forwardSendButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  locationSheet: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  locationSheetTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  locationAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  locationActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  locationActionTextBlock: {
    flex: 1,
  },
  locationActionTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  locationActionSubtitle: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
  durationOption: {
    paddingVertical: SPACING.lg,
  },
  durationText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
  mediaPreviewContainer: {
    flex: 1,
  },
  mediaPreviewHeader: {
    minHeight: 72,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  previewHeaderButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '600',
  },
  hdBadge: {
    width: 38,
    height: 30,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hdText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
  },
  previewGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 108,
  },
  previewTile: {
    width: '33.33%',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#0B141A',
    overflow: 'hidden',
  },
  addPreviewTile: {
    width: '33.33%',
    aspectRatio: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTileInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addTileText: {
    fontSize: FONT_SIZES.sm,
    marginTop: 4,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewVideoText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  previewDocument: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  previewDocumentText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewDocumentSubText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  removeMediaButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  selectionBadgeText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.base,
    fontWeight: '800',
  },
  captionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  captionThumbWrap: {
    width: 58,
    height: 58,
    marginRight: SPACING.sm,
  },
  captionThumb: {
    width: 58,
    height: 58,
    borderRadius: BORDER_RADIUS.md,
  },
  captionVideoThumb: {
    backgroundColor: '#263238',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionDocumentThumb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionAttachBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionInput: {
    flex: 1,
    minHeight: 56,
    maxHeight: 96,
    borderRadius: 28,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.xl,
  },
  mediaSendButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
  sendCountBadge: {
    position: 'absolute',
    right: -2,
    top: -2,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  sendCountText: {
    color: '#111B21',
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
  },
  viewerContainer: {
    flex: 1,
  },
  viewerHeader: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SPACING.md,
  },
  viewerScrollContent: {
    paddingBottom: SPACING.xl,
  },
  viewerItem: {
    marginBottom: SPACING.md,
  },
  viewerImage: {
    height: 420,
  },
  viewerVideo: {
    height: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerPlayButton: {
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  viewerPlayText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '800',
  },
});

export default ChatScreen;
