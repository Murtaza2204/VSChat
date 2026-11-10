import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import messaging from '@react-native-firebase/messaging';
import { User, AuthState } from '../types';
import { connectSocket } from '../utils/socket';
import { useChatStore } from './chatStore';
import { API_BASE_URL } from '../config/api';
import api from '../config/api';

type AuthFlow = 'login' | 'register';

type ApprovalStatus = 'approved' | 'pending' | 'rejected';

type PendingPhoneAuthSession = {
  phoneNumber: string;
  verificationId: string;
  requestId: number;
  userUidBeforeRequest: string | null;
  autoVerifiedUser: any | null;
};

const maskVerificationId = (verificationId: string) =>
  `${verificationId.slice(0, 6)}...${verificationId.slice(-4)}`;

const normalizeApprovalStatus = (value: any, fallback: ApprovalStatus = 'approved'): ApprovalStatus => {
  if (value === 'approved' || value === 'pending' || value === 'rejected') {
    return value;
  }
  return fallback;
};

const buildUserFromApi = (data: any, fallback: Partial<User> = {}): User => {
  const approvalStatus = normalizeApprovalStatus(
    data?.approvalStatus,
    normalizeApprovalStatus((fallback as any)?.approvalStatus, 'approved'),
  );

  return {
    id: String(data?.id || data?._id || fallback.id || ''),
    name: data?.displayName || data?.name || fallback.name || '',
    phone: data?.phoneNumber || data?.phone || fallback.phone || '',
    status: (fallback.status as User['status']) || 'offline',
    avatar: data?.profilePictureUrl || fallback.avatar || '👤',
    profilePictureUrl: data?.profilePictureUrl || fallback.profilePictureUrl || null,
    profileCompleted: true,
    bio: data?.bio || fallback.bio || '',
    approvalStatus,
    approvalRequestedAt: data?.approvalRequestedAt || fallback.approvalRequestedAt || data?.createdAt || null,
    approvalReviewedAt: data?.approvalReviewedAt || fallback.approvalReviewedAt || null,
  };
};

const buildSessionUser = (data: any, fallback: Partial<User> = {}) =>
  buildUserFromApi(data, fallback);

const fetchApprovalSnapshot = async () => {
  try {
    const response = await api.get('/users/me/approval-status');
    if (response.data?.success && response.data?.user) {
      return response.data.user;
    }
  } catch (error) {
    // fall back to the cached user if the status endpoint is unavailable
  }

  return null;
};

interface AuthStore extends AuthState {
  authFlow: AuthFlow | null;
  login: (countryCode: string, phoneNumber: string) => Promise<AuthFlow>;
  resendOTP: (phoneNumber: string) => Promise<void>;
  verifyOTP: (phoneNumber: string, otp: string) => Promise<AuthFlow>;
  setupProfile: (user: Partial<User>) => Promise<User | void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => {
  let authRequestId = 0;
  let authRequestInFlight = false;
  let pendingPhoneAuthSession: PendingPhoneAuthSession | null = null;
  let removePhoneAuthStateListener: (() => void) | null = null;

  const requestPhoneAuthSession = async (
    phoneNumber: string,
    forceResend: boolean,
  ): Promise<PendingPhoneAuthSession> => {
    const requestId = ++authRequestId;
    authRequestInFlight = true;
    pendingPhoneAuthSession = null;
    removePhoneAuthStateListener?.();
    removePhoneAuthStateListener = null;
    let userUidBeforeRequest = auth().currentUser?.uid || null;
    let autoVerifiedUser: any | null = null;
    console.info('[PhoneAuth] request started', { requestId, phoneNumber, forceResend });

    try {
      // Phone verification must start from a signed-out Firebase state.
      // Otherwise Android can auto-verify the new SMS into the existing user,
      // making it impossible to distinguish that result from the old session.
      if (auth().currentUser) {
        const previousUid = userUidBeforeRequest;
        await auth().signOut();
        userUidBeforeRequest = null;
        console.info('[PhoneAuth] cleared existing Firebase user before request', {
          requestId,
          previousUid,
        });
      }
      removePhoneAuthStateListener = auth().onAuthStateChanged((user) => {
        const userPhone = user?.phoneNumber?.replace(/\s/g, '');
        if (
          requestId === authRequestId &&
          user &&
          userPhone === phoneNumber
        ) {
          autoVerifiedUser = user;
          if (pendingPhoneAuthSession?.requestId === requestId) {
            pendingPhoneAuthSession.autoVerifiedUser = user;
          }
          console.info('[PhoneAuth] native auto-verification observed', { requestId });
        }
      });
      const confirmation = await auth().signInWithPhoneNumber(phoneNumber, forceResend);
      const verificationId = confirmation.verificationId;
      if (!verificationId) {
        throw new Error('Firebase did not return a verification session. Please try again.');
      }

      const session: PendingPhoneAuthSession = {
        phoneNumber,
        verificationId,
        requestId,
        userUidBeforeRequest,
        autoVerifiedUser,
      };

      // An older request may resolve after a newer request. It must never become
      // the session used by the OTP screen.
      if (requestId !== authRequestId) {
        console.warn('[PhoneAuth] stale request ignored', {
          requestId,
          currentRequestId: authRequestId,
        });
        throw new Error('A newer verification request is already active. Please use its code.');
      }

      pendingPhoneAuthSession = session;
      console.info('[PhoneAuth] session activated', {
        requestId,
        verificationId: maskVerificationId(verificationId),
      });
      authRequestInFlight = false;
      return session;
    } catch (error) {
      if (requestId === authRequestId) {
        authRequestInFlight = false;
      }
      console.error('[PhoneAuth] request failed', { requestId, error });
      throw error;
    }
  };

  return {
    user: null,
    isAuthenticated: false,
    phoneVerified: false,
    isLoading: false,
    error: null,
    isHydrated: false,
    authFlow: null,

    initializeAuth: async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        const storedAuthFlow = await AsyncStorage.getItem('authFlow');
        const token = await AsyncStorage.getItem('accessToken');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          const normalizedStoredUser: User = {
            ...parsedUser,
            approvalStatus: normalizeApprovalStatus(
              parsedUser.approvalStatus,
              parsedUser.profileCompleted ? 'approved' : 'pending',
            ),
          };
          set({
            user: normalizedStoredUser,
            // isAuthenticated: normalizedStoredUser.approvalStatus === 'approved' && !!normalizedStoredUser.profileCompleted,
            isAuthenticated: !!normalizedStoredUser.profileCompleted,
            phoneVerified: true,
            isLoading: false,
            error: null,
            authFlow: storedAuthFlow === 'login' || storedAuthFlow === 'register' ? storedAuthFlow : null,
          });

          // If we have a token, fetch the latest user profile from backend to avoid stale cache
          if (false && token && parsedUser && parsedUser.id) {
            try {
              const res = await fetch(`${API_BASE_URL}/users/${parsedUser.id}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const data = await res.json();
                if (data) {
                  const latest: any = {
                    id: data._id || data.id || parsedUser.id,
                    name: data.name || data.displayName || parsedUser.name,
                    phone: data.phoneNumber || parsedUser.phone,
                    status: 'offline',
                    avatar: data.profilePictureUrl || parsedUser.avatar || '👤',
                    profileCompleted: true,
                    bio: data.bio || parsedUser.bio || '',
                    profilePictureUrl: data.profilePictureUrl || parsedUser.profilePictureUrl || null,
                    approvalStatus: normalizedStoredUser.approvalStatus,
                  };
                  try {
                    await AsyncStorage.setItem('user', JSON.stringify(latest));
                  } catch (e) { console.warn('Could not save refreshed user to storage', e); }
                  set({ user: latest });
                  // propagate to chat store
                  try { (useChatStore.getState() as any).updateUserProfilePicture(latest.id, latest.profilePictureUrl); } catch (e) {}
                }
              }
            } catch (e) { console.warn('Failed to refresh user profile on startup', e); }
          }

          try {
            if (token && normalizedStoredUser.id) {
              const statusPayload = await fetchApprovalSnapshot();
              if (statusPayload) {
                const latest = buildSessionUser(statusPayload, normalizedStoredUser);
                try {
                  await AsyncStorage.setItem('user', JSON.stringify(latest));
                } catch (e) { console.warn('Could not save refreshed approval state to storage', e); }

                // const isApproved = latest.approvalStatus === 'approved' && !!latest.profileCompleted;
                const isApproved = !!latest.profileCompleted;
                set({
                  user: latest,
                  isAuthenticated: isApproved,
                  phoneVerified: true,
                });
                try { (useChatStore.getState() as any).updateUserProfilePicture(latest.id, latest.profilePictureUrl); } catch (e) {}
              }
            }
          } catch (e) {
            console.warn('Failed to refresh approval status on startup', e);
          }

          try {
            const chatState = useChatStore.getState();
            chatState.setChats(chatState.chats || []);
          } catch (e) {}

          try {
            if (token) {
              const socket = connectSocket(token);
              socket.on('connect', () => console.info('Socket connected'));

              socket.on('message:receive', (msg: any) => {
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
                    systemEventType: msg.systemEventType || msg.metadata?.systemEventType,
                    systemActorId: msg.systemActorId || msg.metadata?.systemActorId,
                    systemActorName: msg.systemActorName || msg.metadata?.systemActorName,
                    systemTargetIds: msg.systemTargetIds || msg.metadata?.systemTargetIds,
                    systemTargetNames: msg.systemTargetNames || msg.metadata?.systemTargetNames,
                    systemAudienceIds: msg.systemAudienceIds || msg.metadata?.systemAudienceIds,
                    systemData: msg.systemData || msg.metadata?.systemData,
                  };
                  if (msg.replyToId) message.replyToId = msg.replyToId;
                  if (msg.forwarded) {
                    message.forwarded = !!msg.forwarded;
                    message.forwardedFrom = msg.forwardedFrom || null;
                  }

                  if (chatItem) {
                    chatState.addMessage(chatItem.id || convId, message);
                    if (msg.type !== 'system') {
                      const updatedChats = chats.map((c) =>
                        (String(c.conversationId) === convId || String(c.id) === convId)
                          ? {
                            ...c,
                            lastMessage: message.content,
                            lastMessageTime: message.timestamp,
                            unreadCount: currentOpen ? 0 : ((c.unreadCount || 0) + 1),
                            lastMessageReaction: undefined,
                            lastMessageActorId: undefined,
                            lastMessageRaw: undefined,
                          }
                          : c,
                      );
                      chatState.setChats(updatedChats);
                    }
                  } else if (msg.type !== 'system') {
                    const newChat = {
                      id: convId,
                      conversationId: convId,
                      title: msg.type === 'system' ? 'Group' : (msg.senderName || 'Unknown'),
                      avatar: undefined,
                      lastMessage: message.content,
                      lastMessageTime: message.timestamp,
                      isGroup: msg.type === 'system',
                      participants: [],
                      messages: [message],
                      unreadCount: msg.type === 'system' ? 0 : (currentOpen ? 0 : 1),
                    };
                    chatState.setChats([newChat, ...chats]);
                  }
                } catch (e) { console.warn('message:receive handler error', e); }
              });

              socket.on('message:sent', (msg: any) => {
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
                    systemEventType: msg.systemEventType || msg.metadata?.systemEventType,
                    systemActorId: msg.systemActorId || msg.metadata?.systemActorId,
                    systemActorName: msg.systemActorName || msg.metadata?.systemActorName,
                    systemTargetIds: msg.systemTargetIds || msg.metadata?.systemTargetIds,
                    systemTargetNames: msg.systemTargetNames || msg.metadata?.systemTargetNames,
                    systemAudienceIds: msg.systemAudienceIds || msg.metadata?.systemAudienceIds,
                    systemData: msg.systemData || msg.metadata?.systemData,
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
                    if (msg.type !== 'system') {
                      chatState.setChats(
                        chats.map((c) =>
                          (String(c.conversationId) === convId || String(c.id) === convId)
                            ? {
                              ...c,
                              lastMessage: message.content,
                              lastMessageTime: message.timestamp,
                              lastMessageReaction: undefined,
                              lastMessageActorId: undefined,
                              lastMessageRaw: undefined,
                            }
                            : c,
                        ),
                      );
                    }
                  }
                } catch (e) { console.warn('message:sent handler error', e); }
              });

              socket.on('message:status', (status: any) => {
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

              socket.on('conversation:left', (payload: any) => {
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
      } catch (error) { console.warn('Failed to load user from storage:', error); } finally { set({ isHydrated: true }); }
    },

    login: async (countryCode: string, phoneNumber: string) => {
      set({ isLoading: true, error: null });
      try {
        const fullPhone = `${countryCode}${phoneNumber}`.replace(/\s/g, '');
        await requestPhoneAuthSession(fullPhone, false);
        set({ isLoading: false, authFlow: 'register' });
        return 'register';
      } catch (error: any) {
        set({ error: error.message || 'Failed to start phone verification', isLoading: false });
        throw error;
      }
    },

    resendOTP: async (phoneNumber: string) => {
      set({ isLoading: true, error: null });
      try {
        await requestPhoneAuthSession(phoneNumber.replace(/\s/g, ''), true);
        set({ isLoading: false });
      } catch (error: any) {
        set({ error: error.message || 'Failed to resend verification code', isLoading: false });
        throw error;
      }
    },

    verifyOTP: async (phoneNumber: string, otp: string) => {
      set({ isLoading: true, error: null });
      try {
        const normalizedPhone = phoneNumber.replace(/\s/g, '');
        if (pendingPhoneAuthSession?.phoneNumber !== normalizedPhone) {
          pendingPhoneAuthSession = null;
        }

        const session = pendingPhoneAuthSession;
        if (!session && authRequestInFlight) {
          throw new Error('A verification request is still in progress. Please wait for the latest code.');
        }

        if (!session) {
          throw new Error('Verification session missing. Please resend the code.');
        }

        const requestIdAtVerification = session.requestId;
        console.info('[PhoneAuth] verification started', {
          requestId: requestIdAtVerification,
          verificationId: maskVerificationId(session.verificationId),
        });
        const autoVerifiedUser = auth().currentUser;
        const verifiedUser = session.autoVerifiedUser || autoVerifiedUser;
        const autoVerifiedPhone = verifiedUser?.phoneNumber?.replace(/\s/g, '');
        const wasAutoVerifiedForThisRequest =
          !!verifiedUser &&
          verifiedUser.uid !== session.userUidBeforeRequest &&
          autoVerifiedPhone === normalizedPhone;
        const userCredential = wasAutoVerifiedForThisRequest
          ? { user: verifiedUser }
          : await auth().signInWithCredential(
            auth.PhoneAuthProvider.credential(session.verificationId, otp),
          );
        removePhoneAuthStateListener?.();
        removePhoneAuthStateListener = null;
        if (wasAutoVerifiedForThisRequest) {
          console.info('[PhoneAuth] using native auto-verification result', {
            requestId: requestIdAtVerification,
          });
        }
        if (
          requestIdAtVerification !== authRequestId ||
          pendingPhoneAuthSession?.requestId !== requestIdAtVerification
        ) {
          console.warn('[PhoneAuth] verification result rejected as stale', {
            requestId: requestIdAtVerification,
            currentRequestId: authRequestId,
          });
          throw new Error('A newer verification code was requested. Please use the latest code.');
        }
        console.info('[PhoneAuth] verification accepted', {
          requestId: requestIdAtVerification,
          verificationId: maskVerificationId(session.verificationId),
        });

        const idToken = await userCredential.user.getIdToken();

        const response = await fetch(`${API_BASE_URL}/auth/verify-firebase-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Firebase verification failed');

        if (data.flow === 'login' && data.user && data.accessToken && data.refreshToken) {
          let backendUser: User = {
            id: data.user.id,
            name: data.user.displayName || '',
            phone: data.user.phoneNumber,
            status: data.user.status?.online ? 'online' : 'offline',
            avatar: data.user.profilePictureUrl || '👤',
            profilePictureUrl: data.user.profilePictureUrl || null,
            profileCompleted: true,
            bio: data.user.bio || '',
            approvalStatus: normalizeApprovalStatus(data.user.approvalStatus, 'approved'),
            approvalRequestedAt: data.user.approvalRequestedAt || data.user.createdAt || null,
            approvalReviewedAt: data.user.approvalReviewedAt || null,
          };

          try {
            await AsyncStorage.setItem('user', JSON.stringify(backendUser));
            await AsyncStorage.setItem('accessToken', data.accessToken);
            await AsyncStorage.setItem('refreshToken', data.refreshToken);
          } catch (e) { console.warn('Could not save user or tokens to storage'); }

          try {
            const approvalPayload = await fetchApprovalSnapshot();
            if (approvalPayload) {
              backendUser = buildSessionUser(approvalPayload, backendUser);
              await AsyncStorage.setItem('user', JSON.stringify(backendUser));
            }
          } catch (e) {
            console.warn('Could not refresh approval status after login', e);
          }

          try {
            pendingPhoneAuthSession = null;
          } catch (e) {}

          set({
            user: backendUser,
            // isAuthenticated: backendUser.approvalStatus === 'approved',
            isAuthenticated: true,
            phoneVerified: true,
            isLoading: false,
            authFlow: 'login',
          });
          try { (useChatStore.getState() as any).updateUserProfilePicture(backendUser.id, backendUser.profilePictureUrl); } catch (e) {}
          return 'login';
        }

        try { await AsyncStorage.setItem('phone', phoneNumber); await AsyncStorage.setItem('authFlow', data.flow); } catch (e) { console.warn('Could not save auth details to storage'); }

        try {
          pendingPhoneAuthSession = null;
          await AsyncStorage.removeItem('verificationId');
        } catch (e) {}

        set({ user: null, isAuthenticated: false, phoneVerified: true, isLoading: false, authFlow: data.flow });
        return data.flow as AuthFlow;
      } catch (error: any) {
        console.error('[PhoneAuth] verification failed', {
          requestId: pendingPhoneAuthSession?.requestId ?? authRequestId,
          error,
        });
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

                const uploadRes = await api.post('/users/profile-picture', form, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });

                const uploadData = uploadRes.data;
                if (uploadData && uploadData.success && uploadData.profilePicture) {
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
          try {
            const res = await api.patch('/users/me', body);
            const data = res.data;
            console.info('setupProfile PATCH response status:', res.status);
            console.info('setupProfile PATCH response data:', data);
            if (!data.success) {
              const errorMsg = data.message || 'Profile update failed';
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
              approvalStatus: normalizeApprovalStatus(get().user?.approvalStatus, 'approved'),
              approvalRequestedAt: get().user?.approvalRequestedAt || null,
              approvalReviewedAt: get().user?.approvalReviewedAt || null,
            };

            try {
              await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
            } catch (e) { console.warn('Could not save updated user to storage'); }
            set({
              user: updatedUser,
              isLoading: false,
              // isAuthenticated: normalizeApprovalStatus(get().user?.approvalStatus, 'approved') === 'approved',
              isAuthenticated: true,
            });
            try { (useChatStore.getState() as any).updateUserProfilePicture(updatedUser.id, updatedUser.profilePictureUrl); } catch (e) {}
            return updatedUser;
          } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message || 'Profile update failed';
            console.error('setupProfile PATCH error:', errorMsg);
            throw new Error(errorMsg);
          }
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

        let newUser: User = {
          id: data.user.id,
          name: data.user.displayName || '',
          phone: data.user.phoneNumber,
          status: data.user.status?.online ? 'online' : 'offline',
          avatar: data.user.profilePictureUrl || '👤',
          profilePictureUrl: data.user.profilePictureUrl || null,
          profileCompleted: true,
          bio: data.user.bio || '',
          approvalStatus: normalizeApprovalStatus(data.user.approvalStatus, 'approved'),
          approvalRequestedAt: data.user.approvalRequestedAt || data.user.createdAt || null,
          approvalReviewedAt: data.user.approvalReviewedAt || null,
        };

        try {
          await AsyncStorage.setItem('user', JSON.stringify(newUser));
          await AsyncStorage.setItem('accessToken', data.accessToken);
          await AsyncStorage.setItem('refreshToken', data.refreshToken);
        } catch (e) { console.warn('Could not save registered user or tokens to storage'); }

        try {
          const approvalPayload = await fetchApprovalSnapshot();
          if (approvalPayload) {
            newUser = buildSessionUser(approvalPayload, newUser);
            await AsyncStorage.setItem('user', JSON.stringify(newUser));
          }
        } catch (e) {
          console.warn('Could not refresh approval status after registration', e);
        }

        set({
          user: newUser,
          // isAuthenticated: newUser.approvalStatus === 'approved',
          isAuthenticated: true,
          isLoading: false,
          authFlow: null,
          phoneVerified: true,
        });
        try { (useChatStore.getState() as any).updateUserProfilePicture(newUser.id, newUser.profilePictureUrl); } catch (e) {}
        return newUser;
      } catch (error: any) {
        set({ isLoading: false, error: error.message || 'Profile setup failed' });
        throw error;
      }
    },

    logout: async () => {
      set({ isLoading: true });
      try {
        authRequestId += 1;
        authRequestInFlight = false;
        pendingPhoneAuthSession = null;
        removePhoneAuthStateListener?.();
        removePhoneAuthStateListener = null;
        console.info('[PhoneAuth] session invalidated on logout', {
          requestId: authRequestId,
        });
        await auth().signOut();
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
            AsyncStorage.removeItem('verificationId'),
            AsyncStorage.removeItem('phoneAuthSession'),
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
      authRequestId += 1;
      authRequestInFlight = false;
      pendingPhoneAuthSession = null;
      removePhoneAuthStateListener?.();
      removePhoneAuthStateListener = null;
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
