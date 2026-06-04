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
  Animated,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES } from '../constants/colors';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import Header from '../components/Header';
import Avatar from '../components/Avatar';

const UserSetupScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { setupProfile, setError } = useAuthStore();
  
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👤');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const avatarOptions = ['👨‍💼', '👩‍💻', '👨‍🎨', '👩‍🏫', '👨‍🚀', '👩‍⚕️', '👨‍🍳', '👩‍🌾'];
  const [expandedAvatars, setExpandedAvatars] = useState(false);

  const validateForm = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Username is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Username must be at least 2 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (validateForm()) {
      setIsLoading(true);
      try {
        await setupProfile({
          name: name.trim(),
          bio: bio.trim(),
          avatar: selectedAvatar,
          status: 'online',
        });
        
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } catch (error: any) {
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Create Profile"
        subtitle="Tell us about yourself"
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
          <Text style={styles.illustration}>👋</Text>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Choose Your Avatar
          </Text>

          <View style={styles.avatarPreview}>
            <Avatar
              source={selectedAvatar}
              size="extra-large"
              theme={theme}
            />
            <Text style={[styles.avatarName, { color: theme.textSecondary }]}>
              {selectedAvatar}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setExpandedAvatars(!expandedAvatars)}
            style={[
              styles.avatarToggle,
              { backgroundColor: theme.primary },
            ]}
          >
            <Text style={[styles.avatarToggleText, { color: theme.background }]}>
              {expandedAvatars ? 'Hide Avatars' : 'Show More Avatars'}
            </Text>
          </TouchableOpacity>

          {expandedAvatars && (
            <View style={styles.avatarGrid}>
              {avatarOptions.map((avatar) => (
                <TouchableOpacity
                  key={avatar}
                  onPress={() => {
                    setSelectedAvatar(avatar);
                    setExpandedAvatars(false);
                  }}
                  style={[
                    styles.avatarOption,
                    {
                      backgroundColor: selectedAvatar === avatar ? theme.primary : theme.surface,
                    },
                  ]}
                >
                  <Text style={styles.avatarOptionText}>{avatar}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <CustomInput
            label="Username"
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            theme={theme}
            error={errors.name}
            maxLength={30}
          />

          <CustomInput
            label="Bio (Optional)"
            placeholder="Tell us about yourself"
            value={bio}
            onChangeText={setBio}
            theme={theme}
            multiline
            numberOfLines={3}
            maxLength={100}
          />

          <CustomButton
            title="Continue"
            onPress={handleContinue}
            loading={isLoading}
            disabled={isLoading}
            theme={theme}
            style={styles.button}
          />
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
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    marginBottom: SPACING.lg,
  },
  avatarPreview: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  avatarName: {
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.md,
  },
  avatarToggle: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  avatarToggleText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACING.xl,
  },
  avatarOption: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatarOptionText: {
    fontSize: FONT_SIZES.xl,
  },
  button: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
});

export default UserSetupScreen;
