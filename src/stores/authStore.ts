import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState } from '../types';
import { API_BASE_URL } from '../config/api';

type AuthFlow = 'login' | 'register';

interface AuthStore extends AuthState {
  authFlow: AuthFlow | null;
  login: (countryCode: string, phoneNumber: string) => Promise<AuthFlow>;
  verifyOTP: (phoneNumber: string, otp: string) => Promise<AuthFlow>;
  setupProfile: (user: Partial<User>) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => {
  return {
    user: null,
    isAuthenticated: false,
    phoneVerified: false,
    isLoading: false,
    error: null,
    authFlow: null,

    initializeAuth: async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        const storedAuthFlow = await AsyncStorage.getItem('authFlow');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          set({
            user: parsedUser,
            isAuthenticated: !!parsedUser.profileCompleted,
            phoneVerified: true,
            isLoading: false,
            error: null,
            authFlow: storedAuthFlow === 'login' || storedAuthFlow === 'register' ? storedAuthFlow : null,
          });
        }
      } catch (error) {
        console.warn('Failed to load user from storage:', error);
      }
    },

    login: async (countryCode: string, phoneNumber: string) => {
      set({ isLoading: true, error: null });
      try {
        const e164 = `${countryCode}${phoneNumber}`;
        const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ countryCode, phoneNumber }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Failed to send OTP');
        }

        const authFlow = data.flow as AuthFlow;

        try {
          await AsyncStorage.setItem('phone', e164);
          await AsyncStorage.setItem('authFlow', authFlow);
        } catch (e) {
          console.warn('Could not save auth details to storage');
        }

        set({ isLoading: false, authFlow });
        return authFlow;
      } catch (error: any) {
        set({
          error: error.message || 'Failed to send OTP',
          isLoading: false,
        });
        throw error;
      }
    },

    verifyOTP: async (phoneNumber: string, otp: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber, otp }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'OTP verification failed');
        }

        // If backend returned tokens + user (existing user), persist them
        if (data.flow === 'login' && data.user && data.accessToken && data.refreshToken) {
          const backendUser: User = {
            id: data.user.id,
            name: data.user.displayName || '',
            phone: data.user.phoneNumber,
            status: data.user.status?.online ? 'online' : 'offline',
            avatar: data.user.profilePictureUrl || '👤',
            profileCompleted: true,
          };

          try {
            await AsyncStorage.setItem('user', JSON.stringify(backendUser));
            await AsyncStorage.setItem('accessToken', data.accessToken);
            await AsyncStorage.setItem('refreshToken', data.refreshToken);
          } catch (e) {
            console.warn('Could not save user or tokens to storage');
          }

          set({
            user: backendUser,
            isAuthenticated: true,
            phoneVerified: true,
            isLoading: false,
            authFlow: 'login',
          });
          return 'login';
        }

        // Otherwise, registration flow
        try {
          await AsyncStorage.setItem('phone', phoneNumber);
          await AsyncStorage.setItem('authFlow', data.flow);
        } catch (e) {
          console.warn('Could not save auth details to storage');
        }

        set({
          user: null,
          isAuthenticated: false,
          phoneVerified: true,
          isLoading: false,
          authFlow: data.flow,
        });
        return data.flow as AuthFlow;
      } catch (error: any) {
        set({
          error: error.message || 'OTP verification failed',
          isLoading: false,
        });
        throw error;
      }
    },

    setupProfile: async (profileData: Partial<User>) => {
      set({ isLoading: true, error: null });
      try {
        // Read phone from storage (set during verifyOTP)
        const phone = (await AsyncStorage.getItem('phone')) || profileData.phone;
        if (!phone) throw new Error('Phone number missing for registration');

        // If the selected image is a local file URI (file://...), do not send it
        // Frontend should upload images to a CDN or serve them over http(s) before sending.
        let profilePictureUrl: string | undefined;
        if (profileData.avatar && typeof profileData.avatar === 'string') {
          const val = profileData.avatar;
          if (!val.startsWith('file://')) profilePictureUrl = val;
        }

        let profilePictureUrlToSend = profilePictureUrl;

        // If we have a local file URI, upload it to backend Cloudinary endpoint first
        if (!profilePictureUrlToSend && profileData.avatar && String(profileData.avatar).startsWith('file://')) {
          const uri = profileData.avatar as string;
          try {
            console.info('Uploading local file URI to backend:', uri);
            const form = new FormData();
            // React Native expects an object with uri, name and type
            // @ts-ignore
            form.append('file', { uri, name: 'profile.jpg', type: 'image/jpeg' });

            const uploadRes = await fetch(`${API_BASE_URL}/auth/upload-profile`, {
              method: 'POST',
              // Note: do NOT set Content-Type header; fetch will set the multipart boundary
              body: form,
            });

            const uploadData = await uploadRes.json();
            console.info('UPLOAD_PROFILE response', uploadRes.status, uploadData);
            if (uploadRes.ok && uploadData.success) profilePictureUrlToSend = uploadData.url;
          } catch (e) {
            console.warn('Profile image upload failed, continuing without image', e);
          }
        }

        const body = {
          phoneNumber: phone,
          displayName: profileData.name || '',
          profilePictureUrl: profilePictureUrlToSend,
        };

        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Registration failed');

        const newUser: User = {
          id: data.user.id,
          name: data.user.displayName || '',
          phone: data.user.phoneNumber,
          status: data.user.status?.online ? 'online' : 'offline',
          avatar: data.user.profilePictureUrl || '👤',
          profileCompleted: true,
        };

        try {
          await AsyncStorage.setItem('user', JSON.stringify(newUser));
          await AsyncStorage.setItem('accessToken', data.accessToken);
          await AsyncStorage.setItem('refreshToken', data.refreshToken);
        } catch (e) {
          console.warn('Could not save registered user or tokens to storage');
        }

        set({ user: newUser, isAuthenticated: true, isLoading: false, authFlow: null });
      } catch (error: any) {
        set({ error: error.message || 'Profile setup failed', isLoading: false });
        throw error;
      }
    },

    logout: async () => {
      set({ isLoading: true });
      try {
        try {
          await Promise.all([
            AsyncStorage.removeItem('user'),
            AsyncStorage.removeItem('phone'),
            AsyncStorage.removeItem('authFlow'),
            AsyncStorage.removeItem('accessToken'),
            AsyncStorage.removeItem('refreshToken'),
          ]);
        } catch (e) {
          console.warn('Could not clear storage');
        }
        set({
          user: null,
          isAuthenticated: false,
          phoneVerified: false,
          isLoading: false,
          error: null,
          authFlow: null,
        });
      } catch (error: any) {
        set({
          error: error.message || 'Logout failed',
          isLoading: false,
        });
      }
    },

    setError: (error: string | null) => {
      set({ error });
    },

    setLoading: (loading: boolean) => {
      set({ isLoading: loading });
    },

    clearAuth: () => {
      set({
        user: null,
        isAuthenticated: false,
        phoneVerified: false,
        isLoading: false,
        error: null,
        authFlow: null,
      });
    },
  };
});
