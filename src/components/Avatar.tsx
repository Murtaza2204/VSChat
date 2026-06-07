import React from 'react';
import {
  Image,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';

interface AvatarProps {
  source?: string;
  size?: 'small' | 'medium' | 'large' | 'extra-large';
  style?: ViewStyle;
  theme: any;
  badge?: number;
  online?: boolean;
  onPress?: () => void;
}

const Avatar: React.FC<AvatarProps> = ({
  source,
  size = 'medium',
  style,
  theme,
  badge,
  online,
  onPress,
}) => {
  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return { width: 32, height: 32, borderRadius: 16 };
      case 'large':
        return { width: 64, height: 64, borderRadius: 32 };
      case 'extra-large':
        return { width: 80, height: 80, borderRadius: 40 };
      default:
        return { width: 48, height: 48, borderRadius: 24 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small':
        return FONT_SIZES.lg;
      case 'large':
        return FONT_SIZES.xxxl;
      case 'extra-large':
        return FONT_SIZES.giant;
      default:
        return FONT_SIZES.xxl;
    }
  };

  const sizeStyle = getSizeStyle();
  const isImageSource =
    !!source &&
    (source.startsWith('file://') ||
      source.startsWith('content://') ||
      source.startsWith('http://') ||
      source.startsWith('https://'));
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper onPress={onPress} activeOpacity={0.75} style={[sizeStyle, style]}>
      <View
        style={[
          sizeStyle,
          {
            backgroundColor: theme.secondary,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
      >
        {isImageSource ? (
          <Image source={{ uri: source }} style={sizeStyle} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: getFontSize() }}>{source}</Text>
        )}
      </View>

      {online && (
        <View
          style={[
            styles.onlineBadge,
            {
              backgroundColor: theme.success,
              borderColor: theme.background,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}

      {badge !== undefined && badge > 0 && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.error,
              borderColor: theme.background,
              top: 0,
              right: 0,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: theme.background }]}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Wrapper>
  );
};

const styles = StyleSheet.create({
  onlineBadge: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
  },
  badge: {
    position: 'absolute',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
});

export default Avatar;
