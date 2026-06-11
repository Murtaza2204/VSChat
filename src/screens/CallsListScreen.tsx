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
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';
import CallCard from '../components/CallCard';
import EmptyState from '../components/EmptyState';
import { TextInput } from 'react-native';
import signaling from '../services/signaling';
import { AGORA_APP_ID, AGORA_CHANNEL, AGORA_TOKEN } from '../config/agora';

const CallsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { getSearchedCalls } = useCallStore();
  const { theme } = useThemeStore();
  const [searchQuery, setSearchQuery] = React.useState('');

  const searchedCalls = getSearchedCalls(searchQuery);

  const renderCallItem = ({ item }: any) => (
    <CallCard
      call={item}
      onPress={() => navigation.navigate('CallDetails', { call: item })}
      onCallPress={(type) => {
        try {
          signaling.inviteCall(item.userId, type, {
            channel: AGORA_CHANNEL,
            token: AGORA_TOKEN,
            appId: AGORA_APP_ID,
          });
        } catch (e) {
          console.warn('inviteCall failed', e);
        }

        navigation.navigate('ActiveCall', {
          callerName: item.userName,
          callerAvatar: item.userAvatar,
          callType: type,
          appId: AGORA_APP_ID,
          channel: AGORA_CHANNEL,
          token: AGORA_TOKEN,
        });
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

      <TouchableOpacity
        style={[styles.keypadButton, { backgroundColor: theme.primary }]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DialPad')}
      >
        <Icon name="keypad" size={26} color={theme.background} />
      </TouchableOpacity>
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
