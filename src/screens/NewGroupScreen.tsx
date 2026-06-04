import React, { useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import Avatar from '../components/Avatar';
import { Chat } from '../types';

const NewGroupScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { chats } = useChatStore();
  const groupContacts = useMemo(
    () => chats.filter((chat) => !chat.isGroup).slice(0, 4),
    [chats],
  );
  const contactSections = useMemo(
    () => [
      { title: 'Frequently contacted', data: groupContacts.slice(0, 2) },
      { title: 'Contacts on WhatsApp', data: groupContacts.slice(2, 4) },
    ],
    [groupContacts],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedContacts = useMemo(
    () => groupContacts.filter((contact) => selectedIds.includes(contact.id)),
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

    navigation.navigate('NewGroupDetails', { selectedIds });
  };

  const renderAvatar = (contact: Chat, spaced = true) => (
    <Avatar
      source={contact.avatar || contact.title.charAt(0)}
      size="medium"
      theme={theme}
      style={spaced ? styles.avatarSpaced : undefined}
    />
  );

  const renderSelected = ({ item }: { item: Chat }) => (
    <View style={styles.selectedItem}>
      <View>
        {renderAvatar(item, false)}
        <TouchableOpacity
          style={[styles.removeBadge, { backgroundColor: theme.secondary }]}
          activeOpacity={0.8}
          onPress={() => toggleContact(item.id)}
        >
          <Icon name="close" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.selectedName, { color: theme.textSecondary }]} numberOfLines={1}>
        {item.title}
      </Text>
    </View>
  );

  const renderContact = ({ item }: { item: Chat }) => {
    const isSelected = selectedIds.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.contactRow, { borderBottomColor: theme.border }]}
        activeOpacity={0.75}
        onPress={() => toggleContact(item.id)}
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
