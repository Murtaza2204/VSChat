import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';
import { validateOTP } from '../utils/theme';
import CustomButton from '../components/CustomButton';
import Header from '../components/Header';

const OTPVerificationScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { verifyOTP, setError } = useAuthStore();
  const { phone } = route.params;
  
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [error, setErrorState] = useState('');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (resendTimer > 0 && !canResend) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [resendTimer, canResend]);

  const handleOTPChange = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');

    if (digits.length > 1) {
      const nextOtp = [...otp];
      digits
        .slice(0, 6 - index)
        .split('')
        .forEach((digit, offset) => {
          nextOtp[index + offset] = digit;
        });
      setOtp(nextOtp);
      inputRefs.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = digits;
    setOtp(newOtp);
    setErrorState('');

    if (digits && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOTPKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async () => {
    const otpString = otp.join('');
    if (!validateOTP(otpString)) {
      setErrorState('Please enter a valid 6-digit OTP');
      return;
    }

    setIsLoading(true);
    setErrorState('');
    try {
      const flow = await verifyOTP(phone, otpString);
      if (flow === 'register') {
        navigation.reset({
          index: 0,
          routes: [{ name: 'UserSetup' }],
        });
      }
    } catch (err: any) {
      const message = err?.message || 'Invalid OTP. Please try again.';
      setErrorState(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = () => {
    setResendTimer(30);
    setCanResend(false);
    setOtp(['', '', '', '', '', '']);
    setErrorState('');
  };

  const otpString = otp.join('');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Verify OTP"
        subtitle={`Sent to ${phone}`}
        onBackPress={() => navigation.goBack()}
        theme={theme}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.illustration}>🔐</Text>

          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Enter the 6-digit code sent to your phone number
          </Text>

          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[
                  styles.otpBox,
                  styles.otpText,
                  {
                    backgroundColor: theme.inputBackground,
                    borderColor: error && !digit ? theme.error : theme.border,
                    borderWidth: error && !digit ? 2 : 1,
                    color: theme.text,
                  },
                ]}
                value={digit}
                onChangeText={(value) => handleOTPChange(index, value)}
                onKeyPress={({ nativeEvent }) =>
                  handleOTPKeyPress(index, nativeEvent.key)
                }
                keyboardType="number-pad"
                maxLength={index === 0 ? 6 : 1}
                selectTextOnFocus
                textAlign="center"
                autoFocus={index === 0}
                returnKeyType="done"
              />
            ))}
          </View>

          {error && (
            <Text style={[styles.errorText, { color: theme.error }]}>
              {error}
            </Text>
          )}

          <CustomButton
            title="Verify OTP"
            onPress={handleVerifyOTP}
            loading={isLoading}
            disabled={isLoading || otpString.length !== 6}
            theme={theme}
            style={styles.button}
          />

          <View style={styles.resendContainer}>
            <Text style={[styles.resendText, { color: theme.textSecondary }]}>
              Didn't receive the code?{' '}
            </Text>
            <TouchableOpacity
              onPress={handleResendOTP}
              disabled={!canResend}
            >
              <Text
                style={[
                  styles.resendLink,
                  {
                    color: canResend ? theme.primary : theme.textSecondary,
                  },
                ]}
              >
                {canResend ? 'Resend OTP' : `Resend in ${resendTimer}s`}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  illustration: {
    fontSize: 80,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
  },
  description: {
    fontSize: FONT_SIZES.base,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 20,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xl,
  },
  otpBox: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '600',
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.lg,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  resendText: {
    fontSize: FONT_SIZES.base,
  },
  resendLink: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
});

export default OTPVerificationScreen;
