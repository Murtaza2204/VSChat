import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import api from '../config/api';

const ApprovalPendingScreen: React.FC = () => {
  const { theme } = useThemeStore();
  const { user, initializeAuth, logout } = useAuthStore();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await initializeAuth();
      } catch (error) {
        // ignore polling errors
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [initializeAuth]);

  const handleResend = async () => {
    setSending(true);
    try {
      const response = await api.post('/users/me/resend-approval-email');
      if (response.data?.success) {
        Alert.alert('Email sent', 'The approval email has been sent again.');
      } else {
        Alert.alert('Could not send', response.data?.message || 'Unable to resend approval email.');
      }
      await initializeAuth();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unable to resend approval email.';
      Alert.alert('Could not send', message);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${theme.primary}18` }]}>
          <Icon name="time-outline" size={40} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Waiting for approval</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          Your account has been submitted for approval. You will be able to use the app once the administrator approves your request.
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {user?.name ? `Submitted for ${user.name}` : 'Your request is pending review.'}
        </Text>

        <TouchableOpacity
          onPress={handleResend}
          disabled={sending}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: theme.background }]}>Resend email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          style={[styles.secondaryButton, { borderColor: theme.border }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  card: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  message: {
    fontSize: FONT_SIZES.base,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  meta: {
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  primaryButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  primaryButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  secondaryButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
});

export default ApprovalPendingScreen;
