import React, { useMemo, useState, useEffect } from 'react';
import {
  FlatList,  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import Avatar from '../components/Avatar';
import { Chat, Message } from '../types';
import contactSync from '../utils/contactSync';

const NewGroupScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { chats } = useChatStore();
  const forwardMessage = route.params?.forwardMessage as Message | undefined;
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingContacts(true);
      try {
        const contacts = await contactSync.syncDeviceContacts();
        setDeviceContacts(
          contacts.map((u: any) => ({
            id: String(u._id),
            title: u.displayName || u.phoneNumber,
            avatar: u.profilePictureUrl || (u.displayName ? u.displayName.charAt(0) : ''),
            userId: u._id,
            displayName: u.displayName,
            phoneNumber: u.phoneNumber,
          })),
        );
      } catch (e) {
        console.warn('Failed to load device contacts', String(e));
      } finally {
        setLoadingContacts(false);
      }
    })();
  }, []);

  const chatContacts = useMemo(
    () => chats.filter((chat) => !chat.isGroup).map((c) => ({
      ...c,
      userId: c.id,
      displayName: c.title,
    })),
    [chats],
  );

  const allContacts = useMemo(() => {
    const seen = new Set<string>();
    const merged = [];
    [...chatContacts, ...deviceContacts].forEach((c) => {
      const key = String(c.userId || c.id);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(c);
      }
    });
    return merged;
  }, [chatContacts, deviceContacts]);

  const groupContacts = useMemo(
    () => allContacts.slice(0, 20),
    [allContacts],
  );
  const contactSections = useMemo(
    () => [
      { title: 'Recent contacts', data: groupContacts.slice(0, 10) },
      { title: 'More contacts', data: groupContacts.slice(10, 20) },
    ],
    [groupContacts],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedContacts = useMemo(
    () => groupContacts.filter((contact) => selectedIds.includes(contact.id || contact.userId)),
    [groupContacts, selectedIds],
  );

  const toggleContact = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  };

  const handleForwardPress = () => {
    if (!selectedIds.length) {
      return;
    }

    const selectedContactObjects = groupContacts.filter((c) => selectedIds.includes(c.id || c.userId));
    navigation.navigate('NewGroupDetails', { selectedContacts: selectedContactObjects, forwardMessage });
  };

  const renderAvatar = (contact: any, spaced = true) => (
    <Avatar
      source={contact.avatar || (contact.title ? contact.title.charAt(0) : '')}
      size="medium"
      theme={theme}
      style={spaced ? styles.avatarSpaced : undefined}
    />
  );

  const renderSelected = ({ item }: { item: any }) => (
    <View style={styles.selectedItem}>
      <View>
        {renderAvatar(item, false)}
        <TouchableOpacity
          style={[styles.removeBadge, { backgroundColor: theme.secondary }]}
          activeOpacity={0.8}
          onPress={() => toggleContact(item.id || item.userId)}
        >
          <Icon name="close" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.selectedName, { color: theme.textSecondary }]} numberOfLines={1}>
        {item.title}
      </Text>
    </View>
  );

  const renderContact = ({ item }: { item: any }) => {
    const isSelected = selectedIds.includes(item.id || item.userId);

    return (
      <TouchableOpacity
        style={[styles.contactRow, { borderBottomColor: theme.border }]}
        activeOpacity={0.75}
        onPress={() => toggleContact(item.id || item.userId)}
      >
        {renderAvatar(item)}
        <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View
          style={[
            styles.checkCircle,
            { borderColor: theme.textSecondary },
            isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
          ]}
        >
          {isSelected && <Icon name="checkmark" size={22} color={theme.background} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.searchHeader,
          { backgroundColor: theme.inputBackground, borderColor: theme.border },
        ]}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <TextInput
          placeholder="Search name or number..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
        />
        <Icon name="keypad" size={24} color={theme.primary} />
      </View>

      <SectionList
        sections={contactSections}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            {section.title}
          </Text>
        )}
        ListHeaderComponent={
          selectedContacts.length > 0 ? (
            <View>
              <FlatList
                data={selectedContacts}
                keyExtractor={(item) => item.id}
                renderItem={renderSelected}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedList}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={[
          styles.forwardButton,
          {
            backgroundColor: selectedIds.length ? theme.primary : theme.border,
            opacity: selectedIds.length ? 1 : 0.65,
          },
        ]}
        activeOpacity={selectedIds.length ? 0.85 : 1}
        onPress={handleForwardPress}
      >
        <Icon
          name="arrow-forward"
          size={28}
          color={selectedIds.length ? theme.background : theme.textSecondary}
        />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchHeader: {
    height: 48,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    paddingHorizontal: SPACING.sm,
  },
  selectedList: {
    minHeight: 104,
    alignItems: 'center',
    paddingLeft: SPACING.lg,
    paddingTop: SPACING.md,
    paddingRight: SPACING.lg,
  },
  selectedItem: {
    width: 86,
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  selectedName: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
    maxWidth: 82,
  },
  avatarSpaced: {
    marginRight: SPACING.lg,
  },
  removeBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: SPACING.lg,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  contactRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.lg,
    borderBottomWidth: 1,
  },
  contactName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    flex: 1,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
  forwardButton: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
});

export default NewGroupScreen;

