import React, { useEffect, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import Avatar from '../components/Avatar';
import api from '../config/api';
import messagesUtil from '../utils/messages';
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
  // derive display name, avatar and phone from possible shapes returned by backend
  let displayName = chat.title;
  const groupMembers = chat.participants || [];
  const [membersProfiles, setMembersProfiles] = useState<any[] | null>(null);
  const [mediaCount, setMediaCount] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(chat.ownerId || null);
  // member count should reflect actual participants array / resolved profiles
  const groupMemberCount = (membersProfiles ? membersProfiles.length : groupMembers.length);
  const { user } = useAuthStore();
  const currentUserId = user?.id;
  const otherParticipant = !chat.isGroup
    ? (chat.participants || []).find((p) => String(p.id) !== String(currentUserId))
    : null;

  const routeAny: any = route.params || {};
  const routeParticipant = routeAny.participant || routeAny.contact || routeAny.participantProfile || null;

  const sourceCandidates: any[] = [routeParticipant, otherParticipant, (chat as any).participantProfile, chat as any];

  // display name preference: displayName (DB) -> name -> chat.title
  if (!chat.isGroup) {
    for (const s of sourceCandidates) {
      if (!s) continue;
      if (s.displayName) {
        displayName = s.displayName;
        break;
      }
      if (s.name) {
        displayName = s.name;
        break;
      }
    }
  }

  const avatarSource =
    chat.avatar ||
    (routeParticipant as any)?.profilePictureUrl ||
    routeParticipant?.avatar ||
    (otherParticipant as any)?.profilePictureUrl ||
    otherParticipant?.avatar ||
    (chat as any).profilePictureUrl ||
    (chat as any).profilePicture ||
    displayName?.charAt(0);

  // helper: format +<country><number> => +<country> <number> (country 1-3 digits)
  const formatPhone = (p: string) => {
    if (!p || typeof p !== 'string') return '';
    const cleaned = p.replace(/\s+/g, '');
    // handle common India format (+91)
    if (cleaned.startsWith('+91') && cleaned.length > 3) {
      return `+91 ${cleaned.slice(3)}`;
    }
    const m = cleaned.match(/^(\+\d{1,3})(\d+)$/);
    if (m) return `${m[1]} ${m[2]}`;
    return p;
  };

  // phone preference: phoneNumber (DB) -> phone
  const initialPhoneRaw = chat.isGroup
    ? `${groupMemberCount} members`
    : (() => {
        for (const s of sourceCandidates) {
          if (!s) continue;
          if (s.phoneNumber) return s.phoneNumber;
          if (s.phone) return s.phone;
        }
        return '';
      })();

  const [phone, setPhone] = useState<string>(formatPhone(initialPhoneRaw));
  const [mediaPreviews, setMediaPreviews] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (chat.isGroup) return;
      if (phone) return; // already have phone
      const myId = user?.id;
      if (!myId) return;
      try {
        const res = await api.get('/conversations', { params: { userId: myId } });
        const convos: any[] = res.data.conversations || [];
        const match = convos.find((c) => String(c._id) === String((chat as any).conversationId) || String(c.id) === String(chat.id));
        if (match && match.participantProfile && !cancelled) {
          const raw = match.participantProfile.phoneNumber || match.participantProfile.phone || '';
          setPhone(formatPhone(raw));
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chat, user, phone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!chat) return;
      const convId = (chat as any).conversationId || chat.id;
      if (!convId) return;
      try {
        const msgs = await messagesUtil.getMessages(convId);
        if (cancelled) return;
        // extract media messages (type !== 'text') and take first 6
        const media = (msgs || []).filter((m: any) => m.type && m.type !== 'text');
        setMediaPreviews(media.slice(0, 6));
        setMediaCount(media.length);
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chat]);

  // fetch authoritative conversation and participant profiles for groups
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!chat || !chat.isGroup) return;
      try {
        const myId = (user && user.id) || null;
        // fetch conversations for user and find this conversation to get latest participants/owner
        const convRes = await api.get('/conversations', { params: { userId: myId } });
        const convos: any[] = convRes.data.conversations || [];
        const convId = (chat as any).conversationId || chat.id;
        const match = convos.find((c) => String(c._id) === String(convId) || String(c.id) === String(convId));
        const participants = (match && match.participants) || chat.participants || [];
        const foundOwner = (match && (match.ownerId || match.createdBy || match.owner)) || chat.ownerId || null;
        if (!cancelled && foundOwner) setOwnerId(String(foundOwner));
        if (cancelled) return;
        if (participants && participants.length) {
          // lookup user profiles for participants
          const usersResp = await api.post('/users/lookup', { ids: participants });
          const users = usersResp.data.users || [];
          if (!cancelled) setMembersProfiles(users);
        } else {
          setMembersProfiles([]);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chat, user]);

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
          <Avatar source={avatarSource} size="extra-large" theme={theme} />
          {displayName ? (
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {displayName}
            </Text>
          ) : null}
          {phone ? (
            <Text style={[styles.phone, { color: theme.textSecondary }]} numberOfLines={1}>
              {phone}
            </Text>
          ) : null}
          {/* Show group description or last message instead of hardcoded quote */}
          {chat.isGroup ? (
            <Text style={[styles.about, { color: theme.text }]} numberOfLines={2}>
              {chat.description || ''}
            </Text>
          ) : null}
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
            <Text style={[styles.mediaCountText, { color: theme.textSecondary }]}> {mediaCount !== null ? mediaCount : 0} </Text>
            <Icon name="chevron-forward" size={24} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        <FlatList
          data={mediaPreviews.length ? mediaPreviews : []}
          keyExtractor={(item, idx) => String(item.id || item._id || idx)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaList}
          renderItem={({ item }) => (
            <View style={[styles.mediaTile, { backgroundColor: theme.inputBackground }]}>
              {item.url || (item.attachment && item.attachment.url) ? (
                <Image
                  source={{ uri: item.url || item.attachment.url }}
                  style={{ width: 56, height: 56, borderRadius: 8 }}
                />
              ) : (
                <Icon name={item.icon || 'image'} size={30} color={theme.primary} />
              )}
              <Text style={[styles.mediaLabel, { color: theme.text }]}> 
                {item.label || (item.type ? item.type.toUpperCase() : '')}
              </Text>
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

            {(membersProfiles || groupMembers).map((member: any, index: number) => {
              // membersProfiles contains { id, displayName, profilePictureUrl, phoneNumber }
              const id = member.id || member._id || member;
              const name = member.displayName || member.name || member.title || '';
              const avatar = member.profilePictureUrl || member.avatar || (name ? name.charAt(0) : '');
              return (
                <View key={id || index} style={styles.memberRow}>
                  <Avatar source={avatar} size="medium" theme={theme} />
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
                        {name || 'Unknown'}
                      </Text>
                      {(ownerId && String(id) === String(ownerId)) || (!ownerId && chat.ownerId && String(id) === String(chat.ownerId)) || (index === 0 && !ownerId && !chat.ownerId) ? (
                        <View
                          style={[
                            styles.adminBadge,
                            { backgroundColor: theme.primary },
                          ]}
                        >
                          <Text style={[styles.adminBadgeText, { color: theme.background }]}>Group Admin</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[styles.memberSubtitle, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {(member.phoneNumber || (member as any).phone) || 'Available'}
                    </Text>
                  </View>
                </View>
              );
            })}
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
