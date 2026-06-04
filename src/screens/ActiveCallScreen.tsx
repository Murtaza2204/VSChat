import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Avatar from '../components/Avatar';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES } from '../constants/colors';

const ActiveCallScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const [isMuted, setIsMuted] = React.useState(false);
  const callType = route.params?.callType || 'video';
  const callerName = route.params?.callerName || 'John Doe';
  const callerAvatar = route.params?.callerAvatar;
  const [isVideoOn, setIsVideoOn] = React.useState(callType === 'video');
  const [callDuration, setCallDuration] = React.useState('00:00');

  React.useEffect(() => {
    let startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      setCallDuration(
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.remoteVideoContainer}>
        <View style={[styles.videoPlaceholder, { backgroundColor: theme.surface }]}>
          {callType === 'video' ? (
            <Icon name="videocam" size={48} color={theme.textSecondary} />
          ) : (
            <Avatar
              source={callerAvatar || callerName.charAt(0)}
              size="extra-large"
              theme={theme}
            />
          )}
          <Text style={[styles.videoText, { color: theme.textSecondary }]}>
            {callerName}
          </Text>
        </View>
      </View>

      {callType === 'video' && (
        <View
          style={[
            styles.localVideoContainer,
            { backgroundColor: theme.surface },
          ]}
        >
          <Icon name="videocam" size={24} color={theme.textSecondary} />
          <Text style={[styles.localVideoText, { color: theme.textSecondary }]}>
            You
          </Text>
        </View>
      )}

      <View style={styles.topBar}>
        <Text style={[styles.duration, { color: theme.text }]}>
          {callDuration}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Icon name="close" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          onPress={() => setIsMuted(!isMuted)}
          style={[
            styles.controlButton,
            {
              backgroundColor: isMuted ? theme.error : theme.secondary,
            },
          ]}
        >
          <Icon
            name={isMuted ? 'mic-off' : 'mic'}
            size={24}
            color={theme.text}
          />
        </TouchableOpacity>

        {callType === 'video' && (
          <TouchableOpacity
            onPress={() => setIsVideoOn(!isVideoOn)}
            style={[
              styles.controlButton,
              {
                backgroundColor: !isVideoOn ? theme.error : theme.secondary,
              },
            ]}
          >
            <Icon
              name={isVideoOn ? 'videocam' : 'videocam-off'}
              size={24}
              color={theme.text}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: theme.secondary }]}
        >
          <Icon name="swap-vertical" size={24} color={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.endCallButton, { backgroundColor: theme.error }]}
        >
          <Icon name="call" size={28} color={theme.background} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  remoteVideoContainer: {
    flex: 1,
    position: 'relative',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoText: {
    marginTop: SPACING.lg,
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
  localVideoContainer: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.lg,
    width: 100,
    height: 140,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  localVideoText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  duration: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
  closeButton: {
    padding: SPACING.sm,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.lg,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ActiveCallScreen;
