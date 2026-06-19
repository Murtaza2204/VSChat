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
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Asset, launchCamera, launchImageLibrary } from 'react-native-image-picker';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import signaling from '../services/signaling';
import { AGORA_APP_ID, AGORA_CHANNEL, AGORA_TOKEN } from '../config/agora';
import { markConversationNotificationsRead } from '../services/notifications';

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

const ChatScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { chat: routeChat, conversationId: routeConversationId, participant } = route.params || {};
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const currentUserId = user?.id;
  const { chats, addMessage, updateMessage, deleteMessage } = useChatStore();
  const chat = useMemo(
    () =>
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
    [participant, routeChat],
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
  const deletedForMeIdsRef = useRef(new Set<string>());
  const [membersProfiles, setMembersProfiles] = useState<any[] | null>(null);
  const chatMessages = useMemo(() => (conversationId ? loadedMessages : (chat?.messages || [])), [conversationId, loadedMessages, chat]);
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
    const msgs = chatMessages || [];
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
  }, [chatMessages, nowTick]);
  const isGroupConversation = !!chat?.isGroup || (chat?.participants?.length || 0) > 2;
  const groupMemberCount = (chat.participants?.length || 0) + (isGroupConversation ? 1 : 0);
  const groupSubtitle = isGroupConversation
    ? chat.participants?.length
      ? chat.participants.map((participant) => participant.name).join(', ')
      : `${groupMemberCount} members`
    : chat.participants?.length
    ? chat.participants.find((p) => String(p.id) !== String(currentUserId))?.name || ''
    : '';
  const [messageText, setMessageText] = useState('');
  const [replyMessage, setReplyMessage] = useState<Message | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [forwardTargetMessages, setForwardTargetMessages] = useState<Message[]>([]);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [selectedForwardTargets, setSelectedForwardTargets] = useState<string[]>([]);
  const [forwardNote, setForwardNote] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [locationMenuVisible, setLocationMenuVisible] = useState(false);
  const [liveDurationVisible, setLiveDurationVisible] = useState(false);
  const [mediaPreviewVisible, setMediaPreviewVisible] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<MediaItem[]>([]);
  const [mediaCaption, setMediaCaption] = useState('');
  const [viewerMessage, setViewerMessage] = useState<Message | null>(null);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const viewerScrollRef = React.useRef<ScrollView | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const liveLocationWatchRef = useRef<number | null>(null);
  const liveLocationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const type = msg.type || 'text';
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

    return {
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
      forwarded: !!msg.forwarded,
      forwardedFrom: msg.forwardedFrom || null,
      reaction: msg.reaction || (myReactionObj ? myReactionObj.reaction : undefined),
      reactions: reactionsArr,
    };
  };

  const mapAssetToMediaItem = (asset: Asset, index: number): MediaItem | null => {
    if (!asset.uri) {
      return null;
    }

    const type = asset.type?.startsWith('video') ? 'video' : 'image';

    return {
      id: `${Date.now()}-${index}-${asset.fileName || asset.uri}`,
      uri: asset.uri,
      type,
      name: asset.fileName || (type === 'video' ? 'Video' : 'Photo'),
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

  const closeMediaPreview = () => {
    setMediaPreviewVisible(false);
    setPendingMedia([]);
    setMediaCaption('');
  };

  const removePendingMedia = (id: string) => {
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
            socket.emit('message:send', { conversationId, senderId: currentUserId, receiverId, content, type: 'text', clientTempId: tempId, replyToId: optimistic.replyToId });
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
            );
            const finalMsg = { id: sent._id, senderId: sent.senderId, senderName: sent.senderId === currentUserId ? 'You' : sent.senderName || 'Them', content: sent.content, type: sent.type, timestamp: new Date(sent.createdAt), read: false, status: sent.status || 'sent', replyToId: sent.replyToId };
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Listen for socket events to reconcile messages for this conversation when open
  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;
    let activeSocket: any = null;
    let onSent: ((msg: any) => void) | null = null;
    let onReceive: ((msg: any) => void) | null = null;
    let onStatus: ((status: any) => void) | null = null;

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
        // new incoming message: add to loaded messages and update chat store last message
        try {
          const target = useChatStore.getState().chats.find((c) => String(c.conversationId) === String(conversationId) || String(c.id) === String(chat?.id));
          if (target) useChatStore.getState().addMessage(target.id, incoming as any);
        } catch (e) {}
        return [...prev, incoming];
      });
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

        socket.on('message:sent', onSent);
        socket.on('message:receive', onReceive);
        socket.on('message:status', onStatus);
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
      }
    };
  }, [conversationId, currentUserId]);

  const handleStartCall = (callType: 'audio' | 'video') => {
    // send invite to recipient then navigate caller to ActiveCall
    const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    try {
      const calleeId = derivedReceiverId || chat.userId || chat.id;
      const perCallChannel = `call-${callId}`;
      signaling.inviteCall(calleeId, callType, {
        channel: perCallChannel,
        // Do not send hardcoded token; let server generate and attach token/appId
        callId,
      });
      console.log('[ChatScreen] Sent call invite:', { calleeId, callType, callId });
    } catch (e) {
      console.warn('[ChatScreen] inviteCall failed', e);
    }

    navigation.navigate('ActiveCall', {
      callType,
      callerName: chat.title,
      callerAvatar: chat.avatar,
      chatId: chat.id,
      calleeId: derivedReceiverId || chat.id,
      appId: AGORA_APP_ID,
      channel: `call-${callId}`,
      token: undefined,
      callId,
      isCaller: true,
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

  const handleSendMedia = () => {
    if (!pendingMedia.length) {
      return;
    }

    const newMessage: Message = {
      id: Math.random().toString(),
      senderId: currentUserId,
      senderName: user?.name || 'You',
      content: mediaCaption.trim(),
      type:
        pendingMedia.length > 1
          ? 'mediaGroup'
          : pendingMedia[0].type === 'video'
            ? 'video'
            : 'image',
      timestamp: new Date(),
      read: true,
      mediaUrl: pendingMedia[0].uri,
      mediaItems: pendingMedia.map((item) => ({ ...item, loading: false })),
    };

    if (replyMessage) {
      newMessage.replyToId = replyMessage.id;
      setReplyMessage(null);
    }

    if (conversationId) {
      // send media as a message (simple implementation uses content as media url)
      if (!currentUserId) {
        console.warn('Cannot send media: no authenticated user');
      } else {
        messagesApi
          .sendMessage(
            conversationId,
            currentUserId,
            newMessage.mediaUrl || newMessage.content,
            newMessage.type,
            derivedReceiverId,
            newMessage.replyToId,
          )
            .then((sent) =>
            {
              const finalMsg = {
                id: sent._id,
                senderId: sent.senderId,
                senderName:
                  sent.senderId === currentUserId ? 'You' : sent.senderName || 'Them',
                content: sent.content,
                type: sent.type,
                timestamp: new Date(sent.createdAt),
                read: false,
                status: sent.status || 'sent',
                replyToId: sent.replyToId,
              } as any;
              setLoadedMessages((m) => [...m, finalMsg]);
              try {
                const target = useChatStore.getState().chats.find((c) => String(c.conversationId) === String(conversationId) || String(c.id) === String(chat?.id));
                if (target) useChatStore.getState().addMessage(target.id, finalMsg as any);
              } catch (e) {}
            },
          )
          .catch((e) => console.warn('Send media failed', e));
      }
    } else {
      addMessage(chat.id, newMessage);
    }
    closeMediaPreview();

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
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
      flatListRef.current?.scrollToEnd({ animated: true });
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
      flatListRef.current?.scrollToEnd({ animated: true });
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

    openMediaPreview(result.assets);
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
      const [doc] = await pick({ mode: 'open', allowMultiSelection: false });
      if (doc?.uri) {
        addAttachmentMessage(doc.name || 'Document', 'file', doc.uri);
      }
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
        return;
      }

      try {
        const msgs = await messagesApi.getMessages(conversationId);
        setLoadedMessages((msgs || []).map(normalizeServerMessage));
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
        const msgsToSend = forwardTargetMessages.map((m) => ({ content: m.content, type: m.type, forwardedFrom: m.forwardedFrom || { senderName: m.senderName, originalContent: m.content } }));
        // send sequentially to preserve order
        (async () => {
          for (const m of msgsToSend) {
            try {
              const sent = await messagesApi.sendMessage(convId, currentUserId, m.content, m.type, undefined, undefined, true, m.forwardedFrom);
              try {
                const finalMsg = {
                  id: sent._id,
                  senderId: sent.senderId,
                  senderName: sent.senderId === currentUserId ? 'You' : sent.senderName || 'Them',
                  content: sent.content,
                  type: sent.type,
                  timestamp: new Date(sent.createdAt),
                  read: false,
                  status: sent.status || 'sent',
                  forwarded: !!sent.forwarded,
                  forwardedFrom: sent.forwardedFrom || m.forwardedFrom,
                } as any;
                useChatStore.getState().addMessage(targetChatId, finalMsg);
              } catch (e) {}
            } catch (err) { console.warn('Forward persist failed', err); }
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
        await messagesApi.reactMessage(single.id, nextReaction || null);
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

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [chatMessages]);

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
                if (reactedMsg && reactedMsg.content) snippet = reactedMsg.content;
                else if (chatItem && chatItem.messages && chatItem.messages.length) {
                  snippet = chatItem.messages.slice().sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-1)[0].content || '';
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

    const repliedMessage = item.replyToId
      ? chatMessages.find((m) => m.id === item.replyToId)
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

    return (
      <ChatBubble
        message={item.content}
        timestamp={item.timestamp}
        isOwn={item.senderId === currentUserId}
        theme={theme}
        read={item.read}
        status={item.status}
        type={item.type}
        call={item.call}
        mediaUrl={item.mediaUrl}
        mediaItems={item.mediaItems}
        location={item.location}
        onMediaPress={(index?: number) => {
          setViewerMessage(item);
          setViewerStartIndex(index || 0);
        }}
        onForwardPress={() => openForwardForMessage(item)}
        isSelected={selectedMessages.some((m) => String(m.id) === String(item.id))}
        reaction={item.reaction}
        reactions={item.reactions}
        forwarded={item.forwarded}
        showSenderInfo={shouldShowSender}
        isGroupChat={isGroupConversation}
        senderName={resolvedSenderName}
        senderAvatar={
          isValidAvatarUri(item.senderAvatar)
            ? item.senderAvatar
            : isValidAvatarUri(profileAvatar)
              ? profileAvatar
              : item.senderId === currentUserId && isValidAvatarUri(user?.avatar)
                ? user?.avatar
                : undefined
        }
        onLongPress={() => handleLongPressMessage(item)}
        onPress={() => handleToggleSelectMessage(item)}
        replyTo={repliedMessage}
        onReplyPress={() => {
          if (repliedMessage) {
            const messageIndex = chatMessages.findIndex((m) => m.id === repliedMessage.id);
            if (messageIndex !== -1) {
              // compute index in messagesWithSeparators (accounts for inserted date separators)
              const targetIndex = messagesWithSeparators.findIndex((it) => !it.__dateSeparator && String(it.id) === String(repliedMessage.id));
              const scrollIndex = targetIndex !== -1 ? targetIndex : messageIndex;
              flatListRef.current?.scrollToIndex({
                index: scrollIndex,
                animated: true,
                viewPosition: 0.5,
              });
              // Highlight the original message
              setActionMessage(repliedMessage);
              setTimeout(() => setActionMessage(null), 1500);
            }
          }
        }}
      />
    );
  };

  const viewerMediaItems =
    viewerMessage?.mediaItems ||
    (viewerMessage?.mediaUrl &&
    (viewerMessage.type === 'image' || viewerMessage.type === 'video')
      ? [
          {
            id: viewerMessage.mediaUrl,
            uri: viewerMessage.mediaUrl,
            type: viewerMessage.type,
            name: viewerMessage.content,
          } as MediaItem,
        ]
      : []);

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
          source={targetChat.avatar}
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
                <Icon name="ellipsis-vertical" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>

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
              <Avatar source={chat.avatar || (chat.title ? chat.title.charAt(0) : '')} size="medium" theme={theme} />
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
      </View>

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

      <FlatList
        ref={flatListRef}
        data={messagesWithSeparators}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onEndReachedThreshold={0.1}
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
          {quickReactions.map((reaction) => (
            <TouchableOpacity
              key={reaction}
              activeOpacity={0.75}
              onPress={() => handleReactToActionMessage(reaction)}
              style={[
                styles.reactionButton,
                actionMessage.reaction === reaction && {
                  backgroundColor: theme.inputBackground,
                },
              ]}
            >
              <Text style={styles.reactionEmoji}>{reaction}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => handleReactToActionMessage('👍')}
            style={[styles.reactionPlusButton, { backgroundColor: theme.border }]}
          >
            <Icon name="add" size={22} color={theme.text} />
          </TouchableOpacity>
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
                ) : (
                  <View style={[styles.previewVideo, { backgroundColor: theme.inputBackground }]}>
                    <Icon name="play-circle" size={44} color={theme.primary} />
                    <Text style={[styles.previewVideoText, { color: theme.textSecondary }]}>
                      Video
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
          </ScrollView>

          <View style={[styles.captionBar, { backgroundColor: theme.surface }]}>
            <View style={styles.captionThumbWrap}>
              {pendingMedia[0]?.type === 'image' ? (
                <Image source={{ uri: pendingMedia[0].uri }} style={styles.captionThumb} />
              ) : (
                <View style={[styles.captionThumb, styles.captionVideoThumb]}>
                  <Icon name="play" size={20} color="#FFFFFF" />
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
              style={[styles.mediaSendButton, { backgroundColor: theme.primary }]}
            >
              <Icon name="send" size={28} color={theme.background} />
              {pendingMedia.length > 1 && (
                <View style={styles.sendCountBadge}>
                  <Text style={styles.sendCountText}>{pendingMedia.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={!!viewerMessage}
        animationType="slide"
        onRequestClose={() => setViewerMessage(null)}
      >
        <SafeAreaView style={[styles.viewerContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.viewerHeader, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setViewerMessage(null)}
              style={styles.backButton}
            >
              <Icon name="arrow-back" size={26} color={theme.text} />
            </TouchableOpacity>
            <View style={styles.headerTextBlock}>
              <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                {viewerMessage?.senderName || 'You'}
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                {viewerMediaItems.length} {viewerMediaItems.length === 1 ? 'item' : 'items'}
              </Text>
            </View>
          </View>

          <ScrollView ref={viewerScrollRef} contentContainerStyle={styles.viewerScrollContent} onLayout={() => {
            // scroll to selected start index
            setTimeout(() => {
              if (!viewerScrollRef.current) return;
              const y = viewerStartIndex * (440); // approximate item height (viewerImage 420 + margin)
              viewerScrollRef.current.scrollTo({ y, animated: false });
            }, 50);
          }}>
            {viewerMediaItems.map((item) => (
              <View key={item.id} style={styles.viewerItem}>
                {item.type === 'image' ? (
                  <Image
                    source={{ uri: item.uri }}
                    style={[styles.viewerImage, { width: screenWidth }]}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.viewerVideo,
                      {
                        width: screenWidth,
                        backgroundColor: theme.inputBackground,
                      },
                    ]}
                  >
                    <Icon name="play-circle" size={72} color={theme.primary} />
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => Linking.openURL(item.uri)}
                      style={[styles.viewerPlayButton, { backgroundColor: theme.primary }]}
                    >
                      <Icon name="play" size={18} color={theme.background} />
                      <Text style={[styles.viewerPlayText, { color: theme.background }]}>
                        Play video
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

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
    justifyContent: 'flex-end',
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
