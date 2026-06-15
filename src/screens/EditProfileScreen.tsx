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
  Modal,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/colors';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import Header from '../components/Header';
import Avatar from '../components/Avatar';

const EditProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, setupProfile, setError } = useAuthStore();
  const { theme } = useThemeStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '👤');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);

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

  const handleEdit = () => {
    setIsEditing(true);
  };

  const requestCameraPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        return status === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    } catch (error) {
      console.error('Camera permission error:', error);
      return false;
    }
  };

  const handleTakePhoto = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert('Camera Permission', 'Camera permission is required to take photos.');
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.85,
        saveToPhotos: true,
      });

      if (result.assets && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        if (photoUri) {
          setAvatar(photoUri);
          setShowAvatarOptions(false);
        }
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Camera Error', 'An error occurred while accessing the camera.');
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.85,
        selectionLimit: 1,
      });

      if (result.assets && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        if (photoUri) {
          setAvatar(photoUri);
          setShowAvatarOptions(false);
        }
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert('Gallery Error', 'An error occurred while accessing the gallery.');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setShowAvatarOptions(false);
    setName(user?.name || '');
    setBio(user?.bio || '');
    setAvatar(user?.avatar || '👤');
    setErrors({});
  };

  const handleSave = async () => {
    if (validateForm()) {
      setIsLoading(true);
      try {
        console.info('EditProfileScreen: calling setupProfile with', { name: name.trim(), bio: bio.trim() });
        const updated = await setupProfile({
          name: name.trim(),
          bio: bio.trim(),
          avatar,
        });
        console.info('EditProfileScreen: setupProfile completed, navigating to Profile');
        setIsEditing(false);
        Alert.alert('Success', 'Profile updated successfully');
        // navigate explicitly to Profile to ensure updated data is shown
        setTimeout(() => {
          navigation.navigate('Profile');
        }, 500);
      } catch (error: any) {
        console.error('EditProfileScreen: setupProfile error', error);
        setError(error.message);
        Alert.alert('Error', error.message || 'Failed to update profile');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const avatarOptions = ['👨‍💼', '👩‍💻', '👨‍🎨', '👩‍🏫', '👨‍🚀', '👩‍⚕️', '👨‍🍳'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Profile"
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
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={() => isEditing && setShowAvatarOptions(true)}
              disabled={!isEditing}
              style={styles.avatarContainer}
            >
              <Avatar source={avatar} size="extra-large" theme={theme} />
            </TouchableOpacity>

            {isEditing && (
              <TouchableOpacity
                onPress={() => setShowAvatarOptions(true)}
                style={[styles.changeAvatarButton, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.changeAvatarText}>Change Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* View Mode */}
          {!isEditing && (
            <View>
              <View style={styles.infoCard}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
                <Text style={[styles.value, { color: theme.text }]}>{name}</Text>
              </View>

              <View style={styles.infoCard}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Bio</Text>
                <Text style={[styles.value, { color: theme.text }]}>
                  {bio || 'No bio added'}
                </Text>
              </View>

              <View style={styles.infoCard}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Phone</Text>
                <Text style={[styles.value, { color: theme.text }]}>{user?.phone}</Text>
              </View>

              <TouchableOpacity
                onPress={handleEdit}
                style={[
                  styles.editButton,
                  { backgroundColor: theme.primary },
                ]}
              >
                <Icon name="pencil" size={20} color="#FFFFFF" />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Edit Mode */}
          {isEditing && (
            <View>
              <CustomInput
                label="Username"
                placeholder="Enter your name"
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (errors.name) setErrors({});
                }}
                theme={theme}
                error={errors.name}
                maxLength={30}
                editable={isEditing}
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
                editable={isEditing}
              />

              {/* Save and Cancel Buttons */}
              <View style={styles.buttonContainer}>
                <CustomButton
                  title="Save Changes"
                  onPress={handleSave}
                  loading={isLoading}
                  disabled={isLoading}
                  theme={theme}
                  style={styles.saveButton}
                />
                <CustomButton
                  title="Cancel"
                  onPress={handleCancel}
                  disabled={isLoading}
                  theme={theme}
                  style={[styles.cancelButton, { backgroundColor: theme.error }]}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Avatar Options Modal */}
      <Modal
        visible={showAvatarOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAvatarOptions(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Choose Avatar</Text>
            <TouchableOpacity onPress={() => setShowAvatarOptions(false)}>
              <Icon name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Camera and Gallery Options */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={handleTakePhoto}
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
              >
                <Icon name="camera" size={28} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChooseFromGallery}
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
              >
                <Icon name="images" size={28} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* Emoji Avatars */}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Or choose an emoji
            </Text>

            <View style={styles.emojiAvatarGrid}>
              {avatarOptions.map((ava) => (
                <TouchableOpacity
                  key={ava}
                  onPress={() => {
                    setAvatar(ava);
                    setShowAvatarOptions(false);
                  }}
                  style={[
                    styles.emojiOption,
                    {
                      backgroundColor: avatar === ava ? theme.primary : theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={styles.emojiText}>{ava}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
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
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.lg,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  changeAvatarButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    ...SHADOWS.medium,
  },
  changeAvatarText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
  // View Mode Styles
  infoCard: {
    backgroundColor: 'transparent',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '500',
    lineHeight: 24,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
  // Edit Mode Styles
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  saveButton: {
    flex: 1,
  },
  cancelButton: {
    flex: 1,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    paddingTop: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
  },
  modalContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
    marginBottom: SPACING.lg,
    marginTop: SPACING.md,
  },
  emojiAvatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    justifyContent: 'flex-start',
  },
  emojiOption: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: FONT_SIZES.xxxl,
  },
});

export default EditProfileScreen;
