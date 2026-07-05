import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { fetchDownloadUrl } from '../services/mediaService';
import { Chat, Message } from '../types';

const joinHumanList = (items: string[] = []) => {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
};

const getChatActivityTime = (chat: Chat) => {
  const value = chat?.lastMessageTime ? new Date(chat.lastMessageTime as any).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
};

const sortChatsByRecentActivity = (chats: Chat[]) =>
  [...chats]
    .map((chat, index) => ({ chat, index }))
    .sort((a, b) => {
      const diff = getChatActivityTime(b.chat) - getChatActivityTime(a.chat);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ chat }) => chat);

interface ChatStore {
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  searchQuery: string;
  
  setChats: (chats: Chat[]) => void;
  updateChatLastMessage: (conversationId: string, lastMessage: string, lastMessageTime?: Date) => void;
  updateChat: (conversationId: string, updates: Partial<Chat>) => void;
  setCurrentChat: (chat: Chat | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (messageId: string) => void;
  forwardMessage: (targetChatId: string, message: Message) => void;
  deleteChatForMe: (chatId: string) => void;
  createGroup: (title: string, participants: Chat[]) => Chat;
  updateGroupAvatar: (groupChatId: string, avatar: string | null) => void;
  updateGroupTitle: (groupChatId: string, title: string) => void;
  addGroupMember: (groupChatId: string, member: Chat) => void;
  removeGroupMembers: (groupChatId: string, memberIds: string[]) => void;
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

      set({ chats: sortChatsByRecentActivity(normalized) });
    } catch (e) {
      set({ chats });
    }
  },
  
  updateChatLastMessage: (conversationId, lastMessage, lastMessageTime) => {
    try {
      const { chats } = get();
      const updatedChats = chats.map((c) => {
        if (String(c.conversationId || c.id) === String(conversationId)) {
          // Normalize payload: lastMessage can be a string or an object
          let finalLastMessage = '';
          try {
            if (lastMessage && typeof lastMessage === 'object') {
              if (lastMessage.type === 'system' || lastMessage.systemEventType) {
                finalLastMessage = String(c.lastMessage || '');
              } else {
                // Support reaction payloads: `reactedBy`, `reaction`, and `originalActorId`
                const actorId = lastMessage.reactedBy || lastMessage.actorId || lastMessage.senderId || lastMessage.lastMessageActorId || lastMessage.originalActorId;
                const raw = lastMessage.raw || lastMessage.content || lastMessage.text || '';
                const reaction = lastMessage.reaction || lastMessage.lastMessageReaction;

              // If this payload represents a reaction preview, show "You reacted ..." or "Name reacted ..."
              if (typeof reaction !== 'undefined' && reaction !== null) {
                const currentUser = useAuthStore.getState().user;
                if (String(actorId) === String(currentUser?.id)) {
                  finalLastMessage = `You reacted ${reaction} to "${raw}"`;
                } else {
                  const sender = (c.participants || []).find((p: any) => {
                    const pid = p?.id || p?.userId || p?._id;
                    return pid && String(pid) === String(actorId);
                  });
                  const senderName = sender?.displayName || sender?.name || sender?.username || 'Someone';
                  finalLastMessage = `${senderName} reacted ${reaction} to "${raw}"`;
                }
              } else if (actorId && c.isGroup) {
                const currentUser = useAuthStore.getState().user;
                if (String(actorId) === String(currentUser?.id)) {
                  finalLastMessage = `You: ${raw}`;
                } else {
                  const sender = (c.participants || []).find((p: any) => {
                    const pid = p?.id || p?.userId || p?._id;
                    return pid && String(pid) === String(actorId);
                  });
                  const senderName = sender?.displayName || sender?.name || sender?.username || 'Someone';
                  finalLastMessage = `${senderName}: ${raw}`;
                }
              } else {
                finalLastMessage = raw || String(lastMessage);
              }
              }
            } else {
              finalLastMessage = String(lastMessage || '');
            }
          } catch (e) {
            finalLastMessage = String(lastMessage || '');
          }

          return {
            ...c,
            lastMessage: finalLastMessage,
            lastMessageTime: lastMessageTime || c.lastMessageTime || new Date(),
            // persist raw/reaction/actor fields when provided so renderers can
            // reconstruct previews and sender names when reactions change
            lastMessageRaw: typeof lastMessage === 'object' ? (lastMessage.raw || lastMessage.content || lastMessage.text || c.lastMessageRaw) : c.lastMessageRaw,
            // preserve original actor id (who sent the last message) if provided
            lastMessageActorId: typeof lastMessage === 'object' ? (lastMessage.originalActorId || lastMessage.actorId || lastMessage.senderId || lastMessage.lastMessageActorId || c.lastMessageActorId) : c.lastMessageActorId,
            lastMessageReaction: typeof lastMessage === 'object' ? (lastMessage.reaction || lastMessage.lastMessageReaction || c.lastMessageReaction) : c.lastMessageReaction,
          };
        }
        return c;
      });
      set({ chats: sortChatsByRecentActivity(updatedChats) });
    } catch (e) {
      console.warn('updateChatLastMessage error:', e);
    }
  },
  
  setCurrentChat: (chat) => set({ currentChat: chat }),
  
  setMessages: (messages) => set({ messages }),
  
  addMessage: (chatId, message) => {
    const { chats } = get();
    const rawPreview =
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

        if (message.type === 'system') {
          return {
            ...chat,
            messages: nextMessages,
          };
        }

        // For group chats, show sender prefix contextual to current user
        const currentUser = useAuthStore.getState().user;
        let displayLastMessage = rawPreview;
        try {
          if (message.type === 'system') {
            displayLastMessage = rawPreview;
          } else if (chat.isGroup) {
            if (String(message.senderId) === String(currentUser?.id)) {
              displayLastMessage = `You: ${rawPreview}`;
            } else {
              const senderName = message.senderName || message.sender || 'Someone';
              displayLastMessage = `${senderName}: ${rawPreview}`;
            }
          }
        } catch (e) {}

        return {
          ...chat,
          messages: nextMessages,
          lastMessage: displayLastMessage,
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
      chats: sortChatsByRecentActivity(updatedChats),
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

    // Async enrichment: resolve download URLs for media items before inserting forwarded message
    (async () => {
      const originalMediaItems = message.mediaItems || message.metadata?.mediaItems || [];
      const enrichedItems = await Promise.all(
        (originalMediaItems || []).map(async (it: any) => {
          if (!it) return it;
          if (it.uri || it.downloadUrl) return { ...it, uri: it.uri || it.downloadUrl };
          if (it.objectKey) {
            try {
              const uri = await fetchDownloadUrl(it.objectKey);
              return { ...it, uri };
            } catch (e) {
              return { ...it };
            }
          }
          return { ...it };
        }),
      );

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
        mediaItems: enrichedItems && enrichedItems.length ? enrichedItems : undefined,
        metadata: { ...(message.metadata || {}), mediaItems: enrichedItems && enrichedItems.length ? enrichedItems : undefined },
      } as Message;

      const updatedChats = chats.map((chat) => {
        if (String(chat.id) === String(targetChatId) || String(chat.conversationId) === String(targetChatId)) {
          const existing = (chat.messages || []).some((m) => String(m.id) === String(forwardedMessage.id));
          const nextMessages = existing ? chat.messages || [] : [...(chat.messages || []), forwardedMessage];

          // If this is a group chat, prefix with sender label (current user)
          const displayLastMessage = chat.isGroup ? `You: ${lastMessage}` : lastMessage;

          return {
            ...chat,
            messages: nextMessages,
            lastMessage: displayLastMessage,
            lastMessageTime: forwardedMessage.timestamp,
            lastMessageReaction: undefined,
            lastMessageActorId: undefined,
            lastMessageRaw: undefined,
          };
        }
        return chat;
      });

      set({ chats: sortChatsByRecentActivity(updatedChats) });
    })();
  },

  // Delete chat locally (for me)
  deleteChatForMe: (chatId) => {
    const { chats, currentChat } = get();
    const remainingChats = chats.filter((c) => String(c.id) !== String(chatId) && String(c.conversationId || '') !== String(chatId));
    const activeChatMatches = currentChat && (String(currentChat.id) === String(chatId) || String(currentChat.conversationId || '') === String(chatId));
    set({
      chats: sortChatsByRecentActivity(remainingChats),
      currentChat: activeChatMatches ? null : currentChat,
      messages: activeChatMatches ? [] : get().messages,
    });
  },

  updateMessage: (messageId, updates) => {
    const { chats, messages } = get();

    set({
      chats: sortChatsByRecentActivity(chats.map((chat) => {
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
      })),
      messages: messages.map((message) =>
        message.id === messageId ? { ...message, ...updates } : message,
      ),
    });
  },

  deleteMessage: (messageId) => {
    const { chats, messages } = get();
    set({
      chats: sortChatsByRecentActivity(chats.map((chat) => {
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
      })),
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
      admins: participantUsers.length ? [String(participantUsers[0].id)] : [],
    };

    set({ chats: [newGroup, ...get().chats] });
    return newGroup;
  },

  updateGroupAvatar: (groupChatId, avatar) => {
    const { chats, currentChat } = get();
    const updatedChats = chats.map((chat) => {
      if (String(chat.id) !== String(groupChatId) && String(chat.conversationId || '') !== String(groupChatId)) {
        return chat;
      }
      return {
        ...chat,
        avatar: avatar || chat.avatar,
        groupProfilePicture: avatar ?? chat.groupProfilePicture ?? null,
      };
    });
    set({
      chats: updatedChats,
      currentChat: currentChat && (String(currentChat.id) === String(groupChatId) || String(currentChat.conversationId || '') === String(groupChatId)) ? {
        ...currentChat,
        avatar: avatar || currentChat.avatar,
        groupProfilePicture: avatar ?? currentChat.groupProfilePicture ?? null,
      } : currentChat,
    });
  },

  updateGroupTitle: (groupChatId, title) => {
    const { chats, currentChat } = get();
    const updatedChats = chats.map((chat) => {
      if (String(chat.id) !== String(groupChatId) && String(chat.conversationId || '') !== String(groupChatId)) {
        return chat;
      }
      return {
        ...chat,
        title: title || chat.title,
      };
    });

    set({
      chats: updatedChats,
      currentChat: currentChat && (String(currentChat.id) === String(groupChatId) || String(currentChat.conversationId || '') === String(groupChatId)) ? {
        ...currentChat,
        title: title || currentChat.title,
      } : currentChat,
    });
  },

  updateChat: (conversationId, updates) => {
    const { chats, currentChat } = get();
    const normalizeParticipants = (existingParticipants, incomingParticipants) => {
      if (!Array.isArray(incomingParticipants)) return existingParticipants;
      if (Array.isArray(existingParticipants) && existingParticipants.length && typeof existingParticipants[0] === 'object') {
        const ids = new Set(incomingParticipants.map((participant) => String(participant?.id || participant?._id || participant)));
        return incomingParticipants.map((participant) => {
          if (participant && typeof participant === 'object') {
            const userId = String(participant.id || participant._id || participant.userId || participant);
            return {
              ...participant,
              id: userId,
            };
          }
          return participant;
        }).filter((participant) => ids.has(String(participant?.id || participant?._id || participant)));
      }
      return incomingParticipants;
    };

    const updatedChats = chats.map((chat) => {
      if (String(chat.conversationId || chat.id) !== String(conversationId)) {
        return chat;
      }
      const merged = { ...chat, ...updates };
      if (updates.participants) {
        merged.participants = normalizeParticipants(chat.participants, updates.participants);
      }
      return merged;
    });

    set({
      chats: updatedChats,
      currentChat:
        currentChat && String(currentChat.conversationId || currentChat.id) === String(conversationId)
          ? {
              ...currentChat,
              ...updates,
              participants: updates.participants
                ? normalizeParticipants(currentChat.participants, updates.participants)
                : currentChat.participants,
            }
          : currentChat,
    });
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

  removeGroupMembers: (groupChatId, memberIds) => {
    const { chats, currentChat } = get();
    const normalizedIds = memberIds.map((id) => String(id));

    const updateParticipants = (participants = []) =>
      participants.filter(
        (participant) => !normalizedIds.includes(String(participant?.id || participant?._id || participant)),
      );

    const updatedChats = chats.map((chat) => {
      if (String(chat.id) !== String(groupChatId) && String(chat.conversationId || '') !== String(groupChatId)) {
        return chat;
      }
      return {
        ...chat,
        participants: updateParticipants(chat.participants),
      };
    });

    set({
      chats: updatedChats,
      currentChat:
        currentChat &&
        (String(currentChat.id) === String(groupChatId) ||
          String(currentChat.conversationId || '') === String(groupChatId))
          ? {
              ...currentChat,
              participants: updateParticipants(currentChat.participants),
            }
          : currentChat,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  updateUserProfilePicture: (userId: string, url: string | null) => {
    try {
      const { chats } = get();
      const updated = chats.map((chat) => {
        // update group participants
        const participants = (chat.participants || []).map((p) => {
          if (String(p.id) === String(userId)) {
            return { ...p, avatar: url || p.avatar };
          }
          return p;
        });

        // update direct chat avatar if matches userId
        let avatar = chat.avatar;
        if (!chat.isGroup && String(chat.id) === String(userId)) {
          avatar = url || avatar;
        }

        return { ...chat, participants, avatar };
      });
      set({ chats: sortChatsByRecentActivity(updated) });
    } catch (e) {
      console.warn('updateUserProfilePicture error', e);
    }
  },

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
    set({ chats: sortChatsByRecentActivity(updatedChats) });
  },
}));
