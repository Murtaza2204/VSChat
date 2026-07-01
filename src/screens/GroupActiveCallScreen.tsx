import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Image,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ensureAudioVideoPermissions } from '../services/permissions';
import {
  muteLocalVideo,
  muteLocalAudio,
  setSpeakerphone,
} from '../services/agoraService';
import { BORDER_RADIUS, FONT_SIZES, SHADOWS, SPACING } from '../constants/colors';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import signaling from '../services/signaling';
import { clearCallNotification } from '../services/notifications';

type GroupParticipant = {
  userId: string;
  name?: string | null;
  avatar?: string | null;
  status?: string;
  joinedAt?: string | Date | null;
  leftAt?: string | Date | null;
  durationSeconds?: number | null;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GroupActiveCallScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const currentUser = useAuthStore.getState().user;
  const { width } = useWindowDimensions();

  const callType = route.params?.callType || 'audio';
  const callId = route.params?.callId;
  const appIdParam = route.params?.appId;
  const channelParam = route.params?.channel;
  const tokenParam = route.params?.token;
  const groupName = route.params?.groupName || route.params?.callerName || 'Group';
  const groupAvatar = route.params?.groupAvatar || null;
  const isCaller = !!route.params?.isCaller;

  const [participants, setParticipants] = React.useState<GroupParticipant[]>([]);
  const [isMuted, setIsMuted] = React.useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = React.useState(false);
  const [isVideoOn, setIsVideoOn] = React.useState(callType === 'video');
  const [sessionActive, setSessionActive] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const startedAtRef = React.useRef<number | null>(null);
  const didDismissCallRef = React.useRef(false);

  const parseParticipantsInput = (value: any): any[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const normalizeParticipant = (participant: any): GroupParticipant | null => {
    if (!participant) return null;
    const userId = String(participant.userId || participant.id || participant._id || '');
    if (!userId) return null;
    return {
      userId,
      name: participant.name || participant.displayName || participant.title || participant.userName || null,
      avatar: participant.avatar || participant.profilePictureUrl || null,
      status: participant.status || 'joined',
      joinedAt: participant.joinedAt || null,
      leftAt: participant.leftAt || null,
      durationSeconds: typeof participant.durationSeconds === 'number' ? participant.durationSeconds : null,
    };
  };

  const mergeParticipants = React.useCallback((incomingList: any[], preferCurrentUser = true) => {
    const map = new Map<string, GroupParticipant>();
    const add = (participant: any) => {
      const normalized = normalizeParticipant(participant);
      if (!normalized) return;
      map.set(normalized.userId, normalized);
    };

    parseParticipantsInput(incomingList).forEach(add);

    if (preferCurrentUser && currentUser?.id) {
      add({
        userId: currentUser.id,
        name: 'You',
        avatar: currentUser.avatar || null,
        status: 'joined',
      });
    }

    const ordered = Array.from(map.values()).filter((participant) => {
      const status = String(participant.status || 'joined').toLowerCase();
      return status !== 'invited' && status !== 'declined' && !participant.leftAt;
    });

    ordered.sort((a, b) => {
      if (String(a.userId) === String(currentUser?.id)) return 1;
      if (String(b.userId) === String(currentUser?.id)) return -1;
      const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
      const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
      return aTime - bTime;
    });

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setParticipants(ordered);
  }, [currentUser?.id, currentUser?.avatar]);

  const syncFromSessionState = React.useCallback((state: any) => {
    if (!state) return;
    const nextParticipants = Array.isArray(state.participants) ? state.participants : [];
    mergeParticipants(nextParticipants, true);
    const nextActive = state.active || state.callStatus === 'active' || state.activeParticipantCount > 1;
    setSessionActive(nextActive);
    if (nextActive && !startedAtRef.current) {
      startedAtRef.current = state.startedAt ? Date.parse(String(state.startedAt)) : Date.now();
    }
  }, [mergeParticipants]);

  const resetAfterCall = React.useCallback(() => {
    const returnRoute = route.params?.returnRoute;
    const routeNames: string[] = navigation.getState?.()?.routeNames || [];

    if (returnRoute?.name && routeNames.includes(returnRoute.name)) {
      const routes = routeNames.includes('ChatList')
        ? [{ name: 'ChatList' }, { name: returnRoute.name, params: returnRoute.params }]
        : [{ name: returnRoute.name, params: returnRoute.params }];
      navigation.reset({ index: routes.length - 1, routes });
      return;
    }

    if (routeNames.includes('CallsList')) {
      navigation.reset({ index: 0, routes: [{ name: 'CallsList' }] });
      return;
    }

    if (routeNames.includes('ChatList')) {
      navigation.reset({ index: 0, routes: [{ name: 'ChatList' }] });
      return;
    }

    if (navigation.canGoBack?.()) navigation.goBack();
  }, [navigation, route.params?.returnRoute]);

  const leaveAndDismissCall = React.useCallback(async () => {
    if (didDismissCallRef.current) return;
    didDismissCallRef.current = true;
    clearCallNotification(callId).catch(() => {});
    try {
      const { leaveChannel } = await import('../services/agoraService');
      await leaveChannel();
      } catch {}
    resetAfterCall();
  }, [callId, resetAfterCall]);

  React.useEffect(() => {
    mergeParticipants(route.params?.groupParticipants || [], false);
  }, [mergeParticipants, route.params?.groupParticipants]);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    mergeParticipants([
      ...(route.params?.groupParticipants || []),
      {
        userId: currentUser.id,
        name: 'You',
        avatar: currentUser.avatar || null,
        status: 'joined',
      },
    ]);
  }, [mergeParticipants, currentUser?.id, currentUser?.avatar, route.params?.groupParticipants]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!startedAtRef.current) return;
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    let callCreatedHandler: ((payload: any) => void) | null = null;

    const setupAgora = async () => {
      const ok = await ensureAudioVideoPermissions();
      if (!ok) return;

      try {
        const { default: agoraService } = await import('../services/agoraService');
        const { initAgora, joinChannel, setRemoteUidListener } = agoraService;
        const appId = appIdParam || (await import('../config/agora')).AGORA_APP_ID;
        const channel = channelParam || (await import('../config/agora')).AGORA_CHANNEL;

        try {
          await initAgora(appId);
          if (!mounted) return;
        } catch (initError) {
          console.error('[GroupActiveCall] Agora initialization failed:', initError);
          return;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 600));

        try {
          if (callType === 'video') {
            await muteLocalVideo(false);
          }
        } catch {}

        setRemoteUidListener(() => {});

        const joinAgora = async (token: string | null, resolvedChannel: string) => {
          if (!mounted) return;
          await joinChannel(
            token,
            resolvedChannel,
            0,
            async () => {},
            async () => {},
            async () => {
              if (!mounted) return;
              try { await setSpeakerphone(true); setIsSpeakerOn(true); } catch {}
              try { await muteLocalAudio(false); setIsMuted(false); } catch {}
              if (callType === 'video') {
                try { await muteLocalVideo(false); setIsVideoOn(true); } catch {}
              }
              signaling.requestCallSessionState(callId);
            },
          );
        };

        if (isCaller && !tokenParam) {
          callCreatedHandler = async (payload: any) => {
            if (!mounted) return;
            if (payload?.callId && callId && String(payload.callId) !== String(callId)) return;
            await joinAgora(payload?.token || null, payload?.channel || channel);
            syncFromSessionState(payload);
          };
          signaling.onCallCreated(callCreatedHandler);
          const cached = signaling.getLastCallCreated(callId);
          if (cached) {
            await callCreatedHandler(cached);
          }
        } else {
          await joinAgora(tokenParam || null, channel);
        }

        signaling.requestCallSessionState(callId);
      } catch {
        console.error('[GroupActiveCall] Agora setup error:', e);
      }
    };

    if (callType === 'video' || callType === 'audio') {
      setupAgora();
    }

    return () => {
      mounted = false;
      try { if (callCreatedHandler) signaling.onCallCreated(() => {}); } catch {}
    };
  }, [appIdParam, callId, callType, channelParam, isCaller, tokenParam, syncFromSessionState]);

  React.useEffect(() => {
    signaling.onCallSessionState((payload: any) => {
      if (payload?.callId && callId && String(payload.callId) !== String(callId)) return;
      syncFromSessionState(payload);
    });
    signaling.requestCallSessionState(callId);
  }, [callId, syncFromSessionState]);

  React.useEffect(() => {
    const unsubscribe = signaling.onCallEnded(async (payload: any) => {
      if (payload?.callId && callId && String(payload.callId) !== String(callId)) return;
      await leaveAndDismissCall();
    });

    return unsubscribe;
  }, [callId, leaveAndDismissCall]);

  React.useEffect(() => {
    return () => {
      import('../services/agoraService').then((s) => s.leaveChannel()).catch(() => {});
    };
  }, []);

  const handleEndCall = async () => {
    clearCallNotification(callId).catch(() => {});
    try {
      const currentUserId = currentUser?.id;
      if (callId && currentUserId) {
        await signaling.endCall(callId, currentUserId, isCaller ? 'hangup' : 'leave');
      }
    } catch {}
    await leaveAndDismissCall();
  };

  const visibleCount = participants.length || 1;
  const columns = visibleCount === 1 ? 1 : visibleCount === 2 ? 2 : visibleCount <= 4 ? 2 : 3;
  const gridWidth = width - SPACING.lg * 2;
  const gap = SPACING.md;
  const tileWidth = columns === 1
    ? Math.min(gridWidth, 340)
    : Math.floor((gridWidth - gap * (columns - 1)) / columns);
  const tileHeight = columns === 1 ? Math.max(250, Math.floor(tileWidth * 0.95)) : Math.max(210, Math.floor(tileWidth * 1.18));
  const scrollableGrid = visibleCount >= 10;
  const statusText = sessionActive
    ? formatDuration(elapsedSeconds)
    : 'Waiting for members';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.78}
            onPress={() => navigation.goBack()}
            style={[styles.headerButton, { backgroundColor: theme.surface }]}
          >
            <Icon name="contract-outline" size={24} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.titleBlock}>
            {isValidAvatarUri(groupAvatar) ? (
              <Image source={{ uri: groupAvatar }} style={styles.headerAvatar} />
            ) : null}
            <Text style={[styles.groupName, { color: theme.text }]} numberOfLines={1}>
              {groupName}
            </Text>
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {statusText}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.78}
            style={[styles.headerButton, { backgroundColor: theme.surface }]}
          >
            <Icon name="people-outline" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.gridShell}>
          {scrollableGrid ? (
            <ScrollView contentContainerStyle={styles.gridScrollContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.gridWrap, { width: gridWidth }]}>
                {participants.length ? participants.map((participant) => (
                  <ParticipantTile
                    key={participant.userId}
                    participant={participant}
                    currentUserId={currentUser?.id}
                    theme={theme}
                    width={tileWidth}
                    height={tileHeight}
                    gap={gap}
                  />
                )) : (
                  <ParticipantTile
                    participant={{ userId: currentUser?.id || 'me', name: 'You', avatar: currentUser?.avatar || null, status: 'joined' }}
                    currentUserId={currentUser?.id}
                    theme={theme}
                    width={tileWidth}
                    height={tileHeight}
                    gap={gap}
                  />
                )}
              </View>
            </ScrollView>
          ) : (
            <View style={[styles.gridWrap, { width: gridWidth }]}>
              {participants.length ? participants.map((participant) => (
                <ParticipantTile
                  key={participant.userId}
                  participant={participant}
                  currentUserId={currentUser?.id}
                  theme={theme}
                  width={tileWidth}
                  height={tileHeight}
                  gap={gap}
                />
              )) : (
                <ParticipantTile
                  participant={{ userId: currentUser?.id || 'me', name: 'You', avatar: currentUser?.avatar || null, status: 'joined' }}
                  currentUserId={currentUser?.id}
                  theme={theme}
                  width={tileWidth}
                  height={tileHeight}
                  gap={gap}
                />
              )}
            </View>
          )}
        </View>

        <View
          style={[
            styles.tray,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            SHADOWS.md,
          ]}
        >
          <TrayButton icon="ellipsis-horizontal" theme={theme} />
          {callType === 'video' ? (
            <TrayButton
              icon={isVideoOn ? 'videocam' : 'videocam-off'}
              active={isVideoOn}
              muted={!isVideoOn}
              theme={theme}
              onPress={async () => {
                const next = !isVideoOn;
                setIsVideoOn(next);
                try { await muteLocalVideo(!next); } catch {}
              }}
            />
          ) : null}
          <TrayButton
            icon={isSpeakerOn ? 'volume-high' : 'volume-medium'}
            active={isSpeakerOn}
            theme={theme}
            onPress={async () => {
              const next = !isSpeakerOn;
              try { await setSpeakerphone(next); setIsSpeakerOn(next); } catch { setIsSpeakerOn(next); }
            }}
          />
          <TrayButton
            icon={isMuted ? 'mic-off' : 'mic-off-outline'}
            active={isMuted}
            theme={theme}
            onPress={async () => {
              const next = !isMuted;
              try { await muteLocalAudio(next); setIsMuted(next); } catch { setIsMuted(next); }
            }}
          />
          <TrayButton icon="call" danger theme={theme} onPress={handleEndCall} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const ParticipantTile = ({
  participant,
  currentUserId,
  theme,
  width,
  height,
  gap,
}: {
  participant: GroupParticipant;
  currentUserId?: string;
  theme: any;
  width: number;
  height: number;
  gap: number;
}) => {
  const isSelf = String(participant.userId) === String(currentUserId);
  const displayName = isSelf ? 'You' : participant.name || 'Unknown';
  const initials = getInitials(displayName);
  const avatarSize = Math.max(60, Math.min(width * 0.28, 92));

  return (
    <View
      style={[
        styles.tile,
        {
          width,
          height,
          marginRight: gap,
          marginBottom: gap,
          backgroundColor: theme.surface,
          borderColor: isSelf ? theme.primary : theme.border,
        },
      ]}
    >
      <View style={[styles.tileAvatarWrap, { backgroundColor: theme.inputBackground }]}>
        {isValidAvatarUri(participant.avatar) ? (
          <Image source={{ uri: participant.avatar }} style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }} />
        ) : (
          <View
            style={[
              styles.initialBubble,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: isSelf ? theme.primary : theme.messageBlue,
              },
            ]}
          >
            <Text style={[styles.initialText, { color: isSelf ? theme.background : theme.primary }]}>
              {initials || '?'}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.tileName, { color: theme.text }]} numberOfLines={1}>
        {displayName}
      </Text>
    </View>
  );
};

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

const getInitials = (name: string) =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => (part ? part.charAt(0) : ''))
    .join('')
    .slice(0, 2)
    .toUpperCase();

const formatDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} sec`;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const isValidAvatarUri = (value?: string | null) =>
  !!value &&
  (value.startsWith('file://') ||
    value.startsWith('content://') ||
    value.startsWith('http://') ||
    value.startsWith('https://'));

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  header: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
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
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    minWidth: 0,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: SPACING.xs,
  },
  groupName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusText: {
    fontSize: FONT_SIZES.lg,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  gridShell: {
    flex: 1,
    justifyContent: 'center',
  },
  gridScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  tile: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tileAvatarWrap: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  initialBubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
  },
  tileName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  tray: {
    minHeight: 80,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  trayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GroupActiveCallScreen;
