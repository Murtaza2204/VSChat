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
import { User } from '../types';

interface UserCardProps {
  user: User;
  onPress?: () => void;
  onActionPress?: () => void;
  action?: string;
  style?: ViewStyle;
  theme: any;
}

const UserCard: React.FC<UserCardProps> = ({
  user,
  onPress,
  onActionPress,
  action,
  style,
  theme,
}) => {
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
        <Avatar
          source={user.avatar}
          size="medium"
          theme={theme}
          online={user.status === 'online'}
        />
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
          {user.name}
        </Text>
        <Text
          style={[
            styles.bio,
            {
              color: theme.textSecondary,
            },
          ]}
          numberOfLines={1}
        >
          {user.bio || user.status}
        </Text>
      </View>

      {action && (
        <TouchableOpacity
          onPress={onActionPress}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.primary,
            },
          ]}
        >
          <Icon
            name={action === 'message' ? 'chatbubble' : 'call'}
            size={18}
            color={theme.background}
          />
        </TouchableOpacity>
      )}
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
  bio: {
    fontSize: FONT_SIZES.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default UserCard;
