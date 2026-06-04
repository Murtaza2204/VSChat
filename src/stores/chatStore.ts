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
