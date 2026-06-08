import { create } from 'zustand';
import { MOCK_CHATS, MOCK_MESSAGES } from '../constants/mockData';
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
  createGroup: (title: string, participants: Chat[]) => Chat;
  addGroupMember: (groupChatId: string, member: Chat) => void;
  setSearchQuery: (query: string) => void;
  getSearchedChats: () => Chat[];
  markChatAsRead: (chatId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: MOCK_CHATS,
  currentChat: null,
  messages: MOCK_MESSAGES,
  searchQuery: '',

  setChats: (chats) => set({ chats }),
  
  setCurrentChat: (chat) => set({ currentChat: chat }),
  
  setMessages: (messages) => set({ messages }),
  
  addMessage: (chatId, message) => {
    const { chats, messages } = get();
    const updatedChats = chats.map((chat) => {
      if (chat.id === chatId) {
        return {
          ...chat,
          lastMessage: message.content,
          lastMessageTime: message.timestamp,
        };
      }
      return chat;
    });

    const updatedMessages = [...messages, message];

    set({
      chats: updatedChats,
      messages: updatedMessages,
    });
  },

  // Forward a message into another chat
  forwardMessage: (targetChatId, message) => {
    const { chats, messages } = get();
    const forwardedMessage: Message = {
      ...message,
      id: Math.random().toString(),
      timestamp: new Date(),
      forwarded: true,
      forwardedFrom: { senderName: message.senderName, originalContent: message.content },
    };

    const updatedChats = chats.map((chat) => {
      if (chat.id === targetChatId) {
        return {
          ...chat,
          lastMessage: forwardedMessage.content,
          lastMessageTime: forwardedMessage.timestamp,
        };
      }
      return chat;
    });

    set({ chats: updatedChats, messages: [...messages, forwardedMessage] });
  },

  // Delete chat locally (for me)
  deleteChatForMe: (chatId) => {
    const { chats, messages } = get();
    const remainingChats = chats.filter((c) => c.id !== chatId);
    const remainingMessages = messages.filter((m) => !remainingChats.some((c) => c.id === chatId));
    set({ chats: remainingChats, messages: remainingMessages });
  },

  updateMessage: (messageId, updates) => {
    const { messages } = get();

    set({
      messages: messages.map((message) =>
        message.id === messageId ? { ...message, ...updates } : message,
      ),
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
