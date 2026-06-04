import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  SafeAreaView,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { FONT_SIZES, SPACING } from '../constants/colors';

const SplashScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { isAuthenticated } = useAuthStore();
  const { theme } = useThemeStore();
  const scaleAnim = new Animated.Value(0.5);
  const opacityAnim = new Animated.Value(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      if (isAuthenticated) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [isAuthenticated, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <Text style={styles.logo}>💬</Text>
        <Text style={[styles.appName, { color: theme.text }]}>
          ChatApp
        </Text>
        <Text style={[styles.tagline, { color: theme.textSecondary }]}>
          Stay Connected
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.loader,
          {
            opacity: opacityAnim,
          },
        ]}
      >
        <View
          style={[
            styles.loaderDot,
            { backgroundColor: theme.primary },
          ]}
        />
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    marginBottom: SPACING.xxxl,
  },
  logo: {
    fontSize: 80,
    marginBottom: SPACING.lg,
  },
  appName: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  tagline: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '500',
  },
  loader: {
    position: 'absolute',
    bottom: SPACING.xl,
  },
  loaderDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});

export default SplashScreen;
