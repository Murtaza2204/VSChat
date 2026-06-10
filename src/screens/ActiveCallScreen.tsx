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

  const initials = callerName
    .split(' ')
    .filter(Boolean)
    .map((part: string) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
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
