import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import messaging from '@react-native-firebase/messaging';
import { User, AuthState } from '../types';
import { connectSocket } from '../utils/socket';
import { useChatStore } from './chatStore';
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
        const token = await AsyncStorage.getItem('accessToken');
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

          // initialize socket connection for real-time updates
          try {
            if (token) {
              const socket = connectSocket(token);
              socket.on('connect', () => console.info('Socket connected'));

              socket.on('message:receive', (msg) => {
                try {
                  const chatState = useChatStore.getState();
                  const chats = chatState.chats || [];
                  const convId = String(msg.conversationId || msg.conversation);
                  const currentOpen = chatState.currentChat && (String(chatState.currentChat.conversationId || chatState.currentChat.id) === convId);
                  const chatItem = chats.find((c) => String(c.conversationId) === convId || String(c.id) === convId);
                  const message = {
                    id: String(msg._id || msg.id),
                    senderId: msg.senderId,
                    senderName: msg.senderName || '',
                    content: msg.content,
                    type: msg.type || 'text',
                    timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                    read: false,
                  };

                  if (chatItem) {
                    chatState.addMessage(chatItem.id || convId, message);
                    // also bump lastMessage
                    const updatedChats = chats.map((c) =>
                      (String(c.conversationId) === convId || String(c.id) === convId)
                        ? { ...c, lastMessage: message.content, lastMessageTime: message.timestamp, unreadCount: currentOpen ? 0 : ((c.unreadCount || 0) + 1) }
                        : c,
                    );
                    chatState.setChats(updatedChats);
                  } else {
                    // optional: add a lightweight chat entry
                    const newChat = {
                      id: convId,
                      conversationId: convId,
                      title: msg.senderName || 'Unknown',
                      avatar: undefined,
                      lastMessage: message.content,
                      lastMessageTime: message.timestamp,
                      isGroup: false,
                      participants: [],
                      messages: [message],
                      unreadCount: currentOpen ? 0 : 1,
                    };
                    chatState.setChats([newChat, ...chats]);
                  }
                } catch (e) {
                  console.warn('message:receive handler error', e);
                }
              });

              socket.on('message:sent', (msg) => {
                try {
                  const chatState = useChatStore.getState();
                  const chats = chatState.chats || [];
                  const convId = String(msg.conversationId || msg.conversation);
                  const message = {
                    id: String(msg._id || msg.id),
                    senderId: msg.senderId,
                    senderName: msg.senderName || '',
                    content: msg.content,
                    type: msg.type || 'text',
                    timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                    read: false,
                  };
                  const chatItem = chats.find((c) => String(c.conversationId) === convId || String(c.id) === convId);
                  if (msg.clientTempId) {
                    // reconcile optimistic message
                    chatState.replaceMessageTempId(String(msg.clientTempId), message as any);
                  } else if (chatItem) {
                    chatState.addMessage(chatItem.id || convId, message);
                    chatState.setChats(
                      chats.map((c) =>
                        (String(c.conversationId) === convId || String(c.id) === convId)
                          ? { ...c, lastMessage: message.content, lastMessageTime: message.timestamp }
                          : c,
                      ),
                    );
                  }
                } catch (e) {
                  console.warn('message:sent handler error', e);
                }
              });

              socket.on('message:status', (status) => {
                try {
                  const chatState = useChatStore.getState();
                  // update message status by id across chats
                  const updates: any = { status: status.status };
                  if (status.status === 'seen') {
                    updates.read = true;
                    updates.seenAt = status.seenAt || status.lastSeenAt || new Date();
                  } else if (status.deliveredAt) {
                    updates.deliveredAt = status.deliveredAt;
                  }
                  chatState.updateMessage(String(status.messageId), updates);
                } catch (e) {}
              });
            }
          } catch (e) {
            console.warn('Socket init failed', e);
          }
        }
      } catch (error) {
        console.warn('Failed to load user from storage:', error);
      }
    },

    login: async (countryCode: string, phoneNumber: string) => {
      set({ isLoading: true, error: null });
      try {
        const fullPhone = `${countryCode}${phoneNumber}`;
        // Trigger Firebase to send SMS
        const confirmation = await auth().signInWithPhoneNumber(fullPhone);

        // Persist verificationId as fallback
        // @ts-ignore
        const verificationId = confirmation.verificationId || null;
        if (verificationId) await AsyncStorage.setItem('verificationId', verificationId);
        try { await AsyncStorage.setItem('phone', fullPhone); } catch (e) { console.warn('Could not save phone to storage'); }

        // Store confirmation for in-memory confirmation flow
        // @ts-ignore
        (global as any).__pendingPhoneConfirmation = confirmation;

        set({ isLoading: false, authFlow: 'register' });
        return 'register';
      } catch (error: any) {
        set({ error: error.message || 'Failed to start phone verification', isLoading: false });
        throw error;
      }
    },

    verifyOTP: async (phoneNumber: string, otp: string) => {
      set({ isLoading: true, error: null });
      try {
        // Try in-memory confirmation first
        // @ts-ignore
        let confirmation = (global as any).__pendingPhoneConfirmation;
        let userCredential: any = null;

        if (confirmation && typeof confirmation.confirm === 'function') {
          userCredential = await confirmation.confirm(otp);
        } else {
          const verificationId = await AsyncStorage.getItem('verificationId');
          if (!verificationId) throw new Error('Verification session missing. Please resend the code.');
          // @ts-ignore
          const credential = auth.PhoneAuthProvider.credential(verificationId, otp);
          userCredential = await auth().signInWithCredential(credential);
        }

        const idToken = await userCredential.user.getIdToken();

        const response = await fetch(`${API_BASE_URL}/auth/verify-firebase-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Firebase verification failed');

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

          // Clear any in-memory confirmation and stored verificationId
          try {
            // @ts-ignore
            delete (global as any).__pendingPhoneConfirmation;
            await AsyncStorage.removeItem('verificationId');
          } catch (e) {}

          set({ user: backendUser, isAuthenticated: true, phoneVerified: true, isLoading: false, authFlow: 'login' });
          return 'login';
        }

        try { await AsyncStorage.setItem('phone', phoneNumber); await AsyncStorage.setItem('authFlow', data.flow); } catch (e) { console.warn('Could not save auth details to storage'); }

        // Clear any in-memory confirmation and stored verificationId
        try {
          // @ts-ignore
          delete (global as any).__pendingPhoneConfirmation;
          await AsyncStorage.removeItem('verificationId');
        } catch (e) {}

        set({ user: null, isAuthenticated: false, phoneVerified: true, isLoading: false, authFlow: data.flow });
        return data.flow as AuthFlow;
      } catch (error: any) {
        set({ error: error.message || 'OTP verification failed', isLoading: false });
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
          const state = useAuthStore.getState();
          const currentUser = state.user;
          if (currentUser) {
            try {
              const fcmToken = await messaging().getToken();
              await fetch(`${API_BASE_URL}/notifications/devices/unregister`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, deviceId: 'primary', fcmToken }),
              });
            } catch (e) {
              console.warn('Failed to unregister device token on logout', e);
            }
          }
        } catch (e) {}
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
