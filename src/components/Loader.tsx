import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { SPACING, FONT_SIZES } from '../constants/colors';

interface LoaderProps {
  loading?: boolean;
  message?: string;
  size?: 'small' | 'large';
  style?: ViewStyle;
  theme: any;
}

const Loader: React.FC<LoaderProps> = ({
  loading = true,
  message,
  size = 'large',
  style,
  theme,
}) => {
  if (!loading) return null;

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={theme.primary} />
      {message && (
        <Text
          style={[
            styles.message,
            {
              color: theme.text,
            },
          ]}
        >
          {message}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  message: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.base,
    fontWeight: '500',
  },
});

export default Loader;
