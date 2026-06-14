import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { BORDER_RADIUS, FONT_SIZES, SHADOWS, SPACING } from '../constants/colors';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import signaling from '../services/signaling';
import { muteLocalAudio, setSpeakerphone } from '../services/agoraService';
import { Message } from '../types';

type CallStatus = NonNullable<Message['call']>['status'];

const ReceiverCallScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { addMessage } = useChatStore();
  const { width } = useWindowDimensions();
  const callerName = route.params?.callerName || 'Murtaza';
  const callerPhone = route.params?.callerPhone || '+91 97631 51372';
  const callType = route.params?.callType || 'audio';
  const chatId = route.params?.chatId;
  const [accepted, setAccepted] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [isMuted, setIsMuted] = React.useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = React.useState(false);
  const [isVideoOn, setIsVideoOn] = React.useState(callType === 'video');
  const acceptedAtRef = React.useRef<number | null>(null);
  const didLogCallRef = React.useRef(false);

  React.useEffect(() => {
    if (!accepted) {
      return undefined;
    }

    acceptedAtRef.current = Date.now();
    const timer = setInterval(() => {
      if (!acceptedAtRef.current) {
        return;
      }
      setElapsedSeconds(Math.floor((Date.now() - acceptedAtRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [accepted]);

  const initials = callerName
    .split(' ')
    .filter(Boolean)
    .map((part: string) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const avatarSize = Math.min(width * 0.5, accepted ? 188 : 210);

  const logIncomingCall = (status: CallStatus, durationSeconds?: number) => {
    if (!chatId || didLogCallRef.current) {
      return;
    }

    didLogCallRef.current = true;
    addMessage(chatId, {
      id: Math.random().toString(),
      senderId: route.params?.callerId || 'caller',
      senderName: callerName,
      content: callType === 'video' ? 'Video call' : 'Voice call',
      type: 'call',
      timestamp: new Date(),
      read: true,
      call: {
        type: callType === 'video' ? 'video' : 'voice',
        status,
        durationSeconds,
        direction: 'incoming',
      },
    });
  };

  const handleReject = () => {
    try {
      const callerId = route.params?.fromUser?.id || route.params?.callerId;
      const currentUser = useAuthStore.getState().user;
      const callId = route.params?.callId;
      if (callerId && currentUser?.id) {
        signaling.respondToCall(callerId, currentUser.id, 'decline', callId);
        console.log('[ReceiverCallScreen] Sent decline response to:', callerId);
      }
    } catch (e) {
      console.warn('[ReceiverCallScreen] Failed to send decline response:', e);
    }
    logIncomingCall('missed');
    navigation.goBack();
  };

  const handleAccept = async () => {
    setAccepted(true);
    // Send acceptance response to caller
    try {
      // ensure local audio is unmuted and speaker is on before joining
      try { setSpeakerphone(true); } catch (e) {}
      try { await muteLocalAudio(false); } catch (e) {}
      const callerId = route.params?.fromUser?.id || route.params?.callerId;
      const currentUser = useAuthStore.getState().user;
      const callId = route.params?.callId;
      if (callerId && currentUser?.id) {
        signaling.respondToCall(callerId, currentUser.id, 'accept', callId);
        console.log('[ReceiverCallScreen] Sent accept response to:', callerId);
      }
    } catch (e) {
      console.warn('[ReceiverCallScreen] Failed to send accept response:', e);
    }

    // Navigate to active call screen and pass Agora params if provided
    const callTypeParam = route.params?.callType || callType;
    const appId = route.params?.appId;
    const channel = route.params?.channel;
    const token = route.params?.token;

    navigation.navigate('ActiveCall', {
      callType: callTypeParam,
      callerName,
      callerAvatar: route.params?.callerAvatar,
      chatId,
      appId,
      channel,
      token,
      isReceiver: true,
    });
  };

  const handleEnd = () => {
    try {
      const currentUser = useAuthStore.getState().user;
      const callId = route.params?.callId;
      const socket = signaling.getSocket();
      if (socket && socket.connected && callId && currentUser?.id) {
        socket.emit('call:ended', { callId, userId: currentUser.id, reason: 'hangup' });
      }
    } catch (e) {}
    logIncomingCall('completed', Math.max(1, elapsedSeconds));
    // ensure we reset Calls stack to CallsList then return to Chats to avoid IncomingCall lingering
    try {
      const { navigate } = require('../navigation/NavigationService');
      // briefly visit CallsList to set Calls stack, then return to Chats
      navigate('Main', { screen: 'Calls', params: { screen: 'CallsList' } });
      setTimeout(() => {
        try { navigate('Main', { screen: 'Chats', params: { screen: 'ChatList' } }); } catch (e) { navigation.goBack(); }
      }, 200);
    } catch (e) {
      navigation.goBack();
    }
  };

  if (callType === 'video') {
    return (
      <SafeAreaView style={styles.videoSafeArea}>
        <View style={styles.videoContainer}>
          <ReceiverVideoSurface theme={theme} />

          {accepted ? (
            <AcceptedHeaderOverlay
              callerName={callerName}
              duration={formatDuration(elapsedSeconds)}
              theme={theme}
              onCollapse={() => navigation.goBack()}
            />
          ) : (
            <View style={styles.videoIncomingHeader}>
              <Text style={styles.videoIncomingName} numberOfLines={1}>
                {callerName}
              </Text>
              <View style={styles.videoPhoneRow}>
                <Icon name="logo-whatsapp" size={16} color="rgba(255, 255, 255, 0.82)" />
                <Text style={styles.videoPhoneText} numberOfLines={1}>
                  {callerPhone}
                </Text>
              </View>
              <View style={[styles.videoAvatar, { backgroundColor: theme.messageBlue }]}>
                <Text style={[styles.videoAvatarText, { color: theme.primary }]}>
                  {initials || '?'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsVideoOn(false)}
                style={styles.turnOffVideoButton}
              >
                <Icon name="videocam-off-outline" size={20} color="#FFFFFF" />
                <Text style={styles.turnOffVideoText}>Turn off your video</Text>
              </TouchableOpacity>
            </View>
          )}

          {accepted ? (
            <View style={[styles.videoPreview, { backgroundColor: theme.surface }]}>
              <ReceiverVideoSurface theme={theme} compact />
            </View>
          ) : null}

          {accepted ? (
            <View
              style={[
                styles.videoAcceptedTray,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                SHADOWS.md,
              ]}
            >
              <AcceptedControl icon="ellipsis-horizontal" theme={theme} />
              <AcceptedControl
                icon={isVideoOn ? 'videocam' : 'videocam-off'}
                active={isVideoOn}
                muted={!isVideoOn}
                theme={theme}
                onPress={() => setIsVideoOn(!isVideoOn)}
              />
              <AcceptedControl
                icon={isSpeakerOn ? 'volume-high' : 'volume-medium'}
                active={isSpeakerOn}
                theme={theme}
                onPress={() => setIsSpeakerOn(!isSpeakerOn)}
              />
              <AcceptedControl
                icon={isMuted ? 'mic-off' : 'mic-off-outline'}
                active={isMuted}
                theme={theme}
                onPress={() => setIsMuted(!isMuted)}
              />
              <AcceptedControl icon="call" danger theme={theme} onPress={handleEnd} />
            </View>
          ) : (
            <View style={styles.videoIncomingActions}>
              <IncomingAction
                icon="call"
                label="Decline"
                backgroundColor={theme.error}
                iconColor={theme.background}
                theme={theme}
                onPress={handleReject}
              />
              <IncomingAction
                icon="videocam"
                label="Accept"
                backgroundColor={theme.success}
                iconColor={theme.background}
                theme={theme}
                onPress={handleAccept}
              />
              <IncomingAction
                icon="chatbox"
                label="Message"
                backgroundColor={theme.surface}
                iconColor={theme.text}
                theme={theme}
                onPress={() => navigation.goBack()}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {accepted ? (
          <AcceptedHeader
            callerName={callerName}
            theme={theme}
            onCollapse={() => navigation.goBack()}
          />
        ) : (
          <IncomingHeader
            callerName={callerName}
            callerPhone={callerPhone}
            theme={theme}
          />
        )}

        <View style={[styles.avatarSection, accepted && styles.acceptedAvatarSection]}>
          <View
            style={[
              styles.avatar,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: theme.messageBlue,
              },
            ]}
          >
            <Text
              style={[
                styles.avatarInitial,
                { color: theme.primary, fontSize: avatarSize * 0.46 },
              ]}
            >
              {initials || '?'}
            </Text>
          </View>
        </View>

        {accepted ? (
          <View
            style={[
              styles.acceptedTray,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              SHADOWS.md,
            ]}
          >
            <AcceptedControl icon="ellipsis-horizontal" theme={theme} />
            <AcceptedControl
              icon={isVideoOn ? 'videocam' : 'videocam-off'}
              active={isVideoOn}
              muted={!isVideoOn}
              theme={theme}
              onPress={() => setIsVideoOn(!isVideoOn)}
            />
            <AcceptedControl
              icon={isSpeakerOn ? 'volume-high' : 'volume-medium'}
              active={isSpeakerOn}
              theme={theme}
              onPress={() => setIsSpeakerOn(!isSpeakerOn)}
            />
            <AcceptedControl
              icon={isMuted ? 'mic-off' : 'mic-off-outline'}
              active={isMuted}
              theme={theme}
              onPress={() => setIsMuted(!isMuted)}
            />
            <AcceptedControl icon="call" danger theme={theme} onPress={handleEnd} />
          </View>
        ) : (
          <View style={styles.incomingActions}>
            <IncomingAction
              icon="call"
              label="Decline"
              backgroundColor={theme.error}
              iconColor={theme.background}
              theme={theme}
              onPress={handleReject}
            />
            <IncomingAction
              icon="call"
              label="Accept"
              backgroundColor={theme.success}
              iconColor={theme.background}
              theme={theme}
              onPress={handleAccept}
            />
            <IncomingAction
              icon="chatbox"
              label="Message"
              backgroundColor={theme.surface}
              iconColor={theme.text}
              theme={theme}
              onPress={() => navigation.goBack()}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const IncomingHeader = ({
  callerName,
  callerPhone,
  theme,
}: {
  callerName: string;
  callerPhone: string;
  theme: any;
}) => (
  <View style={styles.incomingHeader}>
    <Text style={[styles.incomingName, { color: theme.text }]} numberOfLines={1}>
      {callerName}
    </Text>
    <View style={styles.phoneRow}>
      <Icon name="logo-whatsapp" size={17} color={theme.textSecondary} />
      <Text style={[styles.phoneText, { color: theme.textSecondary }]} numberOfLines={1}>
        {callerPhone}
      </Text>
    </View>
  </View>
);

const AcceptedHeader = ({
  callerName,
  theme,
  onCollapse,
}: {
  callerName: string;
  theme: any;
  onCollapse: () => void;
}) => (
  <View style={styles.acceptedHeader}>
    <HeaderButton icon="contract-outline" theme={theme} onPress={onCollapse} />
    <View style={styles.acceptedTitleBlock}>
      <Text style={[styles.acceptedName, { color: theme.text }]} numberOfLines={1}>
        {callerName}
      </Text>
      <View style={styles.encryptionRow}>
        <Icon name="lock-closed-outline" size={14} color={theme.textSecondary} />
        <Text style={[styles.encryptionText, { color: theme.textSecondary }]} numberOfLines={1}>
          End-to-end encrypted
        </Text>
      </View>
    </View>
    <HeaderButton icon="person-add" theme={theme} />
  </View>
);

const HeaderButton = ({
  icon,
  theme,
  onPress,
}: {
  icon: string;
  theme: any;
  onPress?: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={0.78}
    onPress={onPress}
    style={[styles.headerButton, { backgroundColor: theme.surface }]}
  >
    <Icon name={icon} size={24} color={theme.text} />
  </TouchableOpacity>
);

const IncomingAction = ({
  icon,
  label,
  backgroundColor,
  iconColor,
  theme,
  onPress,
}: {
  icon: string;
  label: string;
  backgroundColor: string;
  iconColor: string;
  theme: any;
  onPress: () => void;
}) => (
  <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.incomingAction}>
    <View style={[styles.incomingActionCircle, { backgroundColor }]}>
      <Icon name={icon} size={24} color={iconColor} />
    </View>
    <Text style={[styles.incomingActionLabel, { color: theme.textSecondary }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const AcceptedControl = ({
  icon,
  active,
  danger,
  muted,
  theme,
  onPress,
}: {
  icon: string;
  active?: boolean;
  danger?: boolean;
  muted?: boolean;
  theme: any;
  onPress?: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={0.78}
    onPress={onPress}
    style={[
      styles.acceptedControl,
      {
        backgroundColor: danger
          ? theme.error
          : active
            ? theme.primary
            : theme.inputBackground,
      },
    ]}
  >
    <Icon
      name={icon}
      size={danger ? 23 : 21}
      color={danger || active ? theme.background : muted ? theme.textSecondary : theme.text}
    />
  </TouchableOpacity>
);

const AcceptedHeaderOverlay = ({
  callerName,
  duration,
  theme,
  onCollapse,
}: {
  callerName: string;
  duration: string;
  theme: any;
  onCollapse: () => void;
}) => (
  <View style={styles.videoAcceptedHeader}>
    <HeaderButton icon="contract-outline" theme={theme} onPress={onCollapse} />
    <View style={styles.videoAcceptedTitle}>
      <Text style={styles.videoAcceptedName} numberOfLines={1}>
        {callerName}
      </Text>
      <Text style={styles.videoDuration}>{duration}</Text>
    </View>
    <HeaderButton icon="person-add" theme={theme} />
  </View>
);

const ReceiverVideoSurface = ({
  theme,
  compact,
}: {
  theme: any;
  compact?: boolean;
}) => (
  <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.inputBackground }]}>
    <View
      style={[
        styles.receiverVideoShapeLarge,
        { backgroundColor: theme.messageBlue },
        compact && styles.receiverCompactShapeLarge,
      ]}
    />
    <View
      style={[
        styles.receiverVideoShapeSmall,
        { backgroundColor: theme.messageGreen },
        compact && styles.receiverCompactShapeSmall,
      ]}
    />
    <View style={[styles.receiverVideoScrim, compact && styles.receiverCompactScrim]} />
  </View>
);

const formatDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `0:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  incomingHeader: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.lg,
  },
  incomingName: {
    fontSize: FONT_SIZES.giant,
    fontWeight: '700',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  phoneText: {
    fontSize: FONT_SIZES.xl,
    marginLeft: SPACING.xs,
  },
  acceptedHeader: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  headerButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptedTitleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  acceptedName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  encryptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  encryptionText: {
    fontSize: FONT_SIZES.base,
    marginLeft: SPACING.xs,
  },
  avatarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 128,
  },
  acceptedAvatarSection: {
    paddingBottom: 110,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontWeight: '500',
  },
  incomingActions: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.xxl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  incomingAction: {
    width: 92,
    alignItems: 'center',
  },
  incomingActionCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingActionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  acceptedTray: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.xxl,
    minHeight: 82,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  acceptedControl: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoSafeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  receiverVideoShapeLarge: {
    position: 'absolute',
    top: -80,
    right: -100,
    width: 260,
    height: 360,
    borderRadius: 130,
    opacity: 0.54,
    transform: [{ rotate: '18deg' }],
  },
  receiverVideoShapeSmall: {
    position: 'absolute',
    left: -80,
    bottom: 120,
    width: 240,
    height: 320,
    borderRadius: 120,
    opacity: 0.42,
    transform: [{ rotate: '-24deg' }],
  },
  receiverVideoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
  },
  receiverCompactShapeLarge: {
    width: 110,
    height: 140,
    top: -22,
    right: -28,
  },
  receiverCompactShapeSmall: {
    width: 100,
    height: 130,
    left: -24,
    bottom: -14,
  },
  receiverCompactScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  videoIncomingHeader: {
    position: 'absolute',
    top: 106,
    left: SPACING.lg,
    right: SPACING.lg,
    alignItems: 'center',
  },
  videoIncomingName: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.giant,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowRadius: 4,
  },
  videoPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  videoPhoneText: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: FONT_SIZES.xl,
    marginLeft: SPACING.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowRadius: 4,
  },
  videoAvatar: {
    width: 106,
    height: 106,
    borderRadius: 53,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xxl,
  },
  videoAvatarText: {
    fontSize: 52,
    fontWeight: '500',
  },
  turnOffVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  turnOffVideoText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
    marginLeft: SPACING.sm,
  },
  videoIncomingActions: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.xxl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  videoAcceptedHeader: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  videoAcceptedTitle: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  videoAcceptedName: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowRadius: 4,
  },
  videoDuration: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: FONT_SIZES.lg,
    marginTop: SPACING.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowRadius: 4,
  },
  videoPreview: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: 132,
    width: 128,
    height: 178,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.34)',
  },
  videoAcceptedTray: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.xxl,
    minHeight: 82,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
});

export default ReceiverCallScreen;
