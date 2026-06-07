import React, { useState, useEffect } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  check,
  checkNotifications,
  PERMISSIONS,
  Permission,
  PermissionStatus,
  request,
  requestNotifications,
  RESULTS,
} from 'react-native-permissions';
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { BORDER_RADIUS, FONT_SIZES, SHADOWS, SPACING } from '../constants/colors';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';
import Header from '../components/Header';

type PermissionKey =
  | 'contacts'
  | 'notifications'
  | 'photos'
  | 'camera'
  | 'microphone';

const getPhotoPermission = () => {
  if (Platform.OS === 'ios') {
    return PERMISSIONS.IOS.PHOTO_LIBRARY;
  }

  if (Platform.OS === 'android') {
    return Number(Platform.Version) >= 33
      ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
      : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;
  }

  return undefined;
};

const UserSetupScreen: React.FC = () => {
  const { theme } = useThemeStore();
  const { setupProfile, setError } = useAuthStore();

  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [statuses, setStatuses] = useState<Record<PermissionKey, PermissionStatus | undefined>>({
    contacts: undefined,
    notifications: undefined,
    photos: undefined,
    camera: undefined,
    microphone: undefined,
  });
  const [nameError, setNameError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [currentPermissionStep, setCurrentPermissionStep] = useState<'media' | 'notifications' | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [profileSetupStarted, setProfileSetupStarted] = useState(false);

  // Show permission popups immediately on screen load
  useEffect(() => {
    setCurrentPermissionStep('media');
    setShowPermissionModal(true);
  }, []);

  const requestMediaPermissions = async () => {
    try {
      // Request contacts
      const contactsPermission =
        Platform.OS === 'ios'
          ? PERMISSIONS.IOS.CONTACTS
          : PERMISSIONS.ANDROID.READ_CONTACTS;

      const contactsStatus = await check(contactsPermission);
      const contactsResult =
        contactsStatus === RESULTS.GRANTED || contactsStatus === RESULTS.LIMITED
          ? contactsStatus
          : await request(contactsPermission);

      // Request photos
      const photoPermission = getPhotoPermission();
      let photosResult = RESULTS.UNAVAILABLE;
      if (photoPermission) {
        const photosStatus = await check(photoPermission);
        photosResult =
          photosStatus === RESULTS.GRANTED || photosStatus === RESULTS.LIMITED
            ? photosStatus
            : await request(photoPermission);
      }

      // Request camera
      const cameraPermission =
        Platform.OS === 'ios'
          ? PERMISSIONS.IOS.CAMERA
          : PERMISSIONS.ANDROID.CAMERA;

      const cameraStatus = await check(cameraPermission);
      const cameraResult =
        cameraStatus === RESULTS.GRANTED || cameraStatus === RESULTS.LIMITED
          ? cameraStatus
          : await request(cameraPermission);

      // Request microphone
      const micPermission =
        Platform.OS === 'ios'
          ? PERMISSIONS.IOS.MICROPHONE
          : PERMISSIONS.ANDROID.RECORD_AUDIO;

      const micStatus = await check(micPermission);
      const micResult =
        micStatus === RESULTS.GRANTED || micStatus === RESULTS.LIMITED
          ? micStatus
          : await request(micPermission);

      setStatuses((current) => ({
        ...current,
        contacts: contactsResult,
        photos: photosResult,
        camera: cameraResult,
        microphone: micResult,
      }));

      // Move to next step (notifications)
      setCurrentPermissionStep('notifications');
    } catch (error: any) {
      setError(error.message || 'Permission request failed');
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const response = await requestNotifications(['alert', 'badge', 'sound']);
      setStatuses((current) => ({
        ...current,
        notifications: response.status,
      }));
      // Don't complete setup here - just close the modal
      // User still needs to fill in name and profile photo
    } catch (error: any) {
      setError(error.message || 'Notification permission request failed');
    }
  };

  const handlePermissionModalConfirm = async () => {
    setIsRequestingPermission(true);
    try {
      if (currentPermissionStep === 'media') {
        await requestMediaPermissions();
        // Move to next step (notifications)
        setCurrentPermissionStep('notifications');
      } else if (currentPermissionStep === 'notifications') {
        await requestNotificationPermission();
        // Close modal and let user fill in profile
        setShowPermissionModal(false);
        setCurrentPermissionStep(null);
      }
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handlePermissionModalCancel = () => {
    if (currentPermissionStep === 'media') {
      // Skip media, go to notifications
      setCurrentPermissionStep('notifications');
    } else if (currentPermissionStep === 'notifications') {
      // Skip notifications, close modal and show form
      setShowPermissionModal(false);
      setCurrentPermissionStep(null);
    }
  };

  const handleChoosePhoto = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.85,
        selectionLimit: 1,
      });

      const uri = result.assets?.[0]?.uri;
      if (uri) {
        setPhotoUri(uri);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert('Gallery Error', 'An error occurred while accessing the gallery.');
    }
  };

  const handleContinue = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError('Name is required');
      return;
    }

    if (trimmedName.length < 2) {
      setNameError('Name must be at least 2 characters');
      return;
    }

    setIsLoading(true);
    try {
      await setupProfile({
        name: trimmedName,
        avatar: photoUri || '👤',
        status: 'online',
        permissions: statuses,
      });
    } catch (error: any) {
      setError(error.message || 'Profile setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Set up your profile"
        subtitle="A few details before you start chatting"
        showBackButton={false}
        theme={theme}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.hero,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.photoWrap}>
              <TouchableOpacity
                onPress={handleChoosePhoto}
                activeOpacity={0.8}
                style={[
                  styles.photoButton,
                  {
                    backgroundColor: theme.inputBackground,
                    borderColor: theme.primary,
                  },
                ]}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.photo} />
                ) : (
                  <Icon name="person-add-outline" size={42} color={theme.primary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChoosePhoto}
                activeOpacity={0.8}
                style={[styles.cameraBadge, { backgroundColor: theme.primary }]}
              >
                <Icon name="camera" size={18} color={theme.background} />
              </TouchableOpacity>
            </View>

            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: theme.text }]}>
                Make it yours
              </Text>
              <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                Add your name and choose a profile photo
              </Text>
            </View>
          </View>

          <CustomInput
            label="Name *"
            placeholder="Enter your name"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setNameError('');
            }}
            theme={theme}
            error={nameError}
            maxLength={30}
          />

          <CustomButton
            title="Continue"
            onPress={handleContinue}
            loading={isLoading}
            disabled={isLoading || !name.trim()}
            theme={theme}
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showPermissionModal && currentPermissionStep !== null}
        transparent
        animationType="fade"
        onRequestClose={handlePermissionModalCancel}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.surface },
            ]}
          >
            {/* Icon */}
            <View
              style={[
                styles.modalIcon,
                {
                  backgroundColor:
                    currentPermissionStep === 'media' ? '#20B25420' : '#2563EB20',
                },
              ]}
            >
              <Icon
                name={currentPermissionStep === 'media' ? 'folder-open-outline' : 'notifications-outline'}
                size={44}
                color={currentPermissionStep === 'media' ? '#20B254' : '#2563EB'}
              />
            </View>

            {/* Title & Description */}
            {currentPermissionStep === 'media' && (
              <>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Contacts and media
                </Text>
                <Text
                  style={[
                    styles.modalDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  To easily send messages and photos to friends and family, allow ChatApp to access your contacts, photos and other media.
                </Text>
              </>
            )}

            {currentPermissionStep === 'notifications' && (
              <>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Allow Notifications?
                </Text>
                <Text
                  style={[
                    styles.modalDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Get notified about new messages and incoming calls so you never miss anything important.
                </Text>
              </>
            )}

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={handlePermissionModalCancel}
                disabled={isRequestingPermission}
                style={[
                  styles.modalButton,
                  styles.cancelButton,
                  {
                    backgroundColor: theme.inputBackground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cancelButtonText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Not now
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePermissionModalConfirm}
                disabled={isRequestingPermission}
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  {
                    backgroundColor:
                      currentPermissionStep === 'media' ? '#20B254' : '#2563EB',
                    opacity: isRequestingPermission ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={styles.confirmButtonText}>
                  {isRequestingPermission ? 'Requesting...' : 'Continue'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  hero: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.xl,
    padding: SPACING.xl,
    ...SHADOWS.sm,
  },
  photoWrap: {
    marginBottom: SPACING.lg,
  },
  photoButton: {
    alignItems: 'center',
    borderRadius: 52,
    borderWidth: 2,
    height: 104,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 104,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  cameraBadge: {
    alignItems: 'center',
    borderRadius: 18,
    bottom: 0,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 36,
  },
  heroText: {
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  heroSubtitle: {
    fontSize: FONT_SIZES.base,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    marginBottom: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  // Modal Styles
  modalOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  modalContent: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    width: '85%',
    ...SHADOWS.lg,
  },
  modalIcon: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    height: 80,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    width: 80,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: FONT_SIZES.base,
    lineHeight: 22,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    paddingVertical: SPACING.md,
  },
  cancelButton: {},
  confirmButton: {},
  cancelButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
});

export default UserSetupScreen;
