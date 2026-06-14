import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/colors';
import Avatar from './Avatar';
import { Call } from '../types';
import { formatCallTimestamp } from '../utils/theme';

interface CallCardProps {
  call: Call;
  onPress?: () => void;
  onCallPress?: (type: 'audio' | 'video') => void;
  style?: ViewStyle;
  theme: any;
}

const CallCard: React.FC<CallCardProps> = ({
  call,
  onPress,
  onCallPress,
  style,
  theme,
}) => {
  const getCallIcon = () => {
    if (call.status === 'missed') {
      return call.type === 'video' ? 'call' : 'call';
    }
    return call.direction === 'incoming' ? 'arrow-down' : 'arrow-up';
  };

  const getStatusColor = () => {
    switch (call.status) {
      case 'missed':
        return theme.error;
      case 'completed':
        return theme.success;
      default:
        return theme.textSecondary;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
        },
        SHADOWS.sm,
        style,
      ]}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <Avatar source={call.userAvatar} size="medium" theme={theme} />
      </View>

      <View style={styles.middle}>
        <Text
          style={[
            styles.name,
            {
              color: theme.text,
            },
          ]}
          numberOfLines={1}
        >
          {call.userName}
        </Text>
        <View style={styles.callInfo}>
          <Icon
            name={getCallIcon()}
            size={14}
            color={getStatusColor()}
            style={styles.callIcon}
          />
          <Text
            style={[
              styles.status,
              {
                color: getStatusColor(),
              },
            ]}
            numberOfLines={1}
          >
              {call.status === 'missed' ? (call.type === 'video' ? 'Missed video call' : 'Missed') : ''}
          </Text>
          <Text
            style={[
              styles.time,
              {
                color: theme.textSecondary,
              },
            ]}
          >
            {' '}
            • {formatCallTimestamp(new Date(call.timestamp))}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        <TouchableOpacity
          onPress={() => onCallPress?.(call.type)}
          style={[
            styles.callButton,
            {
              backgroundColor: theme.primary,
            },
          ]}
        >
          <Icon
            name={call.type === 'audio' ? 'call' : 'videocam'}
            size={18}
            color={theme.background}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  left: {
    marginRight: SPACING.md,
  },
  middle: {
    flex: 1,
  },
  name: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  callInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callIcon: {
    marginRight: SPACING.xs,
  },
  status: {
    fontSize: FONT_SIZES.sm,
  },
  time: {
    fontSize: FONT_SIZES.sm,
  },
  right: {
    marginLeft: SPACING.md,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CallCard;
