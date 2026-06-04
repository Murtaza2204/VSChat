import React from 'react';
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import Avatar from '../components/Avatar';
import { Chat } from '../types';

const mediaItems = [
  { id: '1', icon: 'image', label: 'GIF' },
  { id: '2', icon: 'document-text', label: 'Doc' },
  { id: '3', icon: 'videocam', label: '0:07' },
  { id: '4', icon: 'image', label: 'Photo' },
];

const ContactInfoScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { chat: routeChat } = route.params as { chat: Chat };
  const { theme } = useThemeStore();
  const { chats } = useChatStore();
  const chat = chats.find((item) => item.id === routeChat.id) || routeChat;
  const displayName = chat.title;
  const groupMembers = chat.participants || [];
  const groupMemberCount = groupMembers.length + (chat.isGroup ? 1 : 0);
  const phone = chat.userId ? `+1 234 567 890${chat.userId}` : `${groupMemberCount} members`;

  const quickActions = [
    { label: 'Audio', icon: 'call-outline' },
    { label: 'Video', icon: 'videocam-outline' },
    { label: 'Search', icon: 'search-outline' },
  ];

  const settingsRows = [
    { title: 'Manage storage', subtitle: '92.9 MB', icon: 'images-outline' },
    { title: 'Notifications', icon: 'notifications-outline' },
  ];

  const dangerRows = [
    { title: 'Add to Favorites', icon: 'heart-outline', danger: false },
    { title: 'Clear chat', icon: 'remove-circle-outline', danger: false },
    { title: `Block ${displayName}`, icon: 'ban-outline', danger: true },
    { title: `Report ${displayName}`, icon: 'thumbs-down-outline', danger: true },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topButton}>
          <Icon name="ellipsis-vertical" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.profileSection}>
          <Avatar source={chat.avatar || displayName.charAt(0)} size="extra-large" theme={theme} />
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.phone, { color: theme.textSecondary }]} numberOfLines={1}>
            {phone}
          </Text>
          <Text style={[styles.about, { color: theme.text }]}>
            Life is not a matter of holding good cards, but playing your card well....
          </Text>
        </View>

        <View style={styles.quickActionGrid}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[
                styles.quickAction,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
              activeOpacity={0.75}
            >
              <Icon name={action.icon} size={26} color={theme.primary} />
              <Text style={[styles.quickActionText, { color: theme.text }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.mediaHeader} activeOpacity={0.75}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Media, links, and docs
          </Text>
          <View style={styles.mediaCount}>
            <Text style={[styles.mediaCountText, { color: theme.textSecondary }]}>33</Text>
            <Icon name="chevron-forward" size={24} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        <FlatList
          data={mediaItems}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaList}
          renderItem={({ item }) => (
            <View style={[styles.mediaTile, { backgroundColor: theme.inputBackground }]}>
              <Icon name={item.icon} size={30} color={theme.primary} />
              <Text style={[styles.mediaLabel, { color: theme.text }]}>{item.label}</Text>
            </View>
          )}
        />

        <View style={styles.rowsSection}>
          {settingsRows.map((row) => (
            <TouchableOpacity key={row.title} style={styles.infoRow} activeOpacity={0.75}>
              <Icon name={row.icon} size={26} color={theme.textSecondary} />
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{row.title}</Text>
                {!!row.subtitle && (
                  <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                    {row.subtitle}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {chat.isGroup && (
          <View style={styles.membersSection}>
            <View style={styles.membersHeader}>
              <Text style={[styles.membersCount, { color: theme.textSecondary }]}>
                {groupMemberCount} members
              </Text>
              <TouchableOpacity style={styles.memberSearchButton} activeOpacity={0.75}>
                <Icon name="search" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.memberRow}
              activeOpacity={0.75}
              onPress={() =>
                navigation.navigate('SelectContact', {
                  mode: 'addMembers',
                  groupChatId: chat.id,
                })
              }
            >
              <View style={[styles.addMemberAvatar, { backgroundColor: theme.success }]}>
                <Icon name="person-add" size={24} color={theme.background} />
              </View>
              <Text style={[styles.addMemberText, { color: theme.text }]}>Add members</Text>
            </TouchableOpacity>

            <View style={styles.memberRow}>
              <Avatar source="Y" size="medium" theme={theme} />
              <View style={styles.memberCopy}>
                <Text style={[styles.memberName, { color: theme.text }]}>You</Text>
              </View>
            </View>

            {groupMembers.map((member, index) => (
              <View key={member.id} style={styles.memberRow}>
                <Avatar
                  source={member.avatar || member.name.charAt(0)}
                  size="medium"
                  theme={theme}
                />
                <View style={styles.memberCopy}>
                  <View style={styles.memberTitleRow}>
                    <Text
                      style={[
                        styles.memberName,
                        styles.memberNameInRow,
                        { color: theme.text },
                      ]}
                      numberOfLines={1}
                    >
                      {member.name}
                    </Text>
                    {index === 0 && (
                      <View
                        style={[
                          styles.adminBadge,
                          { backgroundColor: theme.primary },
                        ]}
                      >
                        <Text style={[styles.adminBadgeText, { color: theme.background }]}>
                          Group Admin
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.memberSubtitle, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {member.bio || member.phone || 'Available'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.rowsSection}>
          {dangerRows.map((row) => (
            <TouchableOpacity key={row.title} style={styles.infoRow} activeOpacity={0.75}>
              <Icon
                name={row.icon}
                size={26}
                color={row.danger ? theme.error : theme.textSecondary}
              />
              <Text
                style={[
                  styles.rowTitle,
                  styles.rowCopy,
                  { color: row.danger ? theme.error : theme.text },
                ]}
              >
                {row.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  topButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: SPACING.xxxl,
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  name: {
    fontSize: FONT_SIZES.giant,
    fontWeight: '700',
    marginTop: SPACING.lg,
  },
  phone: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  about: {
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: SPACING.lg,
  },
  quickActionGrid: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xxl,
  },
  quickAction: {
    flex: 1,
    minHeight: 86,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.xs,
  },
  quickActionText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  mediaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  mediaCount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mediaCountText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    marginRight: SPACING.xs,
  },
  mediaList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  mediaTile: {
    width: 112,
    height: 112,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  mediaLabel: {
    position: 'absolute',
    left: SPACING.sm,
    bottom: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  rowsSection: {
    paddingTop: SPACING.sm,
  },
  infoRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  rowCopy: {
    flex: 1,
    marginLeft: SPACING.xl,
  },
  rowTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.xs,
  },
  membersSection: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  membersHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
  },
  membersCount: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  memberSearchButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  addMemberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: SPACING.xl,
  },
  memberTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  memberNameInRow: {
    flex: 1,
    minWidth: 0,
  },
  addMemberText: {
    flex: 1,
    marginLeft: SPACING.xl,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  memberSubtitle: {
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.xs,
  },
  adminBadge: {
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  adminBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
});

export default ContactInfoScreen;
