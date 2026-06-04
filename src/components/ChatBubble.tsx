import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/colors';

interface ChatBubbleProps {
  message: string;
  timestamp: Date;
  isOwn: boolean;
  style?: ViewStyle;
  theme: any;
  read?: boolean;
  onLongPress?: () => void;
  mediaUrl?: string;
  type?: 'text' | 'image' | 'video' | 'file';
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  timestamp,
  isOwn,
  style,
  theme,
  read,
  onLongPress,
  mediaUrl,
  type = 'text',
}) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const bubbleColor = isOwn ? theme.messageGreen : theme.messageBlue;

  return (
    <View
      style={[
        styles.container,
        isOwn ? styles.ownContainer : styles.otherContainer,
        style,
      ]}
    >
      <TouchableOpacity
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          {
            backgroundColor: bubbleColor,
          },
          isOwn && SHADOWS.sm,
        ]}
        activeOpacity={0.7}
      >
        {type === 'image' && mediaUrl ? (
          <View
            style={[
              styles.mediaContainer,
              { backgroundColor: theme.surface, borderRadius: BORDER_RADIUS.md },
            ]}
          >
            <Icon name="image" size={40} color={theme.textSecondary} />
            <Text style={[styles.mediaText, { color: theme.textSecondary }]}>
              Image
            </Text>
          </View>
        ) : type === 'video' && mediaUrl ? (
          <View
            style={[
              styles.mediaContainer,
              { backgroundColor: theme.surface, borderRadius: BORDER_RADIUS.md },
            ]}
          >
            <Icon name="play-circle" size={40} color={theme.textSecondary} />
            <Text style={[styles.mediaText, { color: theme.textSecondary }]}>
              Video
            </Text>
          </View>
        ) : (
          <Text style={[styles.message, { color: theme.text }]}>
            {message}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
            {formatTime(timestamp)}
          </Text>
          {isOwn && read && (
            <Icon name="checkmark-done" size={14} color={theme.primary} />
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  ownContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  message: {
    fontSize: FONT_SIZES.base,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: FONT_SIZES.xs,
    marginRight: SPACING.xs,
  },
  mediaContainer: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaText: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
  },
});

export default ChatBubble;
