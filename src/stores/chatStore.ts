import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { Chat, Message } from '../types';

interface ChatStore {
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  searchQuery: string;
  
  setChats: (chats: Chat[]) => void;
  updateChatLastMessage: (conversationId: string, lastMessage: string, lastMessageTime?: Date) => void;
  setCurrentChat: (chat: Chat | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (messageId: string) => void;
  forwardMessage: (targetChatId: string, message: Message) => void;
  deleteChatForMe: (chatId: string) => void;
  createGroup: (title: string, participants: Chat[]) => Chat;
  addGroupMember: (groupChatId: string, member: Chat) => void;
  setSearchQuery: (query: string) => void;
  getSearchedChats: () => Chat[];
  markChatAsRead: (chatId: string) => void;
  replaceMessageTempId: (tempId: string, serverMessage: Message) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChat: null,
  messages: [],
  searchQuery: '',

  setChats: (chats) => {
    try {
      const currentUser = useAuthStore.getState().user;
      const seen = new Set();
      const seenPhones = new Set();
      const normalized = [];

      for (const c of chats) {
        // skip chats that point to the current user (self-chat)
        if (currentUser && String(c.id) === String(currentUser.id)) continue;

        // For non-group chats, prioritize phone number deduplication
        if (!c.isGroup && c.phoneNumber) {
          if (seenPhones.has(String(c.phoneNumber))) continue;
          seenPhones.add(String(c.phoneNumber));
        }

        // Fallback deduplication by conversationId or id
        const key = String(c.conversationId || c.id || Math.random());
        if (seen.has(key)) continue;
        seen.add(key);

        normalized.push(c);
      }

      set({ chats: normalized });
    } catch (e) {
      set({ chats });
    }
  },
  
  updateChatLastMessage: (conversationId, lastMessage, lastMessageTime) => {
    try {
      const { chats } = get();
      const updatedChats = chats.map((c) => {
        if (String(c.conversationId || c.id) === String(conversationId)) {
          return {
            ...c,
            lastMessage,
            lastMessageTime: lastMessageTime || c.lastMessageTime || new Date(),
          };
        }
        return c;
      });
      set({ chats: updatedChats });
    } catch (e) {
      console.warn('updateChatLastMessage error:', e);
    }
  },
  
  setCurrentChat: (chat) => set({ currentChat: chat }),
  
  setMessages: (messages) => set({ messages }),
  
  addMessage: (chatId, message) => {
    const { chats } = get();
    const lastMessage =
      message.content ||
      (message.type === 'image'
        ? 'Photo'
        : message.type === 'video'
          ? 'Video'
          : message.type === 'mediaGroup'
            ? 'Media'
            : message.type === 'file'
              ? 'Document'
              : message.type === 'location' || message.type === 'liveLocation'
                ? 'Location'
                : message.type === 'call'
                  ? `${message.call?.type === 'video' ? 'Video' : 'Voice'} call`
                : 'Message');
    const updatedChats = chats.map((chat) => {
      // match by chat.id or conversationId to be robust after merges
      if (String(chat.id) === String(chatId) || String(chat.conversationId) === String(chatId)) {
        const existingIndex = (chat.messages || []).findIndex((m) => String(m.id) === String(message.id));
        let nextMessages = chat.messages || [];
        if (existingIndex === -1) {
          nextMessages = [...nextMessages, message];
        } else {
          // update existing message with new data
          nextMessages = nextMessages.map((m) =>
            String(m.id) === String(message.id) ? { ...m, ...message } : m,
          );
        }

        return {
          ...chat,
          messages: nextMessages,
          lastMessage,
          lastMessageTime: message.timestamp,
          // clear any reaction-based conversation preview so new messages show
          lastMessageReaction: undefined,
          lastMessageActorId: undefined,
          lastMessageRaw: undefined,
        };
      }
      return chat;
    });

    set({
      chats: updatedChats,
    });
  },

  // Forward a message into another chat
  forwardMessage: (targetChatId, message) => {
    const { chats } = get();
    const lastMessage =
      message.content ||
      (message.type === 'image'
        ? 'Photo'
        : message.type === 'video'
          ? 'Video'
          : message.type === 'mediaGroup'
            ? 'Media'
            : message.type === 'file'
              ? 'Document'
              : message.type === 'location' || message.type === 'liveLocation'
                ? 'Location'
                : message.type === 'call'
                  ? `${message.call?.type === 'video' ? 'Video' : 'Voice'} call`
                : 'Message');
    const currentUser = useAuthStore.getState().user;
    const forwardedMessage: Message = {
      ...message,
      id: Math.random().toString(),
      senderId: currentUser?.id || 'me',
      senderName: currentUser?.name || 'You',
      timestamp: new Date(),
      read: true,
      forwarded: true,
      forwardedFrom: { senderName: message.senderName, originalContent: message.content },
      replyToId: undefined,
      reaction: undefined,
      starred: undefined,
    };

    const updatedChats = chats.map((chat) => {
      if (String(chat.id) === String(targetChatId) || String(chat.conversationId) === String(targetChatId)) {
        const existing = (chat.messages || []).some((m) => String(m.id) === String(forwardedMessage.id));
        const nextMessages = existing ? chat.messages || [] : [...(chat.messages || []), forwardedMessage];

        return {
          ...chat,
          messages: nextMessages,
          lastMessage,
          lastMessageTime: forwardedMessage.timestamp,
          lastMessageReaction: undefined,
          lastMessageActorId: undefined,
          lastMessageRaw: undefined,
        };
      }
      return chat;
    });

    set({ chats: updatedChats });
  },

  // Delete chat locally (for me)
  deleteChatForMe: (chatId) => {
    const { chats } = get();
    const remainingChats = chats.filter((c) => c.id !== chatId);
    set({ chats: remainingChats });
  },

  updateMessage: (messageId, updates) => {
    const { chats, messages } = get();

    set({
      chats: chats.map((chat) => {
        const nextMessages = (chat.messages || []).map((message) =>
          message.id === messageId ? { ...message, ...updates } : message,
        );
        const lastChatMessage = nextMessages[nextMessages.length - 1];
        return {
          ...chat,
          messages: nextMessages,
          lastMessage: lastChatMessage ? lastChatMessage.content : chat.lastMessage,
          lastMessageTime: lastChatMessage ? lastChatMessage.timestamp : chat.lastMessageTime,
        };
      }),
      messages: messages.map((message) =>
        message.id === messageId ? { ...message, ...updates } : message,
      ),
    });
  },

  deleteMessage: (messageId) => {
    const { chats, messages } = get();
    set({
      chats: chats.map((chat) => {
        const nextMessages = (chat.messages || []).filter(
          (message) => message.id !== messageId,
        );
        const lastChatMessage = nextMessages[nextMessages.length - 1];

        return {
          ...chat,
          messages: nextMessages,
          lastMessage: lastChatMessage ? lastChatMessage.content : chat.lastMessage,
          lastMessageTime: lastChatMessage ? lastChatMessage.timestamp : chat.lastMessageTime,
        };
      }),
      messages: messages.filter((message) => message.id !== messageId),
    });
  },

  createGroup: (title, participants) => {
    const createdAt = Date.now();
    const groupTitle =
      title.trim() || participants.map((participant) => participant.title).join(', ');
    const participantUsers = participants.map((participant) => ({
      id: participant.userId || participant.id,
      name: participant.title,
      phone: '',
      avatar: participant.avatar,
      status: 'offline' as const,
    }));
    const newGroup: Chat = {
      id: `group-${createdAt}`,
      groupId: `group-${createdAt}`,
      title: groupTitle || 'New group',
      avatar: '👥',
      lastMessage: 'Group created',
      lastMessageTime: new Date(),
      unreadCount: 0,
      isGroup: true,
      participants: participantUsers,
      messages: [],
    };

    set({ chats: [newGroup, ...get().chats] });
    return newGroup;
  },

  addGroupMember: (groupChatId, member) => {
    const { chats, currentChat } = get();
    const memberId = member.userId || member.id;
    let updatedGroup: Chat | null = null;

    const updatedChats = chats.map((chat) => {
      if (chat.id !== groupChatId || !chat.isGroup) {
        return chat;
      }

      const participants = chat.participants || [];
      const alreadyAdded = participants.some((participant) => participant.id === memberId);

      if (alreadyAdded) {
        updatedGroup = chat;
        return chat;
      }

      updatedGroup = {
        ...chat,
        participants: [
          ...participants,
          {
            id: memberId,
            name: member.title,
            phone: '',
            avatar: member.avatar,
            status: 'offline' as const,
          },
        ],
      };

      return updatedGroup;
    });

    set({
      chats: updatedChats,
      currentChat:
        currentChat?.id === groupChatId && updatedGroup ? updatedGroup : currentChat,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  getSearchedChats: () => {
    const { chats, searchQuery } = get();
    if (!searchQuery.trim()) {
      return chats;
    }

    return chats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  },

  markChatAsRead: (chatId) => {
    const { chats } = get();
    const updatedChats = chats.map((chat) => {
      if (chat.id === chatId) {
        return { ...chat, unreadCount: 0 };
      }
      return chat;
    });
    set({ chats: updatedChats });
  },

  // Replace an optimistic message (identified by client temp id) with server message
  replaceMessageTempId: (tempId: string, serverMessage: Message) => {
    const { chats } = get();
    const updatedChats = chats.map((chat) => {
      const serverId = String((serverMessage as any)._id || serverMessage.id || serverMessage.id);
      const hasServer = (chat.messages || []).some((m) => String(m.id) === serverId);

      let messages;
      if (hasServer) {
        // If server message already present, remove the temp message
        messages = (chat.messages || []).filter((m) => String(m.id) !== String(tempId));
      } else {
        messages = (chat.messages || []).map((m) => {
          if (String(m.id) === String(tempId)) {
            return { ...m, ...serverMessage, id: serverId };
          }
          return m;
        });
      }

      return {
        ...chat,
        messages,
        lastMessage: messages[messages.length - 1]?.content || chat.lastMessage,
        lastMessageReaction: undefined,
        lastMessageActorId: undefined,
        lastMessageRaw: undefined,
      };
    });
    set({ chats: updatedChats });
  },
}));
