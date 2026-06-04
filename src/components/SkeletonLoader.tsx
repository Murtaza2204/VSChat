import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { SPACING } from '../constants/colors';

interface SkeletonProps {
  width?: string | number;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  theme: any;
}

const SkeletonPlaceholder: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 12,
  borderRadius = 4,
  style,
  theme,
}) => {
  const animatedValue = new Animated.Value(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.secondary,
          opacity,
        },
        style,
      ]}
    />
  );
};

export const SkeletonLoader: React.FC<{ theme: any }> = ({ theme }) => {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((index) => (
        <View key={index} style={styles.item}>
          <SkeletonPlaceholder width={48} height={48} borderRadius={24} theme={theme} />
          <View style={styles.content}>
            <SkeletonPlaceholder width="60%" height={12} theme={theme} />
            <SkeletonPlaceholder width="90%" height={10} style={{ marginTop: SPACING.xs }} theme={theme} />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    marginBottom: SPACING.md,
  },
  container: {
    padding: SPACING.md,
  },
  item: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  content: {
    marginLeft: SPACING.md,
    flex: 1,
  },
});

export default SkeletonPlaceholder;
