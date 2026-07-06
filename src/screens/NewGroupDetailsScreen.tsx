import React, { useMemo, useState } from 'react';
import {  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import Avatar from '../components/Avatar';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { Message } from '../types';
import groupsApi from '../utils/groups';

const NewGroupDetailsScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { createGroup } = useChatStore();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState('');
  const selectedMembers = useMemo<any[]>(
    () => route.params?.selectedContacts || [],
    [route.params],
  );
  const pendingForwardMessage = route.params?.forwardMessage as Message | undefined;

  const handleCreateGroup = async () => {
    if (!selectedMembers.length) return;
    try {
      const ownerId = user?.id;
      const participantIds = selectedMembers.map((m) => m.userId || m.id);
      const created = await groupsApi.createGroup(groupName || 'Group', participantIds, ownerId || null);
      
      // add to local chat store
      useChatStore.getState().createGroup(
        created.title,
        selectedMembers.map((m) => ({ id: m.userId || m.id, title: m.displayName || m.title })),
        created.createdAt,
      );
      // if we were forwarding a message into the new group, persist it
      if (pendingForwardMessage) {
        try {
          const forwardedFrom = { senderName: pendingForwardMessage.senderName, originalContent: pendingForwardMessage.content };
          const sent = await import('../utils/messages').then((mod) =>
            mod.sendMessage(created._id, user?.id, pendingForwardMessage.content, pendingForwardMessage.type, undefined, undefined, true, forwardedFrom),
          );
          // add to local chat store
          useChatStore.getState().addMessage(created._id, {
            id: sent._id,
            senderId: sent.senderId,
            senderName: sent.senderId === user?.id ? 'You' : sent.senderName || 'Them',
            content: sent.content,
            type: sent.type,
            timestamp: new Date(sent.createdAt),
            read: false,
            status: sent.status || 'sent',
            forwarded: !!sent.forwarded,
            forwardedFrom: sent.forwardedFrom || forwardedFrom,
          } as any);
        } catch (e) {
          console.warn('Failed to forward into new group', e);
        }
      }
      
      // navigate to Chat screen for the new group
      navigation.reset({
        index: 1,
        routes: [
          { name: 'ChatList' },
          {
            name: 'Chat',
            params: {
              conversationId: created._id,
              participant: { id: created._id, title: created.title, isGroup: true },
            },
          },
        ],
      });
    } catch (e) {
      console.error('Failed to create group', e);
      Alert.alert('Create group failed', (e as any)?.message || 'Unable to create group');
    }
  };

  const renderMember = (member: any) => (
    <View key={member.id || member.userId} style={styles.memberItem}>
      <Avatar
        source={member.avatar || (member.title ? member.title.charAt(0) : '')}
        size="large"
        theme={theme}
      />
      <Text style={[styles.memberName, { color: theme.textSecondary }]} numberOfLines={1}>
        {member.title || member.displayName}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>New group</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.groupSetupRow}>
          <TouchableOpacity
            style={[styles.groupPhotoButton, { backgroundColor: theme.secondary }]}
            activeOpacity={0.8}
          >
            <Icon name="camera-outline" size={24} color={theme.textSecondary} />
            <Icon
              name="add"
              size={14}
              color={theme.textSecondary}
              style={styles.photoAddIcon}
            />
          </TouchableOpacity>

          <View
            style={[
              styles.nameInputWrap,
              { borderColor: theme.primary, backgroundColor: theme.background },
            ]}
          >
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.nameInput, { color: theme.text }]}
              returnKeyType="done"
            />
          </View>

          <TouchableOpacity style={styles.emojiButton} activeOpacity={0.75}>
            <Icon name="happy-outline" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>


        <View style={styles.membersSection}>
          <Text style={[styles.membersLabel, { color: theme.textSecondary }]}>
            Members: {selectedMembers.length}
          </Text>
          <View style={styles.membersGrid}>{selectedMembers.map(renderMember)}</View>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.createButton,
          {
            backgroundColor: selectedMembers.length ? theme.success : theme.border,
            opacity: selectedMembers.length ? 1 : 0.65,
            bottom: SPACING.xl + insets.bottom,
          },
        ]}
        activeOpacity={selectedMembers.length ? 0.85 : 1}
        onPress={handleCreateGroup}
      >
        <Icon
          name="checkmark"
          size={30}
          color={selectedMembers.length ? theme.background : theme.textSecondary}
        />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 68,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  headerButton: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 120,
  },
  groupSetupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.xxl,
    marginBottom: SPACING.xxl,
  },
  groupPhotoButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.lg,
  },
  photoAddIcon: {
    position: 'absolute',
    right: 10,
    top: 12,
  },
  nameInputWrap: {
    flex: 1,
    minHeight: 64,
    borderWidth: 2,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  nameInput: {
    fontSize: FONT_SIZES.lg,
    padding: 0,
  },
  emojiButton: {
    width: 40,
    height: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
  settingRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.xs,
  },
  membersSection: {
    marginTop: SPACING.xl,
  },
  membersLabel: {
    fontSize: FONT_SIZES.lg,
    marginBottom: SPACING.xl,
  },
  membersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  memberItem: {
    width: 88,
    alignItems: 'center',
    marginRight: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  memberName: {
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.sm,
    maxWidth: 86,
  },
  createButton: {
    position: 'absolute',
    right: SPACING.lg,
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
});

export default NewGroupDetailsScreen;

