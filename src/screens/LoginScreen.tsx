import React, { useState } from 'react';
import {
  View,
  Text,
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
import { COUNTRY_CODES } from '../constants/mockData';
import { validatePhoneNumber } from '../utils/theme';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import Header from '../components/Header';

const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { login, setError } = useAuthStore();
  const [phone, setPhone] = useState('');
  // Default to India for now
  const defaultCountry = COUNTRY_CODES.find((c) => c.code === '+91') || COUNTRY_CODES[0];
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [errors, setErrors] = useState<{ phone?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const validateForm = () => {
    const newErrors: { phone?: string } = {};

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!validatePhoneNumber(phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOTP = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    setError(null);
    setErrors({});
    try {
      const fullPhone = `${selectedCountry.code}${phone}`;
      // Show quick local log for debugging
      console.info('Sending OTP to', fullPhone);
      await login(selectedCountry.code, phone);
      navigation.navigate('OTPVerification', { phone: fullPhone });
    } catch (error: any) {
      const msg = error?.message || 'Failed to send OTP';
      // show local error message immediately
      setErrors({ phone: msg });
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Register or Login"
        subtitle="Enter your phone number to continue"
        showBackButton={false}
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
          <Text style={[styles.illustration, styles.centered]}>📱</Text>

          <CustomInput
            label="Country"
            placeholder="Select country"
            value={selectedCountry.country}
            onChangeText={() => {}}
            editable={false}
            theme={theme}
            icon="chevron-down"
            onIconPress={() => setShowCountryPicker(!showCountryPicker)}
          />

          {showCountryPicker && (
            <View style={[styles.countryPickerContainer, { backgroundColor: theme.surface }]}>
              {COUNTRY_CODES.map((country) => (
                <TouchableOpacity
                  key={country.code}
                  style={styles.countryOption}
                  onPress={() => {
                    setSelectedCountry(country);
                    setShowCountryPicker(false);
                  }}
                >
                  <Text style={[styles.countryText, { color: theme.text }]}>
                    {country.country} ({country.code})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <CustomInput
            label="Phone Number"
            placeholder="Enter your phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            theme={theme}
            error={errors.phone}
            maxLength={15}
          />
          {errors.phone ? (
            <Text style={[{ color: theme.error, textAlign: 'center', marginTop: 8 }]}>
              {errors.phone}
            </Text>
          ) : null}

          <CustomButton
            title="Send OTP"
            onPress={handleSendOTP}
            loading={isLoading}
            disabled={isLoading}
            theme={theme}
            style={styles.button}
          />

          <View style={styles.infoContainer}>
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              We'll send you an SMS with a one-time password.
            </Text>
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
    marginBottom: SPACING.xxl,
  },
  centered: {
    textAlign: 'center',
  },
  countryPickerContainer: {
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    maxHeight: 200,
  },
  countryOption: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
  },
  countryText: {
    fontSize: FONT_SIZES.base,
  },
  button: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  infoContainer: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default LoginScreen;
