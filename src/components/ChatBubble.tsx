import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  Image,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MapView, { Marker } from 'react-native-maps';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/colors';
import { Message } from '../types';
import Avatar from './Avatar';

interface ChatBubbleProps {
  message: string;
  timestamp: Date;
  isOwn: boolean;
  style?: ViewStyle;
  theme: any;
  read?: boolean;
  onLongPress?: () => void;
  mediaUrl?: string;
  mediaItems?: Message['mediaItems'];
  type?: Message['type'];
  call?: Message['call'];
  location?: Message['location'];
  onMediaPress?: (index?: number) => void;
  onForwardPress?: () => void;
  isSelected?: boolean;
  reaction?: string;
  replyTo?: Message | null;
  onReplyPress?: () => void;
  forwarded?: boolean;
  senderName?: string;
  senderAvatar?: string;
  showSenderInfo?: boolean;
  status?: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  timestamp,
  isOwn,
  style,
  theme,
  read,
  onLongPress,
  mediaUrl,
  mediaItems,
  type = 'text',
  call,
  location,
  onMediaPress,
  onForwardPress: _onForwardPress,
  isSelected = false,
  reaction,
  replyTo,
  onReplyPress,
  forwarded = false,
  senderName,
  senderAvatar,
  showSenderInfo = false,
  status = 'sent',
}) => {
  const [now, setNow] = useState(Date.now());
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    if (type !== 'liveLocation' || !location?.expiresAt) return undefined;

    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [location?.expiresAt, type]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const bubbleColor = isOwn ? theme.messageGreen : theme.messageBlue;
  const liveLocationActive = type === 'liveLocation' && !!location?.expiresAt && now < location.expiresAt;
  const resolvedMediaItems =
    mediaItems ||
    (mediaUrl && (type === 'image' || type === 'video')
      ? [
          {
            id: mediaUrl,
            uri: mediaUrl,
            type,
            name: message || type,
          },
        ]
      : []);
  const isMediaMessage =
    (type === 'image' || type === 'video' || type === 'mediaGroup') &&
    resolvedMediaItems.length > 0;
  const isCallMessage = type === 'call';
  const mediaWidth = Math.min(268, Math.max(214, screenWidth * 0.64));
  const senderColor = getSenderColor(senderName || '');
  const callKind = call?.type || (message.toLowerCase().includes('video') ? 'video' : 'voice');
  const isMissedCall = call?.status === 'missed';
  const isNoAnswerCall = call?.status === 'noAnswer';
  const callTitle = getCallTitle(callKind, call);
  const callStatus = getCallStatusText(call, message);
  const callIconColor = isMissedCall || isNoAnswerCall ? theme.error : theme.primary;

  // helpers
  const filenameFrom = (val?: string) => {
    if (!val) return '';
    try {
      return val.split('/').pop() || val;
    } catch {
      return val;
    }
  };

  return (
    <View
      style={[
        styles.container,
        showSenderInfo && styles.groupContainer,
        isOwn ? styles.ownContainer : styles.otherContainer,
        reaction && { marginBottom: SPACING.lg + SPACING.sm },
        style,
      ]}
    >
      {showSenderInfo ? (
        <Avatar
          source={senderAvatar || senderName?.charAt(0)}
          size="small"
          theme={theme}
          style={styles.groupSenderAvatar}
        />
      ) : null}
      <TouchableOpacity
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          showSenderInfo && styles.groupBubble,
          isMediaMessage && styles.mediaBubble,
          { 
            backgroundColor: isSelected
              ? isOwn
                ? 'rgba(96, 160, 84, 0.7)'
                : 'rgba(66, 133, 244, 0.7)'
              : showSenderInfo
                ? theme.surface
                : bubbleColor
          },
          isSelected && styles.selectedBubble,
          isOwn && SHADOWS.sm,
        ]}
        activeOpacity={0.8}
      >
        {showSenderInfo && senderName ? (
          <Text style={[styles.groupSenderName, { color: senderColor }]} numberOfLines={1}>
            {senderName}
          </Text>
        ) : null}

        {forwarded ? (
          <View style={styles.forwardedLabel}>
            <Icon name="arrow-redo" size={13} color={theme.textSecondary} />
            <Text style={[styles.forwardedText, { color: theme.textSecondary }]}>
              Forwarded
            </Text>
          </View>
        ) : null}

        {/* Reply Context */}
        {replyTo && (
          <TouchableOpacity
            onPress={onReplyPress}
            style={[
              styles.replyContext,
              { borderLeftColor: theme.primary },
            ]}
            activeOpacity={0.75}
          >
            <View style={styles.replyContextContent}>
              <Text style={[styles.replyContextSender, { color: theme.primary }]} numberOfLines={1}>
                {replyTo.senderName}
              </Text>
              <Text
                style={[styles.replyContextMessage, { color: theme.textSecondary }]}
                numberOfLines={2}
              >
                {replyTo.type === 'image' || replyTo.type === 'video'
                  ? `📎 ${replyTo.type === 'image' ? 'Photo' : 'Video'}`
                  : replyTo.type === 'location'
                    ? '📍 Location'
                    : replyTo.type === 'file'
                      ? '📄 Document'
                      : replyTo.content}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Location */}
        {(type === 'location' || type === 'liveLocation') && location ? (
          <TouchableOpacity
            onPress={() => {}}
            onLongPress={onLongPress}
            activeOpacity={0.8}
          >
            <View style={styles.locationContent}>
            <View style={styles.mapPreview}>
              <MapView
                style={styles.map}
                pointerEvents="none"
                initialRegion={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
              >
                <Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }} />
              </MapView>
            </View>
            <View style={styles.locationMeta}>
              <Icon name={type === 'liveLocation' ? 'navigate-circle' : 'location'} size={20} color={theme.primary} />
              <View style={styles.locationTextBlock}>
                <Text style={[styles.locationTitle, { color: theme.text }]}>{type === 'liveLocation' ? 'Live location' : 'Current location'}</Text>
                <Text style={[styles.locationSubtitle, { color: theme.textSecondary }]}>
                  {type === 'liveLocation' ? (liveLocationActive ? `Active for ${location.durationLabel}` : 'Live location ended') : message}
                </Text>
              </View>
            </View>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Media */}
        {isMediaMessage ? (
          <View style={[styles.mediaStack, { width: mediaWidth }]}> 
            {/* 1 image: single large */}
            {resolvedMediaItems.length === 1 && (
              <TouchableOpacity activeOpacity={0.95} onPress={() => onMediaPress?.(0)} onLongPress={onLongPress}>
                <View style={[styles.mediaTile, styles.singleMediaTile]}>
                  <Image source={{ uri: resolvedMediaItems[0].uri }} style={styles.image} resizeMode="cover" />
                </View>
              </TouchableOpacity>
            )}

            {/* 2 images: stacked one below another */}
            {resolvedMediaItems.length === 2 && (
              <View>
                {resolvedMediaItems.map((item, idx) => (
                  <TouchableOpacity key={item.id} activeOpacity={0.95} onPress={() => onMediaPress?.(idx)} onLongPress={onLongPress}>
                    <View style={[styles.mediaTile, { height: mediaWidth / 2, marginBottom: SPACING.sm }]}>
                      <Image source={{ uri: item.uri }} style={styles.image} resizeMode="cover" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* 3 images: big left + two small stacked right */}
            {resolvedMediaItems.length === 3 && (
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity activeOpacity={0.95} onPress={() => onMediaPress?.(0)} onLongPress={onLongPress} style={{ flex: 2, marginRight: SPACING.sm }}>
                  <View style={[styles.mediaTile, { height: mediaWidth }]}>
                    <Image source={{ uri: resolvedMediaItems[0].uri }} style={styles.image} resizeMode="cover" />
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1, justifyContent: 'space-between' }}>
                  <TouchableOpacity activeOpacity={0.95} onPress={() => onMediaPress?.(1)} onLongPress={onLongPress}>
                    <View style={[styles.mediaTile, { height: mediaWidth / 2, marginBottom: SPACING.sm }]}>
                      <Image source={{ uri: resolvedMediaItems[1].uri }} style={styles.image} resizeMode="cover" />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.95} onPress={() => onMediaPress?.(2)} onLongPress={onLongPress}>
                    <View style={[styles.mediaTile, { height: mediaWidth / 2 }]}>
                      <Image source={{ uri: resolvedMediaItems[2].uri }} style={styles.image} resizeMode="cover" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 4+ images: 2x2 grid showing all (wrap) */}
            {resolvedMediaItems.length >= 4 && (
              <View style={styles.gridContainer}>
                {resolvedMediaItems.slice(0, 4).map((item, idx) => (
                  <TouchableOpacity key={item.id} activeOpacity={0.95} onPress={() => onMediaPress?.(idx)} onLongPress={onLongPress} style={styles.gridTile}>
                    <Image source={{ uri: item.uri }} style={styles.gridImage} resizeMode="cover" />
                    {idx === 3 && resolvedMediaItems.length > 4 ? (
                      <View style={styles.moreOverlay}>
                        <Text style={styles.moreOverlayText}>+{resolvedMediaItems.length - 4}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {message ? (
              <Text style={[styles.mediaCaption, { color: theme.text }]}>{message}</Text>
            ) : null}
          </View>
        ) : null}

        {/* File / Document */}
        {type === 'file' && (mediaUrl || message) ? (
          <TouchableOpacity 
            activeOpacity={0.85} 
            style={[styles.fileContainer, { backgroundColor: isOwn ? theme.messageGreen : theme.surface }]} 
            onPress={() => console.info('Open file', mediaUrl || message)}
            onLongPress={onLongPress}
          >
            <View style={styles.fileLeft}>
              <Icon name="document" size={26} color={theme.primary} />
            </View>
            <View style={styles.fileMeta}>
              <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={2}>{filenameFrom(message || mediaUrl)}</Text>
              <Text style={[styles.fileSize, { color: theme.textSecondary }]}>Document</Text>
            </View>
            <Icon name="download" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        ) : null}

        {/* Call summary */}
        {isCallMessage ? (
          <View style={styles.callContent}>
            <View
              style={[
                styles.callIconCircle,
                isOwn ? styles.ownCallIconCircle : styles.otherCallIconCircle,
              ]}
            >
              <Icon
                name={callKind === 'video' ? 'videocam-outline' : 'call-outline'}
                size={20}
                color={callIconColor}
              />
            </View>
            <View style={styles.callTextBlock}>
              <Text style={[styles.callTitle, { color: theme.text }]}>{callTitle}</Text>
              <Text style={[styles.callSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {callStatus}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Text fallback */}
        {type === 'text' && (
          <View>
            <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
          </View>
        )}

        <View style={[styles.footer, isMediaMessage && styles.mediaFooter]}>
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>{formatTime(timestamp)}</Text>
          {isOwn && (
            (() => {
              const s = status || (read ? 'seen' : 'sent');
              const iconName = s === 'sent' ? 'checkmark' : 'checkmark-done';
              const iconColor = s === 'seen' ? theme.primary : theme.textSecondary;
              return (
                <Icon
                  name={iconName}
                  size={14}
                  color={iconColor}
                />
              );
            })()
          )}
        </View>
        {reaction ? (
          <View style={[styles.reactionBadge, { backgroundColor: theme.surface }]}>
            <Text style={styles.reactionText}>{reaction}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
};

const getSenderColor = (name: string) => {
  const colors = ['#53BDEB', '#FF7AA2', '#B18CFE', '#06CF9C', '#F9A825'];
  const total = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[total % colors.length];
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.md,
  },
  groupContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: SPACING.sm,
  },
  ownContainer: { alignItems: 'flex-end' },
  otherContainer: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'visible',
  },
  groupBubble: {
    maxWidth: '76%',
    marginLeft: SPACING.sm,
    borderTopLeftRadius: BORDER_RADIUS.md,
  },
  groupSenderAvatar: {
    marginBottom: 2,
  },
  groupSenderName: {
    fontSize: FONT_SIZES.base,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  mediaBubble: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  selectedBubble: {
    opacity: 0.95,
    elevation: 4,
  },
  forwardedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    gap: 4,
  },
  forwardedText: {
    fontSize: FONT_SIZES.xs,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  replyContext: {
    borderLeftWidth: 4,
    paddingLeft: SPACING.sm,
    marginBottom: SPACING.md,
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  replyContextContent: {
    gap: 2,
  },
  replyContextSender: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  replyContextMessage: {
    fontSize: FONT_SIZES.sm,
  },
  message: { fontSize: FONT_SIZES.base, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, justifyContent: 'flex-end' },
  mediaFooter: {
    minHeight: 22,
    paddingHorizontal: SPACING.xs,
    paddingBottom: 2,
  },
  timestamp: { fontSize: FONT_SIZES.xs, marginRight: SPACING.xs },
  mediaStack: {
    maxWidth: '100%',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridTile: {
    width: '50%',
    aspectRatio: 1,
    padding: 2,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.md,
  },
  moreOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.md,
    zIndex: 50,
    elevation: 50,
  },
  moreOverlayText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  mediaStackButton: {
    gap: 6,
  },
  mediaItemWrap: {
    position: 'relative',
  },
  mediaTile: {
    height: 156,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  singleMediaTile: {
    height: 268,
  },
  image: { width: '100%', height: '100%', borderRadius: BORDER_RADIUS.md },
  videoTile: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayButton: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoPlayText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  forwardButton: {
    position: 'absolute',
    left: -38,
    top: '50%',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -14 }],
  },
  mediaCaption: { marginTop: 8, paddingHorizontal: SPACING.xs, fontSize: FONT_SIZES.sm },
  locationContent: { width: 230 },
  mapPreview: { height: 140, overflow: 'hidden', borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.sm },
  map: { ...StyleSheet.absoluteFill },
  locationMeta: { flexDirection: 'row', alignItems: 'center' },
  locationTextBlock: { flex: 1, marginLeft: SPACING.sm },
  locationTitle: { fontSize: FONT_SIZES.base, fontWeight: '700' },
  locationSubtitle: { fontSize: FONT_SIZES.sm, marginTop: 2 },
  fileContainer: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: BORDER_RADIUS.md, minWidth: 160, maxWidth: '85%' },
  fileLeft: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  fileMeta: { flex: 1, marginRight: 8 },
  fileName: { fontSize: FONT_SIZES.sm, fontWeight: '600' },
  fileSize: { fontSize: FONT_SIZES.xs, marginTop: 4 },
  reactionBadge: {
    position: 'absolute',
    left: 10,
    bottom: -18,
    minWidth: 32,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    elevation: 2,
  },
  reactionText: {
    fontSize: 18,
  },
  callContent: {
    minWidth: 172,
    maxWidth: 230,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  callIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  ownCallIconCircle: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  otherCallIconCircle: {
    backgroundColor: 'rgba(134, 150, 160, 0.16)',
  },
  callTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  callTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  callSubtitle: {
    fontSize: FONT_SIZES.sm,
    marginTop: 1,
  },
});

const getCallTitle = (callKind: 'voice' | 'video', call?: Message['call']) => {
  const label = callKind === 'video' ? 'video call' : 'voice call';

  if (call?.status === 'missed') {
    return `Missed ${label}`;
  }

  return callKind === 'video' ? 'Video call' : 'Voice call';
};

const getCallStatusText = (call: Message['call'], message: string) => {
  if (call?.status === 'missed') {
    return call.direction === 'incoming' ? 'Tap to call back' : 'No answer';
  }

  if (call?.status === 'noAnswer') {
    return 'No answer';
  }

  if (call?.durationSeconds) {
    return formatCallDuration(call.durationSeconds);
  }

  return message.replace(/^video call\s*/i, '').replace(/^voice call\s*/i, '').trim() || 'No answer';
};

const formatCallDuration = (durationSeconds: number) => {
  if (durationSeconds < 60) {
    return `${durationSeconds} sec`;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return seconds ? `${minutes} min ${seconds} sec` : `${minutes} min`;
};

export default ChatBubble;
