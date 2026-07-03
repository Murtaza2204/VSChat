import React, { useEffect, useMemo, useRef, useState } from 'react';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  View,
  Image,
  Alert,
  Platform,
  ToastAndroid,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import Avatar from '../components/Avatar';
import GroupDescriptionModal from '../components/GroupDescriptionModal';
import api from '../config/api';
import messagesUtil from '../utils/messages';
import groupsApi from '../utils/groups';
import { findOrCreateConversation } from '../utils/conversations';
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
  const { chats, updateGroupTitle, removeGroupMembers } = useChatStore();
  const chat = chats.find((item) => item.id === routeChat.id) || routeChat;
  // derive display name, avatar and phone from possible shapes returned by backend
  let displayName = chat.title;
  const groupMembers = chat.participants || [];
  const [membersProfiles, setMembersProfiles] = useState<any[] | null>(null);
  const [mediaCount, setMediaCount] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(chat.ownerId || null);
  const [groupDescription, setGroupDescription] = useState<string>(chat.description || '');
  const [showDescriptionModal, setShowDescriptionModal] = useState<boolean>(false);
  const [isDescriptionSaving, setIsDescriptionSaving] = useState<boolean>(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState<boolean>(false);
  const [avatarState, setAvatarState] = useState<string | null>(
    (chat as any).groupProfilePicture || chat.avatar || null,
  );
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [titleDraft, setTitleDraft] = useState<string>(chat.title || '');
  const [isSavingGroupTitle, setIsSavingGroupTitle] = useState<boolean>(false);
  const [localTitle, setLocalTitle] = useState<string>(chat.title || '');
  const [isRemoveMode, setIsRemoveMode] = useState<boolean>(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isRemovingMembers, setIsRemovingMembers] = useState<boolean>(false);
  const [isMemberSearchVisible, setIsMemberSearchVisible] = useState<boolean>(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  const memberSearchInputRef = useRef<TextInput | null>(null);
  // member count should reflect actual participants array / resolved profiles
  const groupMemberCount = (membersProfiles ? membersProfiles.length : groupMembers.length);
  const { user } = useAuthStore();
  const currentUserId = user?.id;
  const otherParticipant = !chat.isGroup
    ? (chat.participants || []).find((p) => String(p.id) !== String(user?.id))
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
    avatarState ||
    chat.avatar ||
    (chat.isGroup ? '👥' : undefined) ||
    (routeParticipant as any)?.profilePictureUrl ||
    routeParticipant?.avatar ||
    (otherParticipant as any)?.profilePictureUrl ||
    otherParticipant?.avatar ||
    (chat as any).profilePictureUrl ||
    (chat as any).profilePicture ||
    displayName?.charAt(0);

  const initialAbout = (() => {
    for (const s of sourceCandidates) {
      if (!s) continue;
      if (s.bio) return s.bio;
      if (s.description) return s.description;
    }
    return '';
  })();

  const [about, setAbout] = useState<string>(initialAbout);

  const isAdmin = Boolean(
    currentUserId &&
      (ownerId ? String(currentUserId) === String(ownerId) : String(currentUserId) === String(chat.ownerId)),
  );

  useEffect(() => {
    if (isMemberSearchVisible) {
      setTimeout(() => memberSearchInputRef.current?.focus?.(), 0);
    } else {
      setMemberSearchQuery('');
    }
  }, [isMemberSearchVisible]);

  const normalizedMemberSearchQuery = memberSearchQuery.trim().toLowerCase();
  const filteredGroupMembers = useMemo(() => {
    const list = membersProfiles || groupMembers;
    if (!normalizedMemberSearchQuery) {
      return list;
    }

    return list.filter((member: any) => {
      const id = member.id || member._id || member;
      const memberId = String(id || '');
      const rawName = member.displayName || member.name || member.title || '';
      const phoneNumber = member.phoneNumber || member.phone || '';
      const displayName = String(memberId) === String(currentUserId) ? 'You' : rawName;
      return (
        displayName.toLowerCase().includes(normalizedMemberSearchQuery) ||
        String(rawName).toLowerCase().includes(normalizedMemberSearchQuery) ||
        String(phoneNumber).toLowerCase().includes(normalizedMemberSearchQuery)
      );
    });
  }, [groupMembers, membersProfiles, normalizedMemberSearchQuery, currentUserId]);

  const selectedMemberIdSet = new Set(selectedMemberIds);
  const isManageMembersEnabled = chat.isGroup && isAdmin;

  const getMemberId = (member: any) => member?.id || member?._id || member;
  const handleToggleMemberSelection = (member: any) => {
    const id = String(getMemberId(member) || '');
    if (!id || String(id) === String(currentUserId)) {
      return;
    }
    setSelectedMemberIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleNavigateToMemberChat = async (member: any) => {
    const memberId = String(getMemberId(member) || '');
    if (!memberId || String(memberId) === String(currentUserId) || !currentUserId) {
      return;
    }

    try {
      const response = await findOrCreateConversation(currentUserId, memberId);
      const conversation = response.conversation || response;
      navigation.navigate('Chat', {
        conversationId: conversation._id || conversation.id,
        participant: {
          id: memberId,
          title:
            member.displayName || member.name || member.title || member.phoneNumber || member.phone || 'Unknown',
          avatar: member.profilePictureUrl || member.avatar || undefined,
          phoneNumber: member.phoneNumber || member.phone,
          bio: member.bio,
        },
      });
    } catch (error: any) {
      console.warn('ContactInfoScreen: failed to open member chat', error?.message || error);
    }
  };

  const handleCancelRemoveMode = () => {
    setIsRemoveMode(false);
    setSelectedMemberIds([]);
  };

  const applyLocalMemberRemoval = (memberIds: string[]) => {
    setMembersProfiles((profiles) =>
      profiles ? profiles.filter((member) => !memberIds.includes(String(getMemberId(member)))) : profiles,
    );
  };

  const handleRemoveSelectedMembers = async () => {
    if (selectedMemberIds.length === 0) {
      return;
    }

    Alert.alert(
      `Remove ${selectedMemberIds.length} member${selectedMemberIds.length === 1 ? '' : 's'}?`,
      'Removed members will no longer be part of this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsRemovingMembers(true);
              const convId = (chat as any).conversationId || chat.id;
              await groupsApi.updateGroup(convId, {
                title: chat.title,
                description: groupDescription,
                addMembers: [],
                removeMembers: selectedMemberIds,
              });
              removeGroupMembers(convId, selectedMemberIds);
              applyLocalMemberRemoval(selectedMemberIds);
              setSelectedMemberIds([]);
              setIsRemoveMode(false);
              showSuccessMessage('Members removed from group');
            } catch (error: any) {
              console.error('Error removing members:', error);
              Alert.alert('Error', error.message || 'Unable to remove members from group');
            } finally {
              setIsRemovingMembers(false);
            }
          },
        },
      ],
    );
  };

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

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(chat.title || '');
      setLocalTitle(chat.title || '');
    }
  }, [chat.title, isEditingTitle]);
  const [mediaPreviews, setMediaPreviews] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (chat.isGroup) return;
      if (phone && about) return; // already have phone and about
      const myId = user?.id;
      if (!myId) return;
      try {
        const res = await api.get('/conversations', { params: { userId: myId } });
        const convos: any[] = res.data.conversations || [];
        const match = convos.find((c) => String(c._id) === String((chat as any).conversationId) || String(c.id) === String(chat.id));
        if (match && match.participantProfile && !cancelled) {
          const raw = match.participantProfile.phoneNumber || match.participantProfile.phone || '';
          setPhone(formatPhone(raw));
          if (match.participantProfile.bio) {
            console.log('ContactInfoScreen: Fetched bio from participant profile:', match.participantProfile.bio);
            setAbout(match.participantProfile.bio);
          }
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
    if ((chat as any).groupProfilePicture || (chat as any).avatar) {
      setAvatarState((chat as any).groupProfilePicture || (chat as any).avatar || null);
    }
  }, [chat]);

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
        const foundDescription = (match && match.description) || chat.description || '';
        const foundGroupPhoto = (match && (match.groupProfilePicture || match.avatar)) || (chat as any).groupProfilePicture || (chat as any).avatar || null;
        if (!cancelled && foundOwner) setOwnerId(String(foundOwner));
        if (!cancelled) setGroupDescription(foundDescription);
        if (!cancelled && foundGroupPhoto) setAvatarState(foundGroupPhoto);
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

  const handlePickGroupPhoto = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.85 as any, selectionLimit: 1 });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setIsAvatarUploading(true);
      const convId = (chat as any).conversationId || chat.id;
      const uploaded = await groupsApi.uploadGroupProfilePicture(convId, asset.uri);
      const nextAvatar = uploaded?.groupProfilePicture || null;
      setAvatarState(nextAvatar);
      useChatStore.getState().updateGroupAvatar(convId, nextAvatar);
      showSuccessMessage('Group profile picture updated');
    } catch (error: any) {
      console.error('Error updating group profile picture:', error);
      Alert.alert('Error', error.message || 'Unable to update group profile picture');
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleSaveGroupDescription = async (newDescription: string) => {
    try {
      setIsDescriptionSaving(true);
      const convId = (chat as any).conversationId || chat.id;
      
      // Save to backend
      await groupsApi.updateGroup(convId, {
        description: newDescription,
        addMembers: [],
        removeMembers: [],
      });

      // Update local state
      setGroupDescription(newDescription);
      setShowDescriptionModal(false);
      showSuccessMessage('Group description updated');
    } catch (error: any) {
      console.error('Error saving group description:', error);
      throw error;
    } finally {
      setIsDescriptionSaving(false);
    }
  };

  const handleStartEditTitle = () => {
    setTitleDraft(chat.title || '');
    setIsEditingTitle(true);
  };

  const handleSaveGroupTitle = async () => {
    if (!chat.isGroup) return;
    const nextTitle = titleDraft.trim() || 'Group';
    try {
      setIsSavingGroupTitle(true);
      const convId = (chat as any).conversationId || chat.id;
      const updatedGroup = await groupsApi.updateGroup(convId, {
        title: nextTitle,
        addMembers: [],
        removeMembers: [],
      });
      const savedTitle = updatedGroup?.title || nextTitle;
      updateGroupTitle(convId, savedTitle);
      setLocalTitle(savedTitle);
      showSuccessMessage('Group name updated');
      setIsEditingTitle(false);
    } catch (error: any) {
      console.error('Error saving group title:', error);
      Alert.alert('Error', error.message || 'Unable to update group name');
    } finally {
      setIsSavingGroupTitle(false);
    }
  };

  const quickActions = [
    { label: 'Audio', icon: 'call-outline' },
    { label: 'Video', icon: 'videocam-outline' },
    { label: 'Search', icon: 'search-outline' },
  ];

  const isIndividualChat = !chat.isGroup;

  const settingsRows = [
    { title: 'Manage storage', subtitle: '92.9 MB', icon: 'images-outline' },
  ];

  const dangerRows = [];
  dangerRows.push({ title: 'Clear chat', icon: 'remove-circle-outline', danger: false });
  if (chat.isGroup) {
    dangerRows.push({ title: 'Exit group', icon: 'log-out-outline', danger: true });
  } else {
    dangerRows.push({ title: 'Delete chat', icon: 'trash-outline', danger: true });
  }

  const showSuccessMessage = (message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Success', message);
    }
  };

  const cleanupConversationStorage = async (conversationId: string) => {
    try {
      await AsyncStorage.removeItem(`hiddenMediaItems:${conversationId}`);
    } catch (e) {
      // ignore storage cleanup errors
    }
  };

  const persistDeletedChatId = async (conversationId: string) => {
    try {
      const raw = await AsyncStorage.getItem('deletedChats');
      const deletedChats = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(deletedChats) ? deletedChats : [];
      if (!next.includes(conversationId)) {
        next.push(conversationId);
        await AsyncStorage.setItem('deletedChats', JSON.stringify(next));
      }
    } catch (e) {
      // ignore persistence errors
    }
  };

  const persistClearedChatAt = async (conversationId: string) => {
    try {
      const raw = await AsyncStorage.getItem('clearedChats');
      const clearedChats = raw ? JSON.parse(raw) : {};
      const next = clearedChats && typeof clearedChats === 'object' ? { ...clearedChats } : {};
      next[conversationId] = new Date().toISOString();
      await AsyncStorage.setItem('clearedChats', JSON.stringify(next));
    } catch (e) {
      // ignore persistence errors
    }
  };

  const handleClearChat = async () => {
    try {
      const conversationId = String((chat as any).conversationId || chat.id || '');
      const chatState = require('../stores/chatStore').useChatStore.getState();
      chatState.setCurrentChat(null);
      await cleanupConversationStorage(conversationId);
      await persistClearedChatAt(conversationId);
      showSuccessMessage('Chat cleared');
      if (navigation.canGoBack?.()) {
        navigation.goBack();
      } else {
        navigation.popToTop();
      }
    } catch (e) {
      console.warn('clear chat failed', e);
      Alert.alert('Error', 'Unable to clear chat. Please try again.');
    }
  };

  const handleDeleteChat = async () => {
    try {
      const conversationId = String((chat as any).conversationId || chat.id || '');
      const chatState = require('../stores/chatStore').useChatStore.getState();
      chatState.deleteChatForMe(conversationId);
      chatState.setCurrentChat(null);
      await cleanupConversationStorage(conversationId);
      await persistDeletedChatId(conversationId);
      showSuccessMessage('Chat deleted');
      navigation.popToTop();
    } catch (e) {
      console.warn('delete chat failed', e);
      Alert.alert('Error', 'Unable to delete chat. Please try again.');
    }
  };

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
          <TouchableOpacity onPress={chat.isGroup ? handlePickGroupPhoto : undefined} activeOpacity={0.8}>
            <Avatar source={avatarSource} size="extra-large" theme={theme} />
            {chat.isGroup && (
              <View style={[styles.avatarEditBadge, { backgroundColor: theme.primary }]}> 
                {isAvatarUploading ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="pencil" size={16} color="#fff" />} 
              </View>
            )}
          </TouchableOpacity>
          {chat.isGroup ? (
            <>
              {isEditingTitle ? (
                <View style={styles.titleEditRow}>
                  <TextInput
                    value={titleDraft}
                    onChangeText={setTitleDraft}
                    style={[styles.titleInput, { color: theme.text, borderColor: theme.border }]}
                    placeholder="Group name"
                    placeholderTextColor={theme.textSecondary}
                    editable={!isSavingGroupTitle}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveGroupTitle}
                  />
                </View>
              ) : (
                <View style={styles.titleRow}>
                  <View style={styles.iconSpacer} />
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {localTitle}
                  </Text>
                  {isAdmin ? (
                    <TouchableOpacity
                      style={styles.editNameIcon}
                      activeOpacity={0.8}
                      onPress={() => setIsEditingTitle(true)}
                    >
                      <Icon name="pencil-outline" size={20} color={theme.text} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.iconSpacer} />
                  )}
                </View>
              )}
              {isEditingTitle ? (
                <View style={styles.titleButtonRow}>
                  <TouchableOpacity
                    style={[styles.titleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setTitleDraft(chat.title || '');
                      setIsEditingTitle(false);
                    }}
                  >
                    <Text style={[styles.titleButtonText, { color: theme.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.titleButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                    activeOpacity={0.8}
                    onPress={handleSaveGroupTitle}
                    disabled={isSavingGroupTitle}
                  >
                    {isSavingGroupTitle ? (
                      <ActivityIndicator size="small" color={theme.background} />
                    ) : (
                      <Text style={[styles.titleButtonText, { color: theme.background }]}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
              <Text style={[styles.phone, { color: theme.textSecondary }]} numberOfLines={1}>
                {chat.isGroup ? `${groupMemberCount} members` : phone}
              </Text>
            </>
          ) : (
            displayName ? (
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                {displayName}
              </Text>
            ) : null
          )}
          {chat.isGroup ? (
            <TouchableOpacity
              style={styles.descriptionContainer}
              activeOpacity={0.75}
              onPress={() => setShowDescriptionModal(true)}
            >
              {groupDescription ? (
                <Text style={[styles.description, { color: theme.text }]} numberOfLines={2}>
                  {groupDescription}
                </Text>
              ) : (
                <Text style={[styles.descriptionPlaceholder, { color: theme.primary }]}>
                  Add group description
                </Text>
              )}
            </TouchableOpacity>
          ) : about ? (
            <Text style={[styles.about, { color: theme.text }]} numberOfLines={3}>
              {about}
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
              onPress={() => {
                if (action.label === 'Search') {
                  navigation.navigate('Chat', {
                    chat,
                    conversationId: (chat as any).conversationId || chat.id,
                    participant: chat.isGroup ? undefined : chat.participants?.find((participant: any) => String(participant.id) !== String(user?.id)),
                    searchMode: true,
                    searchQuery: '',
                  });
                }
              }}
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
              <View style={styles.memberHeaderButtons}>
                <TouchableOpacity
                  style={styles.memberSearchButton}
                  activeOpacity={0.75}
                  onPress={() => setIsMemberSearchVisible((prev) => !prev)}
                >
                  <Icon name="search" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
                {isManageMembersEnabled && (
                  <TouchableOpacity
                    style={styles.memberSearchButton}
                    activeOpacity={0.75}
                    onPress={() => setIsRemoveMode((prev) => !prev)}
                  >
                    <Icon
                      name={isRemoveMode ? 'close-outline' : 'person-remove-outline'}
                      size={24}
                      color={theme.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isMemberSearchVisible && (
              <View style={[styles.memberSearchContainer, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                <Icon name="search" size={20} color={theme.textSecondary} />
                <TextInput
                  ref={memberSearchInputRef}
                  style={[styles.memberSearchInput, { color: theme.text }]}
                  value={memberSearchQuery}
                  onChangeText={setMemberSearchQuery}
                  placeholder="Search members"
                  placeholderTextColor={theme.textSecondary}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {!!memberSearchQuery && (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setMemberSearchQuery('')}
                    style={styles.memberSearchClearButton}
                  >
                    <Icon name="close-circle" size={20} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

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

            {filteredGroupMembers.map((member: any, index: number) => {
              const id = member.id || member._id || member;
              const rawName = member.displayName || member.name || member.title || '';
              const memberId = String(id || '');
              const isCurrentUser = String(memberId) === String(currentUserId);
              const name = isCurrentUser ? 'You' : rawName;
              const avatar = member.profilePictureUrl || member.avatar || (rawName ? rawName.charAt(0) : '');
              const isSelected = selectedMemberIdSet.has(memberId);
              const isAdminBadge =
                (ownerId && String(memberId) === String(ownerId)) ||
                (!ownerId && chat.ownerId && String(memberId) === String(chat.ownerId)) ||
                (index === 0 && !ownerId && !chat.ownerId);

              return (
                <TouchableOpacity
                  key={memberId || index}
                  style={styles.memberRow}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (isRemoveMode && !isCurrentUser) {
                      handleToggleMemberSelection(member);
                    } else if (!isRemoveMode) {
                      handleNavigateToMemberChat(member);
                    }
                  }}
                >
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
                      {isAdminBadge ? (
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
                  {isRemoveMode ? (
                    <View
                      style={[
                        styles.selectionIndicator,
                        isCurrentUser && styles.selectionDisabled,
                        isSelected && styles.selectionIndicatorSelected,
                        { borderColor: isSelected ? theme.primary : theme.textSecondary },
                      ]}
                    >
                      {isSelected ? (
                        <Icon name="checkmark" size={18} color={theme.background} />
                      ) : isCurrentUser ? (
                        <Icon name="close" size={18} color={theme.textSecondary} />
                      ) : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {chat.isGroup && isRemoveMode && (
          <View style={styles.removeActionBar}>
            <TouchableOpacity
              style={[styles.cancelRemoveButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={handleCancelRemoveMode}
              activeOpacity={0.75}
            >
              <Text style={[styles.cancelRemoveButtonText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmRemoveButton,
                { backgroundColor: selectedMemberIds.length ? theme.error : theme.surface },
              ]}
              onPress={handleRemoveSelectedMembers}
              disabled={!selectedMemberIds.length || isRemovingMembers}
              activeOpacity={0.75}
            >
              {isRemovingMembers ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <Text
                  style={[
                    styles.confirmRemoveButtonText,
                    { color: selectedMemberIds.length ? theme.background : theme.textSecondary },
                  ]}
                >
                  Remove {selectedMemberIds.length} member{selectedMemberIds.length === 1 ? '' : 's'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.rowsSection}>
          {dangerRows.map((row) => (
              <TouchableOpacity
                key={row.title}
                style={styles.infoRow}
                activeOpacity={0.75}
                onPress={async () => {
                  try {
                      if (row.title === 'Clear chat') {
                        Alert.alert(
                          'Clear chat',
                          'Are you sure you want to clear this chat? This action cannot be undone.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Clear',
                              style: 'destructive',
                              onPress: handleClearChat,
                            },
                          ],
                        );
                        return;
                      }

                    if (chat.isGroup && row.title === 'Exit group') {
                      const title = `Exit group: "${chat.title || 'Group'}"?`;
                      Alert.alert(title, undefined, [
                                { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Exit group',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await groupsApi.leaveGroup((chat as any).conversationId || chat.id, currentUserId);
                              try {
                                const chatState = require('../stores/chatStore').useChatStore.getState();
                                chatState.deleteChatForMe((chat as any).conversationId || chat.id);
                                chatState.setCurrentChat(null);
                              } catch (e) {}
                              navigation.popToTop();
                            } catch (e) {
                              console.warn('leave failed', (e as any)?.message || String(e));
                              Alert.alert('Error', 'Leave failed');
                            }
                          },
                        },
                      ]);
                    } else if (row.title === 'Delete chat') {
                      Alert.alert(
                        'Delete chat',
                        'Are you sure you want to delete this chat? This action will remove the chat from your message list.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: handleDeleteChat,
                          },
                        ],
                      );
                    } else {
                      // fallback: no-op or future handlers for other rows
                    }
                  } catch (e) { console.warn('danger row press failed', e); }
                }}
              >
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

      <GroupDescriptionModal
        visible={showDescriptionModal}
        currentDescription={groupDescription}
        onClose={() => setShowDescriptionModal(false)}
        onSave={handleSaveGroupDescription}
        isLoading={isDescriptionSaving}
      />
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
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
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
  descriptionContainer: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  description: {
    fontSize: FONT_SIZES.base,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  descriptionPlaceholder: {
    fontSize: FONT_SIZES.base,
    fontWeight: '500',
    textAlign: 'center',
  },
  titleEditRow: {
    width: '100%',
    marginTop: SPACING.lg,
  },
  titleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  iconSpacer: {
    width: 28,
    height: 28,
  },
  editNameIcon: {
    marginLeft: SPACING.sm,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  editTitleButton: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  editTitleButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  titleButtonRow: {
    width: '100%',
    marginTop: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  titleButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
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
  memberHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberSearchContainer: {
    minHeight: 48,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberSearchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    marginRight: SPACING.xs,
    fontSize: FONT_SIZES.base,
    paddingVertical: 0,
  },
  memberSearchClearButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicator: {
    width: 28,
    height: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
  selectionIndicatorSelected: {
    backgroundColor: '#007AFF',
  },
  selectionDisabled: {
    opacity: 0.4,
  },
  removeActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#F8F8F8',
  },
  cancelRemoveButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  cancelRemoveButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  confirmRemoveButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  confirmRemoveButtonText: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
});

export default ContactInfoScreen;
