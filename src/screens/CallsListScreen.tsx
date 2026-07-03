import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useCallStore } from '../stores/callStore';
import { useAuthStore } from '../stores/authStore';
import { fetchCalls, fetchUsersByIds, RawCall } from '../utils/calls';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';
import CallCard from '../components/CallCard';
import EmptyState from '../components/EmptyState';
import { TextInput } from 'react-native';
import signaling from '../services/signaling';
import { AGORA_APP_ID, AGORA_CHANNEL, AGORA_TOKEN } from '../config/agora';

const CallsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { getSearchedCalls, setCalls } = useCallStore();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const [searchQuery, setSearchQuery] = React.useState('');

  const searchedCalls = getSearchedCalls(searchQuery);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user || !user.id) return;
      setLoading(true);
      setError(null);
      try {
        const rawCalls: RawCall[] = await fetchCalls(user.id, 1, 50);

        // normalize calls to app Call shape
        const calls = rawCalls.map((rc) => {
          const isGroupCall = rc.isGroupCall === true || String((rc.metadata && rc.metadata.isGroupCall) || '') === 'true';
          const callerId = rc.callerId || rc.caller || (rc.metadata && rc.metadata.callerId) || null;
          const calleeId = rc.calleeId || rc.callee || (rc.metadata && rc.metadata.calleeId) || null;
          const isCaller = String(callerId) === String(user.id) || String(callerId) === String(user.id || '');
          const otherId = isCaller ? calleeId : callerId;

          // try to extract name from metadata
          let name = null;
          try {
            if (rc.metadata) {
              const md = typeof rc.metadata === 'string' ? JSON.parse(rc.metadata) : rc.metadata;
              name = (isGroupCall
                ? md?.groupName || rc.groupName || 'Group call'
                : md?.callerName || md?.name || md?.displayName || md?.fromUser?.displayName || md?.fromUser?.name || null);
            }
          } catch (e) {
            name = null;
          }

          return {
            id: String(rc._id || rc.callId || Math.random()),
            userId: isGroupCall ? (rc.groupId || (rc.metadata && rc.metadata.groupId) || rc.callId || '') : (otherId || (rc.calleeId || rc.callerId) || ''),
            userName: name || String(otherId || 'Unknown'),
            userAvatar: isGroupCall ? (rc.groupAvatar || (rc.metadata && rc.metadata.groupAvatar) || undefined) : undefined,
            type: (rc.callType === 'video' || rc.callType === 'videocall') ? 'video' : 'audio',
            direction: isCaller ? 'outgoing' : 'incoming',
            duration: rc.durationSeconds || 0,
            timestamp: rc.createdAt ? new Date(rc.createdAt) : (rc.startedAt ? new Date(rc.startedAt) : new Date()),
            status: (rc.callStatus === 'missed' || rc.callStatus === 'noAnswer') ? 'missed' : 'completed',
          };
        });

        // find ids missing names
        const missingIds = Array.from(new Set(calls.filter(c => !c.userName || c.userName === String(c.userId)).map(c => String(c.userId)))).filter(Boolean);
        if (missingIds.length) {
          const users = await fetchUsersByIds(missingIds);
          const userMap: Record<string, any> = {};
          (users || []).forEach(u => { userMap[String(u.id || u._id)] = u; });
          calls.forEach((c) => {
            const u = userMap[String(c.userId)];
            if (u) {
              c.userName = u.displayName || u.name || c.userName;
              c.userAvatar = u.profilePictureUrl || u.avatar;
            }
          });
        }

        if (mounted) setCalls(calls as any);
      } catch (e: any) {
        console.warn('Failed to load calls', e);
        if (mounted) setError(e.message || 'Failed to load calls');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [user]);

  const renderCallItem = ({ item }: any) => (
    <CallCard
      call={item}
      onPress={() => navigation.navigate('CallDetails', { call: item })}
      onCallPress={(type) => {
        try {
          const callId = `cli-${Date.now()}`;
          const channel = `call-${callId}`;
          // Do not send a hardcoded token; let server generate and attach token/appId
          signaling.inviteCall(item.userId, type, {
            callId,
            channel,
            appId: AGORA_APP_ID,
          });

          navigation.navigate('ActiveCall', {
            callerName: item.userName,
            callerAvatar: item.userAvatar,
            peerName: item.userName,
            peerAvatar: item.userAvatar,
            calleeName: item.userName,
            calleeAvatar: item.userAvatar,
            callType: type,
            appId: AGORA_APP_ID,
            channel,
            callId,
            token: undefined,
            isCaller: true,
          });
        } catch (e) {
          console.warn('inviteCall failed', e);
        }
      }}
      theme={theme}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Calls</Text>
      </View>

      <View
        style={[
          styles.searchContainer,
          { backgroundColor: theme.inputBackground, borderColor: theme.border },
        ]}
      >
        <Icon name="search" size={20} color={theme.textSecondary} />
        <TextInput
          placeholder="Search calls"
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[styles.searchInput, { color: theme.text }]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {searchedCalls.length > 0 ? (
        <FlatList
          data={searchedCalls}
          renderItem={renderCallItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={true}
          contentContainerStyle={styles.callListContent}
        />
      ) : (
        <EmptyState
          icon="call"
          title="No Calls"
          message={searchQuery ? 'No calls match your search' : 'Your call history will appear here'}
          theme={theme}
        />
      )}

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: SPACING.sm,
    fontSize: FONT_SIZES.base,
  },
  callListContent: {
    paddingBottom: 96,
  },
  keypadButton: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
});

export default CallsListScreen;
