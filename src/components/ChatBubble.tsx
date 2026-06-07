import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
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
    if (type !== 'liveLocation' || !location?.expiresAt) {
      return undefined;
    }

    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [location?.expiresAt, type]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const bubbleColor = isOwn ? theme.messageGreen : theme.messageBlue;
  const liveLocationActive =
    type === 'liveLocation' && !!location?.expiresAt && now < location.expiresAt;

  return (
    <View
      style={[
        styles.container,
        isOwn ? styles.ownContainer : styles.otherContainer,
        style,
      ]}
    >
      <TouchableOpacity
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          {
            backgroundColor: bubbleColor,
          },
          isOwn && SHADOWS.sm,
        ]}
        activeOpacity={0.7}
      >
        {(type === 'location' || type === 'liveLocation') && location ? (
          <View style={styles.locationContent}>
            <View style={styles.mapPreview}>
              <MapView
                style={styles.map}
                pointerEvents="none"
                initialRegion={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker
                  coordinate={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }}
                />
              </MapView>
            </View>
            <View style={styles.locationMeta}>
              <Icon
                name={type === 'liveLocation' ? 'navigate-circle' : 'location'}
                size={20}
                color={theme.primary}
              />
              <View style={styles.locationTextBlock}>
                <Text style={[styles.locationTitle, { color: theme.text }]}>
                  {type === 'liveLocation' ? 'Live location' : 'Current location'}
                </Text>
                <Text style={[styles.locationSubtitle, { color: theme.textSecondary }]}>
                  {type === 'liveLocation'
                    ? liveLocationActive
                      ? `Active for ${location.durationLabel}`
                      : 'Live location ended'
                    : message}
                </Text>
              </View>
            </View>
          </View>
        ) : type === 'image' && mediaUrl ? (
          <View
            style={[
              styles.mediaContainer,
              { backgroundColor: theme.surface, borderRadius: BORDER_RADIUS.md },
            ]}
          >
            <Icon name="image" size={40} color={theme.textSecondary} />
            <Text style={[styles.mediaText, { color: theme.textSecondary }]}>
              Image
            </Text>
          </View>
        ) : type === 'video' && mediaUrl ? (
          <View
            style={[
              styles.mediaContainer,
              { backgroundColor: theme.surface, borderRadius: BORDER_RADIUS.md },
            ]}
          >
            <Icon name="play-circle" size={40} color={theme.textSecondary} />
            <Text style={[styles.mediaText, { color: theme.textSecondary }]}>
              Video
            </Text>
          </View>
        ) : (
          <Text style={[styles.message, { color: theme.text }]}>
            {message}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
            {formatTime(timestamp)}
          </Text>
          {isOwn && read && (
            <Icon name="checkmark-done" size={14} color={theme.primary} />
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  ownContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  message: {
    fontSize: FONT_SIZES.base,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: FONT_SIZES.xs,
    marginRight: SPACING.xs,
  },
  mediaContainer: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaText: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
  },
  locationContent: {
    width: 230,
  },
  mapPreview: {
    height: 140,
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  locationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTextBlock: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  locationTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: '700',
  },
  locationSubtitle: {
    fontSize: FONT_SIZES.sm,
    marginTop: 2,
  },
});

export default ChatBubble;
