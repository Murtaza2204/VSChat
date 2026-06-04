import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState } from '../types';
import { MOCK_USERS } from '../constants/mockData';

interface AuthStore extends AuthState {
  login: (phone: string) => Promise<void>;
  verifyOTP: (otp: string) => Promise<void>;
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
    isLoading: false,
    error: null,

    initializeAuth: async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          set({
            user: JSON.parse(storedUser),
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        console.warn('Failed to load user from storage:', error);
      }
    },

    login: async (phone: string) => {
      set({ isLoading: true, error: null });
      try {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // Mock: Find user by phone or create new one
        const existingUser = MOCK_USERS.find((u) => u.phone.includes(phone.slice(-4)));
        if (existingUser) {
          try {
            await AsyncStorage.setItem('phone', phone);
          } catch (e) {
            console.warn('Could not save phone to storage');
          }
          set({ isLoading: false });
        } else {
          try {
            await AsyncStorage.setItem('phone', phone);
          } catch (e) {
            console.warn('Could not save phone to storage');
          }
          set({ isLoading: false });
        }
      } catch (error: any) {
        set({
          error: error.message || 'Login failed',
          isLoading: false,
        });
        throw error;
      }
    },

    verifyOTP: async (otp: string) => {
      set({ isLoading: true, error: null });
      try {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        let phone = '+1234567890';
        try {
          const storedPhone = await AsyncStorage.getItem('phone');
          if (storedPhone) phone = storedPhone;
        } catch (e) {
          console.warn('Could not retrieve phone from storage');
        }

        // Mock OTP verification (any 6 digits work)
        const mockUser: User = {
          id: Math.random().toString(),
          name: 'User',
          phone,
          status: 'online',
          avatar: '👤',
        };

        try {
          await AsyncStorage.setItem('user', JSON.stringify(mockUser));
        } catch (e) {
          console.warn('Could not save user to storage');
        }

        set({
          user: mockUser,
          isAuthenticated: true,
          isLoading: false,
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
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));

        let currentUser: any = {};
        try {
          const storedUser = await AsyncStorage.getItem('user');
          if (storedUser) {
            currentUser = JSON.parse(storedUser);
          }
        } catch (e) {
          console.warn('Could not retrieve user from storage');
        }

        const updatedUser = {
          ...currentUser,
          ...profileData,
        } as User;

        try {
          await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        } catch (e) {
          console.warn('Could not save user to storage');
        }

        set({
          user: updatedUser,
          isLoading: false,
        });
      } catch (error: any) {
        set({
          error: error.message || 'Profile setup failed',
          isLoading: false,
        });
        throw error;
      }
    },

    logout: async () => {
      set({ isLoading: true });
      try {
        try {
          await AsyncStorage.multiRemove(['user', 'phone']);
        } catch (e) {
          console.warn('Could not clear storage');
        }
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
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
        isLoading: false,
        error: null,
      });
    },
  };
});
