import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import api from '../config/api';

const ApprovalRejectedScreen: React.FC = () => {
  const { theme } = useThemeStore();
  const { user, initializeAuth, logout } = useAuthStore();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleResend = async () => {
    setSending(true);
    try {
      const response = await api.post('/users/me/resend-approval-email');
      if (response.data?.success) {
        Alert.alert('Email sent', 'A fresh approval email has been sent to the administrator.');
      } else {
        Alert.alert('Could not send', response.data?.message || 'Unable to resend approval email.');
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unable to resend approval email.';
      Alert.alert('Could not send', message);
    } finally {
      setSending(false);
    }
  };

  const handleCheckAgain = async () => {
    setChecking(true);
    try {
      await initializeAuth();
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: '#dc262618' }]}>
          <Icon name="close-circle-outline" size={40} color="#dc2626" />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Request rejected</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          Your account request has been rejected by the administrator.
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {user?.name ? `Account: ${user.name}` : 'Please contact the administrator if you believe this is a mistake.'}
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
          onPress={handleCheckAgain}
          disabled={checking}
          style={[styles.secondaryButton, { borderColor: theme.border }]}
          activeOpacity={0.85}
        >
          {checking ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Check again</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          style={[styles.tertiaryButton, { borderColor: theme.border }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.tertiaryButtonText, { color: theme.textSecondary }]}>Back to login</Text>
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
    marginBottom: SPACING.md,
  },
  secondaryButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  tertiaryButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tertiaryButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
});

export default ApprovalRejectedScreen;
