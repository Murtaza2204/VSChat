import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { errorCodes, isErrorWithCode, pick } from '@react-native-documents/picker';
import Geolocation from 'react-native-geolocation-service';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import { Message } from '../types';
import Avatar from '../components/Avatar';
import ChatBubble from '../components/ChatBubble';
import MessageInput from '../components/MessageInput';

const ChatScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { chat: routeChat } = route.params;
  const { theme } = useThemeStore();
  const { chats, messages, addMessage, updateMessage } = useChatStore();
  const chat = chats.find((item) => item.id === routeChat.id) || routeChat;
  const groupMemberCount = (chat.participants?.length || 0) + (chat.isGroup ? 1 : 0);
  const [messageText, setMessageText] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [locationMenuVisible, setLocationMenuVisible] = useState(false);
  const [liveDurationVisible, setLiveDurationVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const liveLocationWatchRef = useRef<number | null>(null);
  const liveLocationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liveLocationDurations = [
    { label: '15 min', value: 15 * 60 * 1000 },
    { label: '1 hr', value: 60 * 60 * 1000 },
    { label: '8 hr', value: 8 * 60 * 60 * 1000 },
  ];

  const menuOptions = [
    'New group',
    chat.isGroup ? 'View group info' : 'View contact',
    'Search',
    'Media, links, and docs',
    'Mute notifications',
    'Disappearing messages',
    'Chat theme',
    'More',
  ];

  const handleSendMessage = () => {
    if (messageText.trim()) {
      const newMessage: Message = {
        id: Math.random().toString(),
        senderId: 'me',
        senderName: 'You',
        content: messageText,
        type: 'text',
        timestamp: new Date(),
        read: true,
      };

      addMessage(chat.id, newMessage);
      setMessageText('');

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const addAttachmentMessage = (
    content: string,
    type: Message['type'],
    mediaUrl?: string,
  ) => {
    const newMessage: Message = {
      id: Math.random().toString(),
      senderId: 'me',
      senderName: 'You',
      content,
      type,
      timestamp: new Date(),
      read: true,
      mediaUrl,
    };

    addMessage(chat.id, newMessage);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const addLocationMessage = (
    content: string,
    type: 'location' | 'liveLocation',
    latitude: number,
    longitude: number,
    durationLabel?: string,
    expiresAt?: number,
  ) => {
    const newMessage: Message = {
      id: Math.random().toString(),
      senderId: 'me',
      senderName: 'You',
      content,
      type,
      timestamp: new Date(),
      read: true,
      location: {
        latitude,
        longitude,
        durationLabel,
        expiresAt,
      },
    };

    addMessage(chat.id, newMessage);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    return newMessage.id;
  };

  const clearLiveLocationWatch = () => {
    if (liveLocationWatchRef.current !== null) {
      Geolocation.clearWatch(liveLocationWatchRef.current);
      liveLocationWatchRef.current = null;
    }

    if (liveLocationTimeoutRef.current) {
      clearTimeout(liveLocationTimeoutRef.current);
      liveLocationTimeoutRef.current = null;
    }
  };

  const requestCameraPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        return status === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    } catch (error) {
      console.error('Camera permission error:', error);
      return false;
    }
  };

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'ios') {
        const status = await Geolocation.requestAuthorization('whenInUse');
        return status === 'granted';
      }

      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return status === PermissionsAndroid.RESULTS.GRANTED;
      }

      return true;
    } catch (error) {
      console.error('Location permission error:', error);
      Alert.alert('Permission Error', 'Unable to request location permission.');
      return false;
    }
  };

  const getCurrentPosition = async () => {
    try {
      const hasPermission = await requestLocationPermission();

      if (!hasPermission) {
        Alert.alert('Location Permission', 'Location permission is required to share your location.');
        return null;
      }

      return new Promise<Geolocation.GeoPosition | null>((resolve) => {
        try {
          Geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => {
              console.error('Geolocation error:', error);
              Alert.alert('Location Error', error.message || 'Unable to get your location. Please try again.');
              resolve(null);
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 10000,
            },
          );
        } catch (err) {
          console.error('Geolocation exception:', err);
          Alert.alert('Location Error', 'An error occurred while getting your location.');
          resolve(null);
        }
      });
    } catch (error) {
      console.error('getCurrentPosition error:', error);
      Alert.alert('Location Error', 'Unable to access location service.');
      return null;
    }
  };

  const handleGalleryPress = async () => {
    const result = await launchImageLibrary({
      mediaType: 'mixed',
      quality: 0.8,
      selectionLimit: 1,
    });

    if (result.didCancel) {
      return;
    }

    if (result.errorMessage) {
      Alert.alert('Gallery', result.errorMessage);
      return;
    }

    const asset = result.assets?.[0];
    if (asset?.uri) {
      const type = asset.type?.startsWith('video') ? 'video' : 'image';
      addAttachmentMessage(
        asset.fileName || (type === 'video' ? 'Video' : 'Photo'),
        type,
        asset.uri,
      );
    }
  };

  const handleCameraPress = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert('Camera Permission', 'Camera permission is required to take photos.');
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: true,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorMessage) {
        Alert.alert('Camera', result.errorMessage);
        return;
      }

      const asset = result.assets?.[0];
      if (asset?.uri) {
        addAttachmentMessage(asset.fileName || 'Photo', 'image', asset.uri);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Camera Error', 'An error occurred while accessing the camera.');
    }
  };

  const handleDocumentPress = async () => {
    try {
      const [document] = await pick({
        mode: 'open',
        allowMultiSelection: false,
      });

      if (document?.uri) {
        addAttachmentMessage(document.name || 'Document', 'file', document.uri);
      }
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }

      Alert.alert('Document', 'Unable to open file picker.');
    }
  };

  const handleCurrentLocationPress = async () => {
    try {
      setLocationMenuVisible(false);
      const position = await getCurrentPosition();

      if (!position) {
        return;
      }

      addLocationMessage(
        'Current location',
        'location',
        position.coords.latitude,
        position.coords.longitude,
      );
    } catch (error) {
      console.error('handleCurrentLocationPress error:', error);
      Alert.alert('Location Error', 'An error occurred while sharing your location.');
    }
  };

  const handleLiveLocationDurationPress = async (durationMs: number, label: string) => {
    try {
      setLiveDurationVisible(false);
      clearLiveLocationWatch();

      const position = await getCurrentPosition();

      if (!position) {
        return;
      }

      const expiresAt = Date.now() + durationMs;
      const messageId = addLocationMessage(
        `Live location - ${label}`,
        'liveLocation',
        position.coords.latitude,
        position.coords.longitude,
        label,
        expiresAt,
      );

      liveLocationWatchRef.current = Geolocation.watchPosition(
        (nextPosition) => {
          try {
            updateMessage(messageId, {
              location: {
                latitude: nextPosition.coords.latitude,
                longitude: nextPosition.coords.longitude,
                durationLabel: label,
                expiresAt,
              },
            });
          } catch (err) {
            console.error('Error updating location message:', err);
          }
        },
        (error) => {
          console.error('Live location watch error:', error);
          Alert.alert('Live Location', error.message || 'Unable to update live location.');
          clearLiveLocationWatch();
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10,
          interval: 30000,
          fastestInterval: 10000,
        },
      );

      liveLocationTimeoutRef.current = setTimeout(() => {
        clearLiveLocationWatch();
      }, durationMs);
    } catch (error) {
      console.error('handleLiveLocationDurationPress error:', error);
      Alert.alert('Location Error', 'An error occurred while starting live location.');
      clearLiveLocationWatch();
    }
  };

  const handleAttachmentOption = async (option: string) => {
    if (option === 'Gallery') {
      await handleGalleryPress();
      return;
    }

    if (option === 'Camera') {
      await handleCameraPress();
      return;
    }

    if (option === 'Document') {
      await handleDocumentPress();
      return;
    }

    if (option === 'Location') {
      setLocationMenuVisible(true);
    }
  };

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    return () => clearLiveLocationWatch();
  }, []);

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatBubble
      message={item.content}
      timestamp={item.timestamp}
      isOwn={item.senderId === 'me'}
      theme={theme}
      read={item.read}
      type={item.type}
      mediaUrl={item.mediaUrl}
      location={item.location}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.chatHeader,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerProfileButton}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('ContactInfo', { chat })}
        >
          <Avatar source={chat.avatar || chat.title.charAt(0)} size="medium" theme={theme} />
          <View style={styles.headerTextBlock}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {chat.title}
            </Text>
            {!!chat.isGroup && (
              <Text
                style={[styles.headerSubtitle, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {groupMemberCount} members
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.75}>
          <Icon name="videocam-outline" size={26} color={theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconButton}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('IncomingCall')}
        >
          <Icon name="call-outline" size={24} color={theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconButton}
          activeOpacity={0.75}
          onPress={() => setMenuVisible(true)}
        >
          <Icon name="ellipsis-vertical" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View
            style={[
              styles.menuContainer,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.text,
              },
            ]}
          >
            {menuOptions.map((option, index) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.menuItem,
                  index === menuOptions.length - 1 && styles.menuItemWithArrow,
                ]}
                activeOpacity={0.75}
                onPress={() => setMenuVisible(false)}
              >
                <Text style={[styles.menuText, { color: theme.text }]} numberOfLines={1}>
                  {option}
                </Text>
                {option === 'More' && (
                  <Icon name="chevron-forward" size={20} color={theme.textSecondary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={locationMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationMenuVisible(false)}
      >
        <Pressable
          style={styles.locationBackdrop}
          onPress={() => setLocationMenuVisible(false)}
        >
          <Pressable
            style={[
              styles.locationSheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.locationSheetTitle, { color: theme.text }]}>
              Share location
            </Text>

            <TouchableOpacity
              style={styles.locationAction}
              activeOpacity={0.75}
              onPress={handleCurrentLocationPress}
            >
              <View style={[styles.locationActionIcon, { backgroundColor: theme.inputBackground }]}>
                <Icon name="location" size={22} color={theme.primary} />
              </View>
              <View style={styles.locationActionTextBlock}>
                <Text style={[styles.locationActionTitle, { color: theme.text }]}>
                  Send current location
                </Text>
                <Text style={[styles.locationActionSubtitle, { color: theme.textSecondary }]}>
                  Share your location once
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locationAction}
              activeOpacity={0.75}
              onPress={() => {
                setLocationMenuVisible(false);
                setLiveDurationVisible(true);
              }}
            >
              <View style={[styles.locationActionIcon, { backgroundColor: theme.inputBackground }]}>
                <Icon name="navigate-circle" size={22} color={theme.primary} />
              </View>
              <View style={styles.locationActionTextBlock}>
                <Text style={[styles.locationActionTitle, { color: theme.text }]}>
                  Share live location
                </Text>
                <Text style={[styles.locationActionSubtitle, { color: theme.textSecondary }]}>
                  Updates until the selected time ends
                </Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={liveDurationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLiveDurationVisible(false)}
      >
        <Pressable
          style={styles.locationBackdrop}
          onPress={() => setLiveDurationVisible(false)}
        >
          <Pressable
            style={[
              styles.locationSheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.locationSheetTitle, { color: theme.text }]}>
              Live location duration
            </Text>

            {liveLocationDurations.map((duration) => (
              <TouchableOpacity
                key={duration.label}
                style={styles.durationOption}
                activeOpacity={0.75}
                onPress={() =>
                  handleLiveLocationDurationPress(duration.value, duration.label)
                }
              >
                <Text style={[styles.durationText, { color: theme.text }]}>
                  {duration.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onEndReachedThreshold={0.1}
      />

      <MessageInput
        value={messageText}
        onChangeText={setMessageText}
        onSend={handleSendMessage}
        onEmojiPress={() => {}}
        onAttachmentPress={() => {}}
        onAttachmentOptionSelect={handleAttachmentOption}
        onCameraPress={handleCameraPress}
        theme={theme}
        disabled={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatHeader: {
    minHeight: 64,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SPACING.sm,
    paddingRight: SPACING.xs,
  },
  backButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  headerProfileButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.xs,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
    marginLeft: SPACING.md,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  headerIconButton: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuContainer: {
    position: 'absolute',
    top: 62,
    right: SPACING.sm,
    width: 280,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    paddingVertical: SPACING.sm,
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  menuItem: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  menuItemWithArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: SPACING.md,
    justifyContent: 'flex-end',
  },
  locationBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  locationSheet: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  locationSheetTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  locationAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  locationActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  locationActionTextBlock: {
    flex: 1,
  },
  locationActionTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  locationActionSubtitle: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
  durationOption: {
    paddingVertical: SPACING.lg,
  },
  durationText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
});

export default ChatScreen;
