import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import { Message } from '../types';
import Avatar from '../components/Avatar';
import ChatBubble from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';

const ChatScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { chat: routeChat } = route.params;
  const { theme } = useThemeStore();
  const { chats, messages, addMessage } = useChatStore();
  const chat = chats.find((item) => item.id === routeChat.id) || routeChat;
  const groupMemberCount = (chat.participants?.length || 0) + (chat.isGroup ? 1 : 0);
  const [messageText, setMessageText] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const menuOptions = [
    'New group',
    chat.isGroup ? 'View group info' : 'View contact',
    'Search',
    'Media, links, and docs',
    'Mute notifications',
    'Disappearing messages',
    'Chat theme',
    'More',
  ];

  const handleSendMessage = () => {
    if (messageText.trim()) {
      const newMessage: Message = {
        id: Math.random().toString(),
        senderId: 'me',
        senderName: 'You',
        content: messageText,
        type: 'text',
        timestamp: new Date(),
        read: true,
      };

      addMessage(chat.id, newMessage);
      setMessageText('');

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatBubble
      message={item.content}
      timestamp={item.timestamp}
      isOwn={item.senderId === 'me'}
      theme={theme}
      read={item.read}
      type={item.type}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.chatHeader,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerProfileButton}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('ContactInfo', { chat })}
        >
          <Avatar source={chat.avatar || chat.title.charAt(0)} size="medium" theme={theme} />
          <View style={styles.headerTextBlock}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {chat.title}
            </Text>
            {!!chat.isGroup && (
              <Text
                style={[styles.headerSubtitle, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {groupMemberCount} members
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.75}>
          <Icon name="videocam-outline" size={26} color={theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconButton}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('IncomingCall')}
        >
          <Icon name="call-outline" size={24} color={theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconButton}
          activeOpacity={0.75}
          onPress={() => setMenuVisible(true)}
        >
          <Icon name="ellipsis-vertical" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View
            style={[
              styles.menuContainer,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.text,
              },
            ]}
          >
            {menuOptions.map((option, index) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.menuItem,
                  index === menuOptions.length - 1 && styles.menuItemWithArrow,
                ]}
                activeOpacity={0.75}
                onPress={() => setMenuVisible(false)}
              >
                <Text style={[styles.menuText, { color: theme.text }]} numberOfLines={1}>
                  {option}
                </Text>
                {option === 'More' && (
                  <Icon name="chevron-forward" size={20} color={theme.textSecondary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onEndReachedThreshold={0.1}
      />

      <MessageInput
        value={messageText}
        onChangeText={setMessageText}
        onSend={handleSendMessage}
        onEmojiPress={() => {}}
        onAttachmentPress={() => {}}
        onCameraPress={() => {}}
        theme={theme}
        disabled={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatHeader: {
    minHeight: 64,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SPACING.sm,
    paddingRight: SPACING.xs,
  },
  backButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  headerProfileButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.xs,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
    marginLeft: SPACING.md,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  headerIconButton: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuContainer: {
    position: 'absolute',
    top: 62,
    right: SPACING.sm,
    width: 280,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  menuItem: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  menuItemWithArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: SPACING.md,
    justifyContent: 'flex-end',
  },
});

export default ChatScreen;
