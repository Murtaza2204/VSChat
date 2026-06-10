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
  const chatId = route.params?.chatId;
  const [isMuted, setIsMuted] = React.useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = React.useState(false);
  const [isVideoOn, setIsVideoOn] = React.useState(callType === 'video');
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const startedAtRef = React.useRef(Date.now());
  const didLogCallRef = React.useRef(false);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const initials = getInitials(callerName);
  const accepted = callType === 'video' && elapsedSeconds >= 4;
  const avatarSize = Math.min(width * 0.54, 220);
  const callStatus = elapsedSeconds < 4 ? 'Ringing...' : formatDuration(elapsedSeconds);

  const handleEndCall = () => {
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

    navigation.goBack();
  };

  if (callType === 'video') {
    return (
      <SafeAreaView style={styles.videoSafeArea}>
        <View style={styles.videoContainer}>
          <VideoSurface theme={theme} variant={accepted ? 'remote' : 'local'} />

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

          {!accepted ? (
            <View style={styles.videoSideActions}>
              <CircleIcon icon="person-add" theme={theme} />
              <CircleIcon icon="camera-reverse" theme={theme} />
              <CircleIcon icon="color-wand" theme={theme} />
            </View>
          ) : (
            <View style={[styles.selfPreview, { backgroundColor: theme.surface }]}>
              <VideoSurface theme={theme} compact />
              <View style={styles.previewActions}>
                <CircleIcon icon="camera-reverse" theme={theme} small />
                <CircleIcon icon="color-wand" theme={theme} small />
              </View>
            </View>
          )}

          <VideoControlTray theme={theme}>
            <TrayButton icon="ellipsis-horizontal" theme={theme} />
            <TrayButton
              icon={isVideoOn ? 'videocam' : 'videocam-off'}
              active={isVideoOn}
              muted={!isVideoOn}
              theme={theme}
              onPress={() => setIsVideoOn(!isVideoOn)}
            />
            <TrayButton
              icon={isSpeakerOn ? 'volume-high' : 'volume-medium'}
              active={isSpeakerOn}
              theme={theme}
              onPress={() => setIsSpeakerOn(!isSpeakerOn)}
            />
            <TrayButton
              icon={isMuted ? 'mic-off' : 'mic-off-outline'}
              active={isMuted}
              theme={theme}
              onPress={() => setIsMuted(!isMuted)}
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
            onPress={() => setIsSpeakerOn(!isSpeakerOn)}
          />
          <CallControl
            icon={isVideoOn ? 'videocam' : 'videocam-off'}
            label="Video"
            active={isVideoOn}
            muted={!isVideoOn}
            theme={theme}
            onPress={() => setIsVideoOn(!isVideoOn)}
          />
          <CallControl
            icon={isMuted ? 'mic-off' : 'mic-off-outline'}
            label="Mute"
            active={isMuted}
            theme={theme}
            onPress={() => setIsMuted(!isMuted)}
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
    ...StyleSheet.absoluteFillObject,
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
