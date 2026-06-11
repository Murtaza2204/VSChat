import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { Chat, Message } from '../types';

interface ChatStore {
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  searchQuery: string;
  
  setChats: (chats: Chat[]) => void;
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
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChat: null,
  messages: [],
  searchQuery: '',

  setChats: (chats) => set({ chats }),
  
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
      if (chat.id === chatId) {
        return {
          ...chat,
          messages: [...(chat.messages || []), message],
          lastMessage,
          lastMessageTime: message.timestamp,
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
      if (chat.id === targetChatId) {
        return {
          ...chat,
          messages: [...(chat.messages || []), forwardedMessage],
          lastMessage,
          lastMessageTime: forwardedMessage.timestamp,
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
      chats: chats.map((chat) => ({
        ...chat,
        messages: (chat.messages || []).map((message) =>
          message.id === messageId ? { ...message, ...updates } : message,
        ),
      })),
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
}));
