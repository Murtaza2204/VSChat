import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  Image,
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
  type?: Message['type'];
  location?: Message['location'];
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
  type = 'text',
  location,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (type !== 'liveLocation' || !location?.expiresAt) return undefined;

    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [location?.expiresAt, type]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const bubbleColor = isOwn ? theme.messageGreen : theme.messageBlue;
  const liveLocationActive = type === 'liveLocation' && !!location?.expiresAt && now < location.expiresAt;

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
        style={[styles.bubble, { backgroundColor: bubbleColor }, isOwn && SHADOWS.sm]}
        activeOpacity={0.8}
      >
        {/* Location */}
        {(type === 'location' || type === 'liveLocation') && location ? (
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
        ) : null}

        {/* Image */}
        {type === 'image' && mediaUrl ? (
          <View style={[styles.mediaContainer, { borderRadius: BORDER_RADIUS.md }]}>
            <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="cover" />
            {message ? <Text style={[styles.mediaCaption, { color: theme.textSecondary }]} numberOfLines={1}>{filenameFrom(message)}</Text> : null}
          </View>
        ) : null}

        {/* Video placeholder */}
        {type === 'video' && mediaUrl ? (
          <View style={[styles.mediaContainer, { borderRadius: BORDER_RADIUS.md }]}>
            <Icon name="play-circle" size={40} color={theme.textSecondary} />
            <Text style={[styles.mediaText, { color: theme.textSecondary }]}>Video</Text>
          </View>
        ) : null}

        {/* File / Document */}
        {type === 'file' && (mediaUrl || message) ? (
          <TouchableOpacity activeOpacity={0.85} style={[styles.fileContainer, { backgroundColor: isOwn ? theme.messageGreen : theme.surface }]} onPress={() => console.info('Open file', mediaUrl || message)}>
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

        <View style={styles.footer}>
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>{formatTime(timestamp)}</Text>
          {isOwn && read && <Icon name="checkmark-done" size={14} color={theme.primary} />}
        </View>
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
    overflow: 'hidden',
  },
  message: { fontSize: FONT_SIZES.base, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, justifyContent: 'flex-end' },
  timestamp: { fontSize: FONT_SIZES.xs, marginRight: SPACING.xs },
  mediaContainer: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%', borderRadius: BORDER_RADIUS.md },
  mediaText: { fontSize: FONT_SIZES.sm, marginTop: SPACING.sm },
  mediaCaption: { marginTop: 8, fontSize: FONT_SIZES.xs },
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
});

export default ChatBubble;
