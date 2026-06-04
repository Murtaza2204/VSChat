import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES } from '../constants/colors';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import Header from '../components/Header';
import Avatar from '../components/Avatar';

const EditProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, setupProfile, setError } = useAuthStore();
  const { theme } = useThemeStore();
  
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '👤');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

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

  const handleSave = async () => {
    if (validateForm()) {
      setIsLoading(true);
      try {
        await setupProfile({
          name: name.trim(),
          bio: bio.trim(),
          avatar,
        });
        navigation.goBack();
      } catch (error: any) {
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const avatarOptions = ['👨‍💼', '👩‍💻', '👨‍🎨', '👩‍🏫', '👨‍🚀', '👩‍⚕️', '👨‍🍳', '👩‍🌾'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Edit Profile"
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
          <View style={styles.avatarSection}>
            <Avatar source={avatar} size="extra-large" theme={theme} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.avatarScroll}
            >
              {avatarOptions.map((ava) => (
                <Avatar
                  key={ava}
                  source={ava}
                  size="medium"
                  theme={theme}
                  style={{
                    marginRight: SPACING.md,
                    borderWidth: avatar === ava ? 3 : 0,
                    borderColor: theme.primary,
                  }}
                  onPress={() => setAvatar(ava)}
                />
              ))}
            </ScrollView>
          </View>

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
            label="Bio"
            placeholder="Tell us about yourself"
            value={bio}
            onChangeText={setBio}
            theme={theme}
            multiline
            numberOfLines={3}
            maxLength={100}
          />

          <CustomButton
            title="Save Changes"
            onPress={handleSave}
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  avatarScroll: {
    marginTop: SPACING.lg,
  },
  button: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
});

export default EditProfileScreen;
