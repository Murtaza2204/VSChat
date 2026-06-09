import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState } from '../types';
import { API_BASE_URL } from '../config/api';
import auth from '@react-native-firebase/auth';

type AuthFlow = 'login' | 'register';

interface AuthStore extends AuthState {
  authFlow: AuthFlow | null;
  confirmation: any | null;
  login: (countryCode: string, phoneNumber: string) => Promise<AuthFlow>;
  verifyOTP: (phoneNumber: string, otp: string) => Promise<void>;
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
    confirmation: null,

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
        // Build E.164 phone number
        const e164 = `${countryCode}${phoneNumber}`;

        // Use Firebase Phone Auth to send SMS
        const confirmation = await auth().signInWithPhoneNumber(e164);

        // Also notify backend to create a server-side OTP (helps fallback verification)
        try {
          const url = `${API_BASE_URL}/auth/send-otp`;
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryCode, phoneNumber }),
          });
        } catch (e: any) {
          console.warn('Backend send-otp failed (non-fatal):', e?.message || e);
        }

        // Determine flow by asking backend (optional) — we can let backend decide after token exchange.
        const authFlow: AuthFlow = 'register';

        try {
          await AsyncStorage.setItem('phone', e164);
          await AsyncStorage.setItem('authFlow', authFlow);
        } catch (e) {
          console.warn('Could not save auth details to storage');
        }

        set({ isLoading: false, authFlow, confirmation });
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
        // Use confirmation object from login to confirm the code
        const state = (await AsyncStorage.getItem('authState')) || null;
        // Prefer in-memory confirmation
        // @ts-ignore
        const confirmation = (useAuthStore.getState && useAuthStore.getState().confirmation) || null;

        if (!confirmation) {
          throw new Error('No confirmation object found. Please request a fresh OTP.');
        }

        // Try Firebase confirmation first
        let data: any = null;
        try {
          const userCredential = await confirmation.confirm(otp);

          // Get Firebase ID token
          const idToken = await userCredential.user.getIdToken();

          // Exchange ID token with backend for app tokens
          const url = `${API_BASE_URL}/auth/verify-firebase-token`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });

          data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.message || 'OTP verification failed');
          }
        } catch (firebaseErr) {
          // Firebase confirmation or backend exchange failed — try server-side OTP verification as fallback
          try {
            const url = `${API_BASE_URL}/auth/verify-otp`;
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phoneNumber, otp }),
            });
            data = await resp.json();
            if (!resp.ok || !data.success) {
              throw new Error(data.message || 'Server OTP verification failed');
            }
          } catch (serverErr) {
            // Log both errors for easier debugging
            console.error('Firebase confirm error:', firebaseErr?.message || firebaseErr);
            console.error('Server verify-otp error:', serverErr?.message || serverErr);
            // Re-throw the most specific error
            throw serverErr || firebaseErr;
          }
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
          return;
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
          displayName: profileData.name || profileData.displayName || '',
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
          await AsyncStorage.multiRemove(['user', 'phone', 'authFlow']);
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
