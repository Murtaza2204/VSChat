import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  Image,
  Linking,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MapView, { Marker } from 'react-native-maps';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/colors';
import { Message } from '../types';

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
  location?: Message['location'];
  onMediaPress?: () => void;
  onForwardPress?: () => void;
  isSelected?: boolean;
  reaction?: string;
  replyTo?: Message | null;
  onReplyPress?: () => void;
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
  location,
  onMediaPress,
  onForwardPress,
  isSelected = false,
  reaction,
  replyTo,
  onReplyPress,
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
  const mediaWidth = Math.min(268, Math.max(214, screenWidth * 0.64));

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
    <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer, style]}>
      <TouchableOpacity
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          isMediaMessage && styles.mediaBubble,
          { 
            backgroundColor: isSelected
              ? isOwn
                ? 'rgba(96, 160, 84, 0.7)'
                : 'rgba(66, 133, 244, 0.7)'
              : bubbleColor
          },
          isSelected && styles.selectedBubble,
          isOwn && SHADOWS.sm,
        ]}
        activeOpacity={0.8}
      >
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
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onMediaPress}
              onLongPress={onLongPress}
              style={styles.mediaStackButton}
            >
              {resolvedMediaItems.map((item) => (
                <View key={item.id} style={styles.mediaItemWrap}>
                  <View
                    style={[
                      styles.mediaTile,
                      { width: mediaWidth },
                      resolvedMediaItems.length === 1 && styles.singleMediaTile,
                    ]}
                  >
                    {item.type === 'image' ? (
                      <Image source={{ uri: item.uri }} style={styles.image} resizeMode="cover" />
                    ) : (
                      <View style={[styles.videoTile, { backgroundColor: theme.inputBackground }]}>
                        <Icon name="play-circle" size={46} color={theme.primary} />
                        <TouchableOpacity
                          activeOpacity={0.75}
                          style={[styles.videoPlayButton, { backgroundColor: theme.primary }]}
                          onPress={() => Linking.openURL(item.uri)}
                        >
                          <Icon name="play" size={16} color={theme.background} />
                          <Text style={[styles.videoPlayText, { color: theme.background }]}>
                            Play
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {onForwardPress && (
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={onForwardPress}
                      style={[
                        styles.forwardButton,
                        {
                          backgroundColor: theme.inputBackground,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Icon name="arrow-redo" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </TouchableOpacity>
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

        {/* Text fallback */}
        {type === 'text' && (
          <View>
            <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
          </View>
        )}

        <View style={[styles.footer, isMediaMessage && styles.mediaFooter]}>
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>{formatTime(timestamp)}</Text>
          {isOwn && read && <Icon name="checkmark-done" size={14} color={theme.primary} />}
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

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.md,
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
  mediaBubble: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  selectedBubble: {
    opacity: 0.95,
    elevation: 4,
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
});

export default ChatBubble;
