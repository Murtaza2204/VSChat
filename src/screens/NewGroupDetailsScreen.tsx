import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Avatar from '../components/Avatar';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { Chat } from '../types';

const NewGroupDetailsScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const { chats, createGroup, setCurrentChat } = useChatStore();
  const [groupName, setGroupName] = useState('');
  const selectedIds = useMemo<string[]>(
    () => route.params?.selectedIds || [],
    [route.params],
  );

  const selectedMembers = useMemo(
    () => chats.filter((chat) => selectedIds.includes(chat.id)),
    [chats, selectedIds],
  );

  const handleCreateGroup = () => {
    if (!selectedMembers.length) {
      return;
    }

    const newGroup = createGroup(groupName, selectedMembers);
    setCurrentChat(newGroup);
    navigation.reset({
      index: 1,
      routes: [
        { name: 'ChatList' },
        { name: 'Chat', params: { chat: newGroup } },
      ],
    });
  };

  const renderMember = (member: Chat) => (
    <View key={member.id} style={styles.memberItem}>
      <Avatar
        source={member.avatar || member.title.charAt(0)}
        size="large"
        theme={theme}
      />
      <Text style={[styles.memberName, { color: theme.textSecondary }]} numberOfLines={1}>
        {member.title}
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

        <TouchableOpacity style={styles.settingRow} activeOpacity={0.75}>
          <View>
            <Text style={[styles.settingTitle, { color: theme.text }]}>
              Disappearing messages
            </Text>
            <Text style={[styles.settingSubtitle, { color: theme.textSecondary }]}>Off</Text>
          </View>
          <Icon name="timer-outline" size={30} color={theme.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow} activeOpacity={0.75}>
          <Text style={[styles.settingTitle, { color: theme.text }]}>Group permissions</Text>
          <Icon name="settings-outline" size={30} color={theme.textSecondary} />
        </TouchableOpacity>

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
    bottom: SPACING.xl,
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
});

export default NewGroupDetailsScreen;
