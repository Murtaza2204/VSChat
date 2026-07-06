import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';

const WelcomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { theme } = useThemeStore();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.heroBlock}>
          <Text style={[styles.brand, { color: theme.text }]}>VS Chat</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>join now!</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Login', { mode: 'signup' })}
          style={[styles.button, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.buttonText, { color: theme.background }]}>Join now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  heroBlock: {
    alignItems: 'center',
    marginBottom: SPACING.xxxl,
  },
  brand: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  button: {
    minWidth: 180,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
});

export default WelcomeScreen;
