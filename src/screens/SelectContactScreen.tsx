// @ts-nocheck
import React, { useMemo, useEffect, useRef, useState } from 'react';
import {
  FlatList,  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
const Icon = require('react-native-vector-icons/Ionicons').default;
import { useThemeStore } from '../stores/themeStore';
import contactSync from '../utils/contactSync';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { FONT_SIZES, SPACING } from '../constants/colors';
import Avatar from '../components/Avatar';
import { Chat } from '../types';

const SelectContactScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { chats, setChats, addGroupMember, setCurrentChat, markChatAsRead } = useChatStore();
  const { user } = useAuthStore();
  const isAddingMembers = route.params?.mode === 'addMembers';
  const groupChatId = route.params?.groupChatId;
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactsList, setContactsList] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  useEffect(() => {
    // if matched contacts were passed via navigation, use them; otherwise perform sync
    const matched = route.params?.matched;
    if (matched && Array.isArray(matched)) {
      // map matched users to chat-like items
      setContactsList(
        matched.map((u: any) => ({
          id: String(u._id),
          title: u.displayName || u.phoneNumber || String(u._id),
          avatar: u.profilePictureUrl || (u.displayName ? u.displayName.charAt(0) : ''),
          phoneNumber: u.phoneNumber,
        })),
      );
      return;
    }

    (async () => {
      setLoadingContacts(true);
      try {
        const matched2 = await contactSync.syncDeviceContacts();
        setContactsList(
          matched2.map((u: any) => ({
            id: u._id,
            title: u.displayName || u.phoneNumber,
            avatar: u.profilePictureUrl || (u.displayName ? u.displayName.charAt(0) : ''),
            phoneNumber: u.phoneNumber,
          })),
        );
          if (!matched2 || matched2.length === 0) {
            // show a helpful placeholder so user knows nothing matched
            setContactsList([]);
          }
      } catch (e) {
        // fallback to chats from store
        setContactsList(chats.filter((chat) => !chat.isGroup));
      } finally {
        setLoadingContacts(false);
      }
    })();
  }, [route.params, chats]);
  const groupChat = useMemo(
    () => chats.find((chat) => chat.id === groupChatId && chat.isGroup),
    [chats, groupChatId],
  );
  const existingMemberIds = useMemo(
    () => new Set((groupChat?.participants || []).map((member) => member.id)),
    [groupChat],
  );

  const selectedContactIdSet = useMemo(
    () => new Set(selectedContactIds),
    [selectedContactIds],
  );

  const normalizeSearchValue = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

  const filteredContacts = useMemo(() => {
    const query = normalizeSearchValue(searchQuery);
    if (!query) return contactsList;

    const numericQuery = query.replace(/[^\d+]/g, '');

    return contactsList.filter((contact) => {
      const title = normalizeSearchValue(contact.title || contact.displayName || '');
      const phone = normalizeSearchValue(contact.phoneNumber || contact.phone || '');
      const normalizedPhone = phone.replace(/[^\d+]/g, '');
      return (
        title.includes(query) ||
        phone.includes(query) ||
        (numericQuery.length > 0 && normalizedPhone.includes(numericQuery))
      );
    });
  }, [contactsList, searchQuery]);

  const selectedContacts = useMemo(
    () =>
      contactsList.filter((contact) =>
        selectedContactIdSet.has(contact.userId || contact.id),
      ),
    [contactsList, selectedContactIdSet],
  );

  const handleContactPress = async (contact: any) => {
    if (!isAddingMembers || !groupChatId) {
      // attempt to find or create conversation with this contact via backend
      try {
        const myId = user?.id;
        if (!myId) {
          throw new Error('Logged-in user id is missing');
        }
        const otherId = contact.id;
        const convoRes = await (await import('../utils/conversations')).findOrCreateConversation(myId, otherId);
        const conversation = convoRes.conversation;
        const participant = conversation.participantProfile || contact;
        const chatItem = {
          id: String(conversation._id),
          title: participant?.displayName || contact.title || participant?.phoneNumber || otherId,
          avatar: participant?.profilePictureUrl || contact.avatar,
          phoneNumber: participant?.phoneNumber || contact.phoneNumber,
          lastMessage: conversation.lastMessage || '',
          lastMessageTime: conversation.lastMessageAt ? new Date(conversation.lastMessageAt) : new Date(conversation.createdAt),
          isGroup: false,
          conversationId: conversation._id,
        };

        setChats([chatItem, ...chats.filter((chat) => chat.conversationId !== chatItem.conversationId && chat.id !== chatItem.id)]);
        setCurrentChat(chatItem);
        markChatAsRead(chatItem.id);
        // navigate to Chat screen with conversation id
        navigation.navigate('Chat', {
          conversationId: conversation._id,
          participant: {
            ...contact,
            phoneNumber: participant?.phoneNumber || contact.phoneNumber,
            bio: participant?.bio || contact.bio,
          },
        });
        return;
      } catch (e) {
        console.warn('Failed to create/find conversation', (e as any)?.message || String(e));
      }
    }

    const contactId = contact.userId || contact.id;
    if (existingMemberIds.has(contactId)) {
      return;
    }

    setSelectedContactIds((currentIds) =>
      currentIds.includes(contactId)
        ? currentIds.filter((id) => id !== contactId)
        : [...currentIds, contactId],
    );
  };

  const handleConfirmAddMembers = async () => {
    if (!groupChatId || selectedContacts.length === 0) {
      return;
    }

    try {
      const groups = await import('../utils/groups');
      const addIds = selectedContacts.map((c) => c.id || c.userId);
      // use conversationId when available (store chat item may have a separate conversationId)
      const apiGroupId = (groupChat && (groupChat.conversationId || groupChat.id)) || groupChatId;
      const updated = await groups.updateGroup(apiGroupId, { addMembers: addIds, addedBy: user?.id, addedByName: user?.displayName });
      // update local store optimistically
      selectedContacts.forEach((contact) => addGroupMember(groupChatId, contact));
    } catch (e) {
      console.warn('Failed to add members', (e as any)?.message || String(e));
    }

    navigation.goBack();
  };

  const renderContact = ({ item }: { item: any }) => {
    const contactId = item.userId || item.id;
    const alreadyAdded = isAddingMembers && existingMemberIds.has(contactId);
    const isSelected = selectedContactIdSet.has(contactId);

    return (
      <TouchableOpacity
        style={styles.contactRow}
        activeOpacity={alreadyAdded ? 1 : 0.75}
        onPress={() => handleContactPress(item)}
      >
        <Avatar
          source={item.avatar || (item.title ? item.title.charAt(0) : '')}
          size="medium"
          theme={theme}
          style={styles.avatar}
        />
        <View style={styles.contactCopy}>
          <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          {(isAddingMembers || !!item.lastMessage) && (
            <Text
              style={[
                styles.contactSubtitle,
                { color: alreadyAdded ? theme.primary : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {alreadyAdded ? 'Already added to the group' : item.lastMessage || 'Tap to add'}
            </Text>
          )}
        </View>
        {isAddingMembers && (
          <View
            style={[
              styles.checkbox,
              {
                borderColor:
                  alreadyAdded || isSelected ? theme.primary : theme.textSecondary,
                backgroundColor:
                  alreadyAdded || isSelected ? theme.primary : undefined,
              },
            ]}
          >
            {(alreadyAdded || isSelected) && (
              <Icon name="checkmark" size={17} color={theme.background} />
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.text }]}>Select contact</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isAddingMembers && selectedContactIds.length > 0
              ? `${selectedContactIds.length} selected`
              : `${contactsList.length} contacts`}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <Icon name="ellipsis-vertical" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
        <Icon name="search" size={20} color={theme.textSecondary} />
        <TextInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search name or number..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        ListHeaderComponent={(
          <View>
            {!isAddingMembers && (
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('NewGroup')}
              >
                <View style={[styles.actionIcon, { backgroundColor: theme.primary }]}>
                  <Icon name="people" size={24} color={theme.background} />
                  <Icon name="add" size={14} color={theme.background} style={styles.actionPlus} />
                </View>
                <Text style={[styles.actionText, { color: theme.text }]}>New group</Text>
              </TouchableOpacity>
            )}


            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Contacts</Text>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />

      {isAddingMembers && selectedContactIds.length > 0 && (
        <TouchableOpacity
          style={[styles.floatingConfirmButton, { backgroundColor: theme.primary }]}
          activeOpacity={0.8}
          onPress={handleConfirmAddMembers}
        >
          <Icon name="checkmark" size={30} color={theme.background} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 72,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    marginLeft: 4,
  },
  searchBar: {
    height: 46,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZES.base,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    marginTop: 2,
  },
  actionRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.lg,
  },
  actionPlus: {
    position: 'absolute',
    right: 7,
    top: 8,
  },
  actionText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    flex: 1,
  },
  qrIcon: {
    marginRight: SPACING.sm,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  contactRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.lg,
  },
  contactCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  contactName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
  contactSubtitle: {
    fontSize: FONT_SIZES.base,
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
  floatingConfirmButton: {
    position: 'absolute',
    right: SPACING.xl,
    bottom: SPACING.xl,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.24,
    shadowRadius: 5,
  },
});

export default SelectContactScreen;

