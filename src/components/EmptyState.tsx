import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SPACING, FONT_SIZES } from '../constants/colors';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  onRetry?: () => void;
  style?: ViewStyle;
  theme: any;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'chatbox-ellipses',
  title,
  message,
  onRetry,
  style,
  theme,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Icon name={icon} size={64} color={theme.textSecondary} />
      <Text
        style={[
          styles.title,
          {
            color: theme.text,
          },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.message,
          {
            color: theme.textSecondary,
          },
        ]}
      >
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.retryText, { color: theme.background }]}>
            Try Again
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  message: {
    fontSize: FONT_SIZES.base,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
  },
  retryText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
});

export default EmptyState;
