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
import { RtcSurfaceView } from 'react-native-agora';
import { ensureAudioVideoPermissions } from '../services/permissions';
import { switchCamera, muteLocalVideo, muteLocalAudio, setSpeakerphone } from '../services/agoraService';
import { BORDER_RADIUS, FONT_SIZES, SHADOWS, SPACING } from '../constants/colors';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { Message } from '../types';

const ActiveCallScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { addMessage } = useChatStore();
  const { width } = useWindowDimensions();
  const callType = route.params?.callType || 'audio';
  const callerName = route.params?.callerName || 'Ammi';
  const appIdParam = route.params?.appId;
  const channelParam = route.params?.channel;
  const tokenParam = route.params?.token;
  const chatId = route.params?.chatId;
  const [isMuted, setIsMuted] = React.useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = React.useState(false);
  const [isVideoOn, setIsVideoOn] = React.useState(callType === 'video');
  const [remoteUid, setRemoteUid] = React.useState<number | null>(null);
  const [engineReady, setEngineReady] = React.useState(false);
  const [joined, setJoined] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const startedAtRef = React.useRef<number | null>(null);
  const didLogCallRef = React.useRef(false);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!startedAtRef.current) return;
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);

    // Initialize Agora and join channel for real audio/video
    let mounted = true;
    const setupAgora = async () => {
      const ok = await ensureAudioVideoPermissions();
      if (!ok) return;

      try {
        const { default: agoraService } = await import('../services/agoraService');
        const { initAgora, joinChannel, setRemoteUidListener } = agoraService;
        const appId = appIdParam || (await import('../config/agora')).AGORA_APP_ID;
        const channel = channelParam || (await import('../config/agora')).AGORA_CHANNEL;
        const token = tokenParam || (await import('../config/agora')).AGORA_TOKEN;

        console.log('🎥 Setup Agora with:', { appId: appId.slice(0, 16) + '...', channel, token: token?.slice(0, 20) + '...' });

        try {
          await initAgora(appId);
          setEngineReady(true);
        } catch (initError) {
          console.error('⚠️ Agora initialization failed, UI will still work:', initError);
          setEngineReady(false);
          return; // don't try to join if init failed
        }

        // small delay for engine stability
        await new Promise((r) => setTimeout(r, 800));

        // ensure local video state matches UI toggle
        try { if (isVideoOn) await muteLocalVideo(false); } catch (e) {}

        setRemoteUidListener((uid: number | null) => {
          if (!mounted) return;
          console.log('📡 Remote UID listener triggered:', uid);
          setRemoteUid(uid ?? null);
        });

        const signaling = require('../services/signaling');
        const isCaller = !!route.params?.isCaller;

        if (isCaller && !tokenParam) {
          console.log('[ActiveCall] Caller without token — waiting for call:created from server');
          const handleCallCreated = async (payload: any) => {
            if (!mounted) return;
            if (payload.callId && route.params?.callId && String(payload.callId) !== String(route.params.callId)) return;
            const pChannel = payload.channel || channel;
            const pToken = payload.token || null;
            try {
              console.log('🔄 Calling joinChannel with server token...');
              await joinChannel(pToken, pChannel, 0, (uid: number) => {
                if (!mounted) return; setRemoteUid(uid);
              }, (uid: number) => { if (!mounted) return; setRemoteUid(null); }, async (channelName: string, uid: number) => {
                if (!mounted) return;
                console.log('✓✓✓ Successfully joined channel:', channelName, 'local uid:', uid);
                setJoined(true);
                if (!startedAtRef.current) startedAtRef.current = Date.now();
                try { await setSpeakerphone(true); setIsSpeakerOn(true); } catch (e) {}
                try { await muteLocalAudio(false); setIsMuted(false); } catch (e) {}
              });
            } catch (joinError) {
              console.error('⚠️ Join channel failed (server-token):', joinError);
            }
          };

          signaling.onCallCreated(handleCallCreated);
          try {
            const cached = signaling.getLastCallCreated(route.params?.callId);
            if (cached) { console.log('[ActiveCall] Found cached call:created, handling immediately'); handleCallCreated(cached); }
          } catch (e) {}
        } else {
          console.log('🔄 Calling joinChannel...');
          try {
            await joinChannel(token, channel, 0, (uid: number) => { if (!mounted) return; setRemoteUid(uid); }, (uid: number) => { if (!mounted) return; setRemoteUid(null); }, async (channelName: string, uid: number) => {
              if (!mounted) return;
              console.log('✓✓✓ Successfully joined channel:', channelName, 'local uid:', uid);
              setJoined(true);
              if (!startedAtRef.current) startedAtRef.current = Date.now();
              try { await setSpeakerphone(true); setIsSpeakerOn(true); } catch (e) {}
              try { await muteLocalAudio(false); setIsMuted(false); } catch (e) {}
            });
          } catch (joinError) {
            console.error('⚠️ Join channel failed:', joinError);
          }
        }

      } catch (e) {
        console.error('❌ Agora setup error:', e);
        console.error('Error stack:', e instanceof Error ? e.stack : 'unknown');
      }
    };

    if (callType === 'video' || callType === 'audio') {
      setupAgora();
    }

    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    return () => {
      // leave agora on unmount
      import('../services/agoraService').then((s) => s.leaveChannel()).catch(() => {});
    };
  }, []);

  // Listen for remote end events and leave channel + navigate back
  React.useEffect(() => {
    try {
      const signaling = require('../services/signaling');
      const handler = async (payload: any) => {
        console.log('[ActiveCall] Received remote call:ended', payload);
        try { const { leaveChannel } = await import('../services/agoraService'); await leaveChannel(); } catch (e) {}
        try {
          const { navigate } = require('../navigation/NavigationService');
          navigate('Main', { screen: 'Chats', params: { screen: 'ChatList' } });
        } catch (e) {
          navigation.goBack();
        }
      };
      signaling.onCallEnded(handler);
      return () => {};
    } catch (e) {
      return () => {};
    }
  }, []);

  const initials = getInitials(callerName);
  const accepted = callType === 'video' && elapsedSeconds >= 4;
  const avatarSize = Math.min(width * 0.54, 220);
  const callStatus = elapsedSeconds < 4 ? 'Ringing...' : formatDuration(elapsedSeconds);

  const handleEndCall = async () => {
    if (chatId && !didLogCallRef.current) {
      didLogCallRef.current = true;
      const durationSeconds = Math.max(1, elapsedSeconds);
      const callMessage: Message = {
        id: Math.random().toString(),
        senderId: 'me',
        senderName: 'You',
        content: callType === 'video' ? 'Video call' : 'Voice call',
        type: 'call',
        timestamp: new Date(),
        read: true,
        call: {
          type: callType === 'video' ? 'video' : 'voice',
          status: durationSeconds < 4 ? 'noAnswer' : 'completed',
          durationSeconds,
          direction: 'outgoing',
        },
      };

      addMessage(chatId, callMessage);
    }

    try {
      const socket = require('../services/signaling').getSocket();
      const currentUser = require('../stores/authStore').useAuthStore.getState().user;
      const callId = route.params?.callId;
      // stop audio/video locally first
      try { const { leaveChannel } = await import('../services/agoraService'); await leaveChannel(); } catch (e) {}
      if (socket && socket.connected && callId && currentUser?.id) {
        socket.emit('call:ended', { callId, userId: currentUser.id, reason: 'hangup' });
      }
    } catch (e) {}

    // Reset Calls stack: visit CallsList then return to Chats to avoid lingering IncomingCall
    try {
      const { navigate } = require('../navigation/NavigationService');
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
          {/* Debug overlay */}
          <View style={styles.debugBox} pointerEvents="none">
            <Text style={styles.debugText}>engine:{engineReady ? 'ok' : 'no'}</Text>
            <Text style={styles.debugText}>joined:{joined ? 'yes' : 'no'}</Text>
            <Text style={styles.debugText}>remote:{remoteUid ?? '-'} </Text>
          </View>

          {/* BEFORE ACCEPTED (Ringing): Show local selfie camera full screen */}
          {!accepted ? (
            <>
              {/* Main video: Local camera (full screen) - caller's selfie */}
              {RtcSurfaceView ? (
                <RtcSurfaceView canvas={{ uid: 0 }} style={StyleSheet.absoluteFill} />
              ) : (
                <VideoSurface theme={theme} variant="local" />
              )}
            </>
          ) : (
            <>
              {/* AFTER ACCEPTED: Main video - Remote participant (full screen) */}
              {RtcSurfaceView && remoteUid ? (
                <RtcSurfaceView canvas={{ uid: remoteUid }} style={StyleSheet.absoluteFill} />
              ) : (
                <VideoSurface theme={theme} variant="remote" />
              )}

              {/* Small PiP: Local preview (bottom-right) - shown after call accepted */}
              <View style={[styles.localPreviewPiP, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {RtcSurfaceView ? (
                  <RtcSurfaceView canvas={{ uid: 0 }} style={StyleSheet.absoluteFill} zOrderMediaOverlay={true} />
                ) : (
                  <VideoSurface theme={theme} variant="local" compact />
                )}
                {/* Camera switch button on local preview */}
                <TouchableOpacity
                  style={[styles.pipCameraButton, { backgroundColor: theme.surface }]}
                  onPress={() => switchCamera()}
                  activeOpacity={0.7}
                >
                  <Icon name="camera-reverse" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.videoHeader}>
            <CircleIcon
              icon="contract-outline"
              theme={theme}
              onPress={() => navigation.goBack()}
            />
            <View style={styles.videoTitleBlock}>
              <Text style={styles.videoName} numberOfLines={1}>
                {callerName}
              </Text>
              <Text style={styles.videoStatus}>{accepted ? formatDuration(elapsedSeconds) : 'Ringing...'}</Text>
            </View>
            <CircleIcon icon="person-add" theme={theme} />
          </View>

        <View style={styles.videoSideActions}>
          <CircleIcon icon="person-add" theme={theme} />
          {!accepted && <CircleIcon icon="camera-reverse" theme={theme} onPress={() => switchCamera()} />}
          <CircleIcon icon="color-wand" theme={theme} />
        </View>

          <VideoControlTray theme={theme}>
            <TrayButton icon="ellipsis-horizontal" theme={theme} />
            <TrayButton
              icon={isVideoOn ? 'videocam' : 'videocam-off'}
              active={isVideoOn}
              muted={!isVideoOn}
              theme={theme}
              onPress={async () => {
                const next = !isVideoOn;
                setIsVideoOn(next);
                try {
                  await muteLocalVideo(!next);
                } catch (e) {}
              }}
            />
            <TrayButton
              icon={isSpeakerOn ? 'volume-high' : 'volume-medium'}
              active={isSpeakerOn}
              theme={theme}
              onPress={async () => {
                const next = !isSpeakerOn;
                try { await setSpeakerphone(next); setIsSpeakerOn(next); } catch (e) { setIsSpeakerOn(next); }
              }}
            />
            <TrayButton
              icon={isMuted ? 'mic-off' : 'mic-off-outline'}
              active={isMuted}
              theme={theme}
              onPress={async () => {
                const next = !isMuted;
                try { await muteLocalAudio(next); setIsMuted(next); } catch (e) { setIsMuted(next); }
              }}
            />
            <TrayButton icon="call" danger theme={theme} onPress={handleEndCall} />
          </VideoControlTray>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {/* Audio debug overlay */}
        <View style={styles.debugBox} pointerEvents="none">
          <Text style={styles.debugText}>engine:{engineReady ? 'ok' : 'no'}</Text>
          <Text style={styles.debugText}>joined:{joined ? 'yes' : 'no'}</Text>
          <Text style={styles.debugText}>remote:{remoteUid ?? '-'}</Text>
          <Text style={styles.debugText}>muted:{isMuted ? 'yes' : 'no'}</Text>
          <Text style={styles.debugText}>speaker:{isSpeakerOn ? 'on' : 'off'}</Text>
        </View>
        <View style={styles.header}>
          <HeaderButton
            icon="contract-outline"
            theme={theme}
            onPress={() => navigation.goBack()}
          />

          <View style={styles.titleBlock}>
            <Text style={[styles.callerName, { color: theme.text }]} numberOfLines={1}>
              {callerName}
            </Text>
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {callStatus}
            </Text>
          </View>

          <HeaderButton icon="person-add" theme={theme} />
        </View>

        <View style={styles.avatarSection}>
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

        <View
          style={[
            styles.controlPanel,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            SHADOWS.md,
          ]}
        >
          <CallControl
            icon={isSpeakerOn ? 'volume-high' : 'volume-medium'}
            label="Speaker"
            active={isSpeakerOn}
            theme={theme}
            onPress={async () => {
              const next = !isSpeakerOn;
              try { await setSpeakerphone(next); setIsSpeakerOn(next); } catch (e) { setIsSpeakerOn(next); }
            }}
          />
          <CallControl
            icon={isVideoOn ? 'videocam' : 'videocam-off'}
            label="Video"
            active={isVideoOn}
            muted={!isVideoOn}
            theme={theme}
            onPress={async () => {
              const next = !isVideoOn;
              setIsVideoOn(next);
              try { await muteLocalVideo(!next); } catch (e) {}
            }}
          />
          <CallControl
            icon={isMuted ? 'mic-off' : 'mic-off-outline'}
            label="Mute"
            active={isMuted}
            theme={theme}
            onPress={async () => {
              const next = !isMuted;
              try { await muteLocalAudio(next); setIsMuted(next); } catch (e) { setIsMuted(next); }
            }}
          />
          <CallControl icon="ellipsis-horizontal" label="More" theme={theme} />
          <CallControl icon="phone-portrait-outline" label="Share" muted theme={theme} />
          <CallControl icon="call" label="End" danger theme={theme} onPress={handleEndCall} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

const VideoSurface = ({
  theme,
  compact,
  variant = 'local',
}: {
  theme: any;
  compact?: boolean;
  variant?: 'local' | 'remote';
}) => (
  <View
    style={[
      StyleSheet.absoluteFill,
      {
        backgroundColor: variant === 'remote' ? theme.secondary : theme.inputBackground,
      },
    ]}
  >
    <View
      style={[
        styles.videoShapeLarge,
        { backgroundColor: variant === 'remote' ? theme.messageBlue : theme.surface },
        compact && styles.compactVideoShapeLarge,
      ]}
    />
    <View
      style={[
        styles.videoShapeSmall,
        { backgroundColor: variant === 'remote' ? theme.surface : theme.messageGreen },
        compact && styles.compactVideoShapeSmall,
      ]}
    />
    <View style={[styles.videoScrim, compact && styles.compactVideoScrim]} />
  </View>
);

const VideoControlTray = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: any;
}) => (
  <View
    style={[
      styles.videoTray,
      {
        backgroundColor: theme.surface,
        borderColor: theme.border,
      },
      SHADOWS.md,
    ]}
  >
    {children}
  </View>
);

const CircleIcon = ({
  icon,
  theme,
  small,
  onPress,
}: {
  icon: string;
  theme: any;
  small?: boolean;
  onPress?: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={0.78}
    onPress={onPress}
    style={[
      small ? styles.smallCircleIcon : styles.videoCircleIcon,
      { backgroundColor: theme.surface },
    ]}
  >
    <Icon name={icon} size={small ? 20 : 24} color={theme.text} />
  </TouchableOpacity>
);

const TrayButton = ({
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
      styles.trayButton,
      {
        backgroundColor: danger
          ? theme.error
          : active
            ? theme.background
            : theme.inputBackground,
      },
    ]}
  >
    <Icon
      name={icon}
      size={danger ? 23 : 21}
      color={danger ? theme.background : active ? theme.text : muted ? theme.textSecondary : theme.text}
    />
  </TouchableOpacity>
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

const CallControl = ({
  icon,
  label,
  active,
  danger,
  muted,
  theme,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  danger?: boolean;
  muted?: boolean;
  theme: any;
  onPress?: () => void;
}) => (
  <TouchableOpacity activeOpacity={0.78} onPress={onPress} style={styles.controlItem}>
    <View
      style={[
        styles.controlCircle,
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
    </View>
    <Text style={[styles.controlLabel, { color: theme.text }]}>{label}</Text>
  </TouchableOpacity>
);

const formatDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} sec`;
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
  videoSafeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  videoShapeLarge: {
    position: 'absolute',
    top: -80,
    right: -110,
    width: 260,
    height: 360,
    borderRadius: 130,
    opacity: 0.55,
    transform: [{ rotate: '18deg' }],
  },
  videoShapeSmall: {
    position: 'absolute',
    left: -80,
    bottom: 110,
    width: 230,
    height: 300,
    borderRadius: 120,
    opacity: 0.4,
    transform: [{ rotate: '-22deg' }],
  },
  videoScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  compactVideoShapeLarge: {
    width: 120,
    height: 150,
    top: -20,
    right: -36,
  },
  compactVideoShapeSmall: {
    width: 110,
    height: 140,
    left: -28,
    bottom: -18,
  },
  compactVideoScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  videoHeader: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  debugBox: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 50,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 8,
    borderRadius: 6,
  },
  debugText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
  },
  localPreviewPiP: {
    position: 'absolute',
    bottom: SPACING.lg + 88,
    right: SPACING.lg,
    width: 140,
    height: 200,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 2,
    zIndex: 10,
  },
  pipCameraButton: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  videoTitleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  videoName: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowRadius: 4,
  },
  videoStatus: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: FONT_SIZES.lg,
    marginTop: SPACING.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowRadius: 4,
  },
  videoCircleIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCircleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoSideActions: {
    position: 'absolute',
    top: 96,
    right: SPACING.lg,
    gap: SPACING.md,
  },
  selfPreview: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: 132,
    width: 154,
    height: 216,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.34)',
  },
  previewActions: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    gap: SPACING.sm,
  },
  videoTray: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.xxl,
    minHeight: 76,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  trayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
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
  titleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  callerName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  statusText: {
    fontSize: FONT_SIZES.lg,
    marginTop: SPACING.xs,
  },
  avatarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 142,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontWeight: '500',
  },
  controlPanel: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.xxl,
    minHeight: 238,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  controlItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  controlCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    marginTop: SPACING.sm,
  },
});

export default ActiveCallScreen;
