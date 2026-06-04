import React, { useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { FONT_SIZES, SPACING } from '../constants/colors';
import Avatar from '../components/Avatar';
import { Chat } from '../types';

const SelectContactScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { chats, addGroupMember, setCurrentChat, markChatAsRead } = useChatStore();
  const isAddingMembers = route.params?.mode === 'addMembers';
  const groupChatId = route.params?.groupChatId;
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const contacts = useMemo(() => chats.filter((chat) => !chat.isGroup), [chats]);
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

  const selectedContacts = useMemo(
    () =>
      contacts.filter((contact) =>
        selectedContactIdSet.has(contact.userId || contact.id),
      ),
    [contacts, selectedContactIdSet],
  );

  const handleContactPress = (contact: Chat) => {
    if (!isAddingMembers || !groupChatId) {
      setCurrentChat(contact);
      markChatAsRead(contact.id);
      navigation.navigate('Chat', { chat: contact });
      return;
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

  const handleConfirmAddMembers = () => {
    if (!groupChatId || selectedContacts.length === 0) {
      return;
    }

    selectedContacts.forEach((contact) => {
      addGroupMember(groupChatId, contact);
    });
    navigation.goBack();
  };

  const renderContact = ({ item }: { item: Chat }) => {
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
          source={item.avatar || item.title.charAt(0)}
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
              : `${contacts.length} contacts`}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <Icon name="search" size={24} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton}>
          <Icon name="ellipsis-vertical" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={contacts}
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

            <TouchableOpacity style={styles.actionRow} activeOpacity={0.75}>
              <View style={[styles.actionIcon, { backgroundColor: theme.primary }]}>
                <Icon name="person" size={24} color={theme.background} />
                <Icon name="add" size={14} color={theme.background} style={styles.actionPlus} />
              </View>
              <Text style={[styles.actionText, { color: theme.text }]}>New contact</Text>
              <Icon name="qr-code-outline" size={24} color={theme.primary} style={styles.qrIcon} />
            </TouchableOpacity>

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
