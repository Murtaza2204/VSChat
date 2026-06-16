// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
const Icon = require('react-native-vector-icons/Ionicons').default;
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';
import { formatTime } from '../utils/theme';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import contactSync from '../utils/contactSync';
import conversationsApi from '../utils/conversations';
import { connectSocket } from '../utils/socket';

type ChatFilter = 'all' | 'unread' | 'favourites' | 'groups';

const ChatListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const {
    chats,
    setChats,
    setCurrentChat,
    markChatAsRead,
    searchQuery,
    setSearchQuery,
    getSearchedChats,
  } = useChatStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ChatFilter>('all');

  const handleRefresh = () => {
    // trigger reload of conversations
    setIsRefreshing(true);
    loadConversations().finally(() => setIsRefreshing(false));
  };

  const loadConversations = async () => {
    try {
      const myId = user?.id;
      if (!myId) {
        return;
      }
      const convos = await conversationsApi.getConversations(myId);
      // map conversations to Chat-like items
      const chatItems = convos.map((c: any) => {
        const isGroup = c.isGroup === true;
        if (isGroup) {
          // For groups, use the group title
          return {
            id: String(c._id),
            title: c.title || 'Group',
            avatar: '👥',
            lastMessage: c.lastMessage || '',
            lastMessageTime: c.lastMessageAt ? new Date(c.lastMessageAt) : new Date(c.createdAt),
            isGroup: true,
            conversationId: c._id,
            participants: c.participants || [],
            unreadCount: typeof c.unreadCounts === 'object' && c.unreadCounts[myId] ? c.unreadCounts[myId] : 0,
          };
        }
        // One-to-one conversation
        const participant = c.participantProfile || null;
        const participantId = participant?.id || participant?.userId;
        // personalize reaction preview for current user
        const currentUserId = myId;
        let lastMessageText = c.lastMessage || '';
        try {
          if (c.lastMessageReaction) {
            const actorId = c.lastMessageActorId ? String(c.lastMessageActorId) : null;
            const reaction = c.lastMessageReaction;
            const snippet = c.lastMessageRaw || c.lastMessage || '';
            if (actorId && String(actorId) === String(currentUserId)) {
              lastMessageText = `You reacted ${reaction} to "${snippet}"`;
            } else {
              const name = participant?.displayName || participant?.name || 'Someone';
              lastMessageText = `${name} reacted ${reaction} to "${snippet}"`;
            }
          }
        } catch (e) {}

        return {
          id: String(participantId || c._id),
          title: participant?.displayName || participantId || 'Unknown',
          avatar: participant?.profilePictureUrl || undefined,
          bio: participant?.bio || undefined,
          phoneNumber: participant?.phoneNumber,
          lastMessage: lastMessageText,
          lastMessageTime: c.lastMessageAt ? new Date(c.lastMessageAt) : new Date(c.createdAt),
          isGroup: false,
          conversationId: c._id,
          unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : 0,
        };
      });

      setChats(chatItems);
    } catch (e) {
      console.warn('Failed to load conversations', String(e));
    }
  };

  useEffect(() => {
    loadConversations();
  }, [user?.id]);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', loadConversations);
    return unsubscribe;
  }, [navigation, user?.id]);

  // Socket updates are handled by socket.ts which automatically updates the store
  // Just ensure socket is connected when screen is focused
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        connectSocket(token);
        console.log('[ChatListScreen] socket connected for real-time updates');
      } catch (e) {
        console.warn('[ChatListScreen] socket connection error', e);
      }
    })();
  }, []);

  const handleChatPress = (chat: any) => {
    setCurrentChat(chat);
    markChatAsRead(chat.id);
    navigation.navigate('Chat', {
      conversationId: chat.conversationId,
      participant: {
        id: chat.id,
        title: chat.title,
        avatar: chat.avatar,
        phoneNumber: chat.phoneNumber,
        bio: chat.bio,
      },
    });
  };

  const closeMenu = () => setMenuVisible(false);

  const handleReadAll = () => {
    setChats(chats.map((chat) => ({ ...chat, unreadCount: 0 })));
    closeMenu();
  };

  const handleSettingsPress = () => {
    closeMenu();
    navigation.navigate('Profile');
  };

  const handleNewGroupPress = () => {
    closeMenu();
    navigation.navigate('NewGroup');
  };

  const menuOptions = [
    { label: 'New group', onPress: handleNewGroupPress },
    { label: 'Read all', onPress: handleReadAll },
    { label: 'Settings', onPress: handleSettingsPress },
  ];

  const searchedChats = getSearchedChats();
  const favouriteChatIds = chats.slice(0, 2).map((chat) => chat.id);
  const unreadCount = chats.filter((chat) => chat.unreadCount > 0).length;
  const favouriteCount = chats.filter((chat) => favouriteChatIds.includes(chat.id)).length;
  const groupCount = chats.filter((chat) => chat.isGroup).length;
  const filterOptions: Array<{ label: string; value: ChatFilter; count?: number }> = [
    { label: 'All', value: 'all' },
    { label: 'Unread', value: 'unread', count: unreadCount },
    { label: 'Favourites', value: 'favourites', count: favouriteCount },
    { label: 'Groups', value: 'groups', count: groupCount },
  ];
  const filteredChats = searchedChats.filter((chat) => {
    if (activeFilter === 'unread') {
      return chat.unreadCount > 0;
    }
    if (activeFilter === 'favourites') {
      return favouriteChatIds.includes(chat.id);
    }
    if (activeFilter === 'groups') {
      return chat.isGroup;
    }
    return true;
  });

  const renderChatItem = ({ item }: any) => (
    <TouchableOpacity
      onPress={() => handleChatPress(item)}
      style={[
        styles.chatItem,
        { backgroundColor: theme.surface, borderBottomColor: theme.border },
      ]}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        <Avatar source={item.avatar} size="medium" theme={theme} />
        {item.unreadCount > 0 && (
          <View
            style={[
              styles.unreadBadge,
              { backgroundColor: theme.primary },
            ]}
          >
            <Text style={styles.unreadText}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text
            style={[
              styles.chatTitle,
              { color: theme.text, fontWeight: item.unreadCount > 0 ? '700' : '600' },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={[
              styles.timestamp,
              { color: theme.textSecondary },
            ]}
          >
            {formatTime(new Date(item.lastMessageTime))}
          </Text>
        </View>
        <Text
          style={[
            styles.lastMessage,
            { 
              color: item.unreadCount > 0 ? theme.text : theme.textSecondary,
              fontWeight: item.unreadCount > 0 ? '600' : '400',
            },
          ]}
          numberOfLines={1}
        >
          {item.lastMessage}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Messages</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={handleRefresh} style={[styles.iconSmall, { marginRight: 8 }]}> 
            <Icon name="refresh" size={20} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={styles.profileButton}
          >
            <Icon name="ellipsis-vertical" size={24} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
          <View
            style={[
              styles.menuContainer,
              {
                backgroundColor: theme.surface,
                shadowColor: theme.text,
              },
            ]}
          >
            {menuOptions.map((option) => (
              <TouchableOpacity
                key={option.label}
                style={styles.menuItem}
                activeOpacity={0.75}
                onPress={option.onPress}
              >
                <Text style={[styles.menuItemText, { color: theme.text }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <View
        style={[
          styles.searchContainer,
          { backgroundColor: theme.inputBackground, borderColor: theme.border },
        ]}
      >
        <Icon name="search" size={20} color={theme.textSecondary} />
        <TextInput
          placeholder="Search chats"
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[styles.searchInput, { color: theme.text }]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterContent}
        style={styles.filterScroll}
      >
        {filterOptions.map((option) => {
          const isActive = activeFilter === option.value;

          return (
            <TouchableOpacity
              key={option.value}
              activeOpacity={0.8}
              onPress={() => setActiveFilter(option.value)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive ? theme.primary : theme.background,
                  borderColor: isActive ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: isActive ? theme.background : theme.textSecondary },
                ]}
              >
                {option.label}
                {!!option.count && ` ${option.count}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <SkeletonLoader theme={theme} />
      ) : filteredChats.length > 0 ? (
        <FlatList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[theme.primary]}
            />
          }
          scrollEnabled={true}
          nestedScrollEnabled={true}
        />
      ) : (
        <EmptyState
          icon="chatbubbles"
          title="No Chats"
          message={searchQuery
            ? 'No chats match your search'
            : activeFilter !== 'all'
              ? 'No chats in this filter'
            : 'Start a new conversation by selecting a contact'}
          theme={theme}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={async () => {
          try {
              // run contact sync and navigate to SelectContact with results
              const matched = await contactSync.syncDeviceContacts();
              console.log('Contact sync returned', matched?.length || 0);
              navigation.navigate('SelectContact', { matched });
          } catch (e) {
            // If permission denied or error, fall back to SelectContact screen
            console.warn('Contact sync failed', String(e));
            navigation.navigate('SelectContact');
          }
        }}
      >
        <Icon name="add" size={28} color={theme.background} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  profileButton: {
    padding: SPACING.sm,
  },
  iconSmall: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuContainer: {
    position: 'absolute',
    top: 74,
    right: SPACING.sm,
    width: 250,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  menuItem: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  menuItemText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: SPACING.sm,
    fontSize: FONT_SIZES.base,
  },
  filterScroll: {
    flexGrow: 0,
    height: 48,
    marginBottom: SPACING.sm,
  },
  filterContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  filterChip: {
    height: 36,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    marginRight: SPACING.sm,
  },
  filterText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  unreadBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  unreadText: {
    color: 'white',
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  chatTitle: {
    fontSize: FONT_SIZES.base,
    flex: 1,
  },
  timestamp: {
    fontSize: FONT_SIZES.sm,
    marginLeft: SPACING.sm,
  },
  lastMessage: {
    fontSize: FONT_SIZES.sm,
  },
  fab: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
});

export default ChatListScreen;
