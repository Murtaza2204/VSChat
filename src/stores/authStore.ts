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
  setupProfile: (user: Partial<User>) => Promise<User | void>;
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

          // If we have a token, fetch the latest user profile from backend to avoid stale cache
          if (token && parsedUser && parsedUser.id) {
            try {
              const res = await fetch(`${API_BASE_URL}/users/${parsedUser.id}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (data) {
                  const latest = {
                    id: data._id || data.id || parsedUser.id,
                    name: data.name || data.displayName || parsedUser.name,
                    phone: data.phoneNumber || parsedUser.phone,
                    avatar: data.profilePictureUrl || parsedUser.avatar || '👤',
                    profileCompleted: true,
                    bio: data.bio || parsedUser.bio || '',
                    profilePictureUrl: data.profilePictureUrl || parsedUser.profilePictureUrl || null,
                  };
                  try {
                    await AsyncStorage.setItem('user', JSON.stringify(latest));
                  } catch (e) { console.warn('Could not save refreshed user to storage', e); }
                  set({ user: latest });
                  // propagate to chat store
                  try { useChatStore.getState().updateUserProfilePicture(latest.id, latest.profilePictureUrl); } catch (e) {}
                }
              }
            } catch (e) { console.warn('Failed to refresh user profile on startup', e); }
          }

          try {
            const chatState = useChatStore.getState();
            chatState.setChats(chatState.chats || []);
          } catch (e) {}

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
                  const message: any = {
                    id: String(msg._id || msg.id),
                    senderId: msg.senderId,
                    senderName: msg.senderName || '',
                    content: msg.content,
                    type: msg.type || 'text',
                    timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                    read: false,
                  };
                  if (msg.replyToId) message.replyToId = msg.replyToId;
                  if (msg.forwarded) {
                    message.forwarded = !!msg.forwarded;
                    message.forwardedFrom = msg.forwardedFrom || null;
                  }

                  if (chatItem) {
                    chatState.addMessage(chatItem.id || convId, message);
                    const updatedChats = chats.map((c) =>
                      (String(c.conversationId) === convId || String(c.id) === convId)
                        ? { ...c, lastMessage: message.content, lastMessageTime: message.timestamp, unreadCount: currentOpen ? 0 : ((c.unreadCount || 0) + 1), lastMessageReaction: undefined, lastMessageActorId: undefined, lastMessageRaw: undefined }
                        : c,
                    );
                    chatState.setChats(updatedChats);
                  } else {
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
                } catch (e) { console.warn('message:receive handler error', e); }
              });

              socket.on('message:sent', (msg) => {
                try {
                  const chatState = useChatStore.getState();
                  const chats = chatState.chats || [];
                  const convId = String(msg.conversationId || msg.conversation);
                  const message: any = {
                    id: String(msg._id || msg.id),
                    senderId: msg.senderId,
                    senderName: msg.senderName || '',
                    content: msg.content,
                    type: msg.type || 'text',
                    timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                    read: false,
                  };
                  if (msg.replyToId) message.replyToId = msg.replyToId;
                  if (msg.forwarded) {
                    message.forwarded = !!msg.forwarded;
                    message.forwardedFrom = msg.forwardedFrom || null;
                  }
                  const chatItem = chats.find((c) => String(c.conversationId) === convId || String(c.id) === convId);
                  if (msg.clientTempId) {
                    chatState.replaceMessageTempId(String(msg.clientTempId), message as any);
                  } else if (chatItem) {
                    chatState.addMessage(chatItem.id || convId, message);
                    chatState.setChats(
                      chats.map((c) =>
                        (String(c.conversationId) === convId || String(c.id) === convId)
                          ? { ...c, lastMessage: message.content, lastMessageTime: message.timestamp, lastMessageReaction: undefined, lastMessageActorId: undefined, lastMessageRaw: undefined }
                          : c,
                      ),
                    );
                  }
                } catch (e) { console.warn('message:sent handler error', e); }
              });

              socket.on('message:status', (status) => {
                try {
                  const chatState = useChatStore.getState();
                  const updates: any = {};
                  // preserve existing status if not provided
                  if (status.status) updates.status = status.status;
                  // support richer payloads from group read handling
                  if (typeof status.readCount === 'number') updates.readCount = status.readCount;
                  if (typeof status.totalRecipients === 'number') updates.totalRecipients = status.totalRecipients;
                  if (status.status === 'seen' || (typeof updates.readCount === 'number' && typeof updates.totalRecipients === 'number' && updates.readCount >= updates.totalRecipients)) {
                    updates.read = true;
                    updates.seenAt = status.seenAt || status.lastSeenAt || new Date();
                  }
                  if (status.deliveredAt) updates.deliveredAt = status.deliveredAt;
                  chatState.updateMessage(String(status.messageId), updates);
                } catch (e) {}
              });

              socket.on('conversation:left', (payload) => {
                try {
                  const chatState = useChatStore.getState();
                  const groupId = payload && payload.groupId;
                  if (!groupId) return;
                  // remove conversation from local list
                  chatState.deleteChatForMe(groupId);
                  // if currently viewing this conversation, clear it
                  const current = chatState.currentChat;
                  if (current && (String(current.conversationId) === String(groupId) || String(current.id) === String(groupId))) {
                    chatState.setCurrentChat(null);
                  }
                } catch (e) { console.warn('conversation:left handler error', e); }
              });
            }
          } catch (e) { console.warn('Socket init failed', e); }
        }
      } catch (error) { console.warn('Failed to load user from storage:', error); }
    },

    login: async (countryCode: string, phoneNumber: string) => {
      set({ isLoading: true, error: null });
      try {
        const fullPhone = `${countryCode}${phoneNumber}`;
        const confirmation = await auth().signInWithPhoneNumber(fullPhone);
        // @ts-ignore
        const verificationId = confirmation.verificationId || null;
        if (verificationId) await AsyncStorage.setItem('verificationId', verificationId);
        try { await AsyncStorage.setItem('phone', fullPhone); } catch (e) { console.warn('Could not save phone to storage'); }
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
            profilePictureUrl: data.user.profilePictureUrl || null,
            profileCompleted: true,
            bio: data.user.bio || '',
          };

          try {
            await AsyncStorage.setItem('user', JSON.stringify(backendUser));
            await AsyncStorage.setItem('accessToken', data.accessToken);
            await AsyncStorage.setItem('refreshToken', data.refreshToken);
          } catch (e) { console.warn('Could not save user or tokens to storage'); }

          try {
            // @ts-ignore
            delete (global as any).__pendingPhoneConfirmation;
            await AsyncStorage.removeItem('verificationId');
          } catch (e) {}

          set({ user: backendUser, isAuthenticated: true, phoneVerified: true, isLoading: false, authFlow: 'login' });
          try { useChatStore.getState().updateUserProfilePicture(backendUser.id, backendUser.profilePictureUrl); } catch (e) {}
          return 'login';
        }

        try { await AsyncStorage.setItem('phone', phoneNumber); await AsyncStorage.setItem('authFlow', data.flow); } catch (e) { console.warn('Could not save auth details to storage'); }

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
        const phone = (await AsyncStorage.getItem('phone')) || profileData.phone;
        if (!phone) throw new Error('Phone number missing');

        // If user is authenticated (has access token), call profile update endpoint
        const token = await AsyncStorage.getItem('accessToken');
        console.info('setupProfile: checking for token...', !!token);
        if (token) {
          console.info('setupProfile: token exists, calling PATCH /users/me');
          const body: any = {
            displayName: profileData.name || undefined,
            bio: profileData.bio !== undefined ? profileData.bio : undefined,
          };

          // If avatar is a remote URL (https) include directly, otherwise if it's a local file URI
          // upload it to backend first via multipart/form-data to /users/profile-picture
          if (profileData.avatar && typeof profileData.avatar === 'string') {
            const val = profileData.avatar;
            if (val.startsWith('http://') || val.startsWith('https://')) {
              body.profilePictureUrl = val;
            } else if (val.startsWith('file://') || val.startsWith('content://')) {
              try {
                const uri = val;
                const form = new FormData();
                // @ts-ignore
                form.append('image', { uri, name: 'profile.jpg', type: 'image/jpeg' });

                const uploadRes = await fetch(`${API_BASE_URL}/users/profile-picture`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                  body: form,
                });

                const uploadData = await uploadRes.json();
                if (uploadRes.ok && uploadData && uploadData.success && uploadData.profilePicture) {
                  body.profilePictureUrl = uploadData.profilePicture;
                } else {
                  console.warn('Profile image upload failed or returned no URL', uploadData);
                }
              } catch (e) {
                console.warn('Profile image upload failed', e);
              }
            }
          }

          console.info('setupProfile PATCH body:', body);
          const res = await fetch(`${API_BASE_URL}/users/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          });
          console.info('setupProfile PATCH response status:', res.status);
          const data = await res.json();
          console.info('setupProfile PATCH response data:', data);
          if (!res.ok || !data.success) {
            const errorMsg = data.message || `Profile update failed (${res.status})`;
            console.error('setupProfile PATCH error:', errorMsg);
            throw new Error(errorMsg);
          }

          const updated = data.user;
          const updatedUser: User = {
            id: updated.id,
            name: updated.displayName || '',
            phone: updated.phoneNumber,
            status: 'offline',
            avatar: updated.profilePictureUrl || '👤',
            profilePictureUrl: updated.profilePictureUrl || null,
            profileCompleted: true,
            bio: updated.bio || '',
          };

          try {
            await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
          } catch (e) { console.warn('Could not save updated user to storage'); }
          set({ user: updatedUser, isLoading: false });
          try { useChatStore.getState().updateUserProfilePicture(updatedUser.id, updatedUser.profilePictureUrl); } catch (e) {}
          return updatedUser;
        }

        // Registration flow (no access token present)
        let profilePictureUrl: string | undefined;
        if (profileData.avatar && typeof profileData.avatar === 'string') {
          const val = profileData.avatar;
          if (!val.startsWith('file://')) profilePictureUrl = val;
        }

        let profilePictureUrlToSend = profilePictureUrl;

        if (!profilePictureUrlToSend && profileData.avatar && String(profileData.avatar).startsWith('file://')) {
          const uri = profileData.avatar as string;
          try {
            console.info('Uploading local file URI to backend:', uri);
            const form = new FormData();
            // @ts-ignore
            form.append('file', { uri, name: 'profile.jpg', type: 'image/jpeg' });

            const uploadRes = await fetch(`${API_BASE_URL}/auth/upload-profile`, {
              method: 'POST',
              body: form,
            });

            const uploadData = await uploadRes.json();
            console.info('UPLOAD_PROFILE response', uploadRes.status, uploadData);
            if (uploadRes.ok && uploadData.success) profilePictureUrlToSend = uploadData.url;
          } catch (e) { console.warn('Profile image upload failed, continuing without image', e); }
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
          profilePictureUrl: data.user.profilePictureUrl || null,
          profileCompleted: true,
          bio: data.user.bio || '',
        };

        try {
          await AsyncStorage.setItem('user', JSON.stringify(newUser));
          await AsyncStorage.setItem('accessToken', data.accessToken);
          await AsyncStorage.setItem('refreshToken', data.refreshToken);
        } catch (e) { console.warn('Could not save registered user or tokens to storage'); }

        set({ user: newUser, isAuthenticated: true, isLoading: false, authFlow: null });
        try { useChatStore.getState().updateUserProfilePicture(newUser.id, newUser.profilePictureUrl); } catch (e) {}
        return newUser;
      } catch (error: any) {
        set({ isLoading: false, error: error.message || 'Profile setup failed' });
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
            } catch (e) { console.warn('Failed to unregister device token on logout', e); }
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
        } catch (e) { console.warn('Could not clear storage'); }
        set({
          user: null,
          isAuthenticated: false,
          phoneVerified: false,
          isLoading: false,
          error: null,
          authFlow: null,
        });
      } catch (error: any) {
        set({ error: error.message || 'Logout failed', isLoading: false });
        throw error;
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

export default useAuthStore;
