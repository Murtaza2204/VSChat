// @ts-nocheck
import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator, TextInput} from 'react-native';
import Header from '../components/Header';
import {useThemeStore} from '../stores/themeStore';
import {useAuthStore} from '../stores/authStore';
import groupsApi from '../utils/groups';
import messagesApi from '../utils/messages';
import Avatar from '../components/Avatar';

const GroupDetailsScreen = ({navigation, route}) => {
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const { groupId, chat } = route.params || {};
  const [group, setGroup] = useState(chat || null);
  const [members, setMembers] = useState((chat?.participants || []));
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(chat?.title || '');

  useEffect(() => {
    if (groupId) {
      loadGroup();
      loadMedia();
    }
  }, [groupId]);

  const loadGroup = async () => {
    setLoading(true);
    try {
      if (groupId && !chat) {
        const res = await groupsApi.getGroup(groupId);
        setGroup(res);
        setMembers(res.participants || []);
        setNewTitle(res.title || '');
      } else if (chat) {
        setMembers(chat.participants || []);
        setNewTitle(chat.title || '');
      }
    } catch (e) {
      console.warn('loadGroup failed', (e as any)?.message || String(e));
      Alert.alert('Error', 'Failed to load group details');
    }
    setLoading(false);
  };

  const loadMedia = async () => {
    try {
      if (!groupId) return;
      const msgs = await messagesApi.getMessagesForConversation(groupId);
      const mediaMsgs = (msgs || []).filter((m: any) => m.type && m.type !== 'text');
      setMedia(mediaMsgs.slice(0, 20)); // limit to 20 most recent
    } catch (e) {
      console.warn('loadMedia failed', (e as any)?.message || String(e));
    }
  };

  const handleRename = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Error', 'Enter a valid name');
      return;
    }
    setLoading(true);
    try {
      const updated = await groupsApi.updateGroup(groupId, { title: newTitle.trim() });
      setGroup(updated);
      setMembers(updated.participants || []);
      setEditing(false);
      Alert.alert('Success', 'Group renamed');
    } catch (e) {
      console.warn('rename failed', (e as any)?.message || String(e));
      Alert.alert('Error', 'Rename failed');
    }
    setLoading(false);
  };

  const handleLeave = () => {
    Alert.alert('Leave Group', 'Are you sure you want to leave this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await groupsApi.leaveGroup(groupId, user?.id);
            navigation.popToTop();
          } catch (e) {
            console.warn('leave failed', (e as any)?.message || String(e));
            Alert.alert('Error', 'Leave failed');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.background}]}>
      <Header
        title={group?.title || 'Group'}
        subtitle={`${members.length || 0} members`}
        theme={theme}
        onBackPress={() => navigation.goBack()}
      />
      {loading && !group ? (
        <ActivityIndicator size="large" color={theme.primary} style={{marginTop: 20}} />
      ) : (
        <ScrollView style={styles.content}>
          {/* Members Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: theme.text}]}>Members ({members.length})</Text>
            {members.map((m: any) => (
              <View key={m.id || m.userId || m.phoneNumber} style={styles.memberRow}>
                <Avatar size={40} uri={m.avatar} />
                <View style={{marginLeft: 12, flex: 1}}>
                  <Text style={[styles.name, {color: theme.text}]}>
                    {m.name || m.title || m.phoneNumber}
                  </Text>
                  <Text style={[styles.subtitle, {color: theme.textSecondary}]}>
                    {m.phoneNumber || ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Media Section */}
          {media.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, {color: theme.text}]}>Media ({media.length})</Text>
              <View style={styles.mediaGrid}>
                {media.map((m: any) => (
                  <TouchableOpacity
                    key={m._id || m.id}
                    style={styles.mediaItem}
                  >
                    {m.mediaUrl ? (
                      <Image source={{uri: m.mediaUrl}} style={styles.mediaImage} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Group Name Edit Section */}
          <View style={styles.section}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
              <Text style={[styles.sectionTitle, {color: theme.text}]}>Group Name</Text>
              {!editing && (
                <TouchableOpacity onPress={() => setEditing(true)}>
                  <Text style={{color: theme.primary, fontWeight: '600'}}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {editing ? (
              <View>
                <TextInput
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="Enter group name"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.surface,
                    },
                  ]}
                />
                <View style={{flexDirection: 'row', marginTop: 12, justifyContent: 'flex-end'}}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditing(false);
                      setNewTitle(group?.title || '');
                    }}
                    style={styles.button}
                  >
                    <Text style={{color: theme.textSecondary}}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleRename}
                    style={[styles.button, {marginLeft: 8}]}
                  >
                    <Text style={{color: theme.primary, fontWeight: '600'}}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={{color: theme.text, fontSize: 16}}>{group?.title || 'Unknown'}</Text>
            )}
          </View>

          {/* Leave Button */}
          <TouchableOpacity
            onPress={handleLeave}
            style={[styles.leaveButton, {backgroundColor: theme.error + '20'}]}
          >
            <Text style={{color: theme.error, fontWeight: '600'}}>Exit Group</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {flex: 1, padding: 16},
  section: {marginBottom: 24},
  sectionTitle: {fontSize: 18, fontWeight: '700', marginBottom: 12},
  memberRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ddd'},
  name: {fontSize: 16, fontWeight: '600'},
  subtitle: {fontSize: 12, marginTop: 2},
  mediaGrid: {flexDirection: 'row', flexWrap: 'wrap'},
  mediaItem: {width: '23%', marginRight: '2%', marginBottom: 12},
  mediaImage: {width: '100%', height: 80, borderRadius: 8},
  input: {borderWidth: 1, padding: 12, borderRadius: 8, fontSize: 16},
  button: {paddingVertical: 8, paddingHorizontal: 16},
  leaveButton: {paddingVertical: 16, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', marginBottom: 24},
});

export default GroupDetailsScreen;
