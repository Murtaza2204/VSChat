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
import useMedia from '../hooks/useMedia';
import { fetchDownloadUrl } from '../services/mediaService';

interface ChatBubbleProps {
  message: string;
  timestamp: Date;
  isOwn: boolean;
  style?: ViewStyle;
  theme: any;
  read?: boolean;
  onLongPress?: () => void;
  onPress?: () => void;
  mediaUrl?: string;
  mediaItems?: Message['mediaItems'];
  metadata?: Message['metadata'];
  type?: Message['type'];
  call?: Message['call'];
  location?: Message['location'];
  onMediaPress?: (index?: number) => void;
  onForwardPress?: () => void;
  isSelected?: boolean;
  reaction?: string;
  reactions?: { userId: string; reaction: string }[];
  replyTo?: Message | null;
  replyToIndex?: number;
  replyToMediaItemId?: string;
  replyToMediaItemObjectKey?: string;
  onReplyPress?: () => void;
  onOpenReplyMedia?: (msg: Message, index?: number) => void;
  forwarded?: boolean;
  senderName?: string;
  senderAvatar?: string;
  showSenderInfo?: boolean;
  isGroupChat?: boolean;
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
  onPress,
  mediaUrl,
  mediaItems,
  metadata,
  type = 'text',
  call,
  location,
  onMediaPress,
  onForwardPress: _onForwardPress,
  isSelected = false,
  reaction,
  reactions = [],
  replyTo,
  onReplyPress,
  onOpenReplyMedia,
  replyToIndex,
  replyToMediaItemId,
  replyToMediaItemObjectKey,
  forwarded = false,
  senderName,
  senderAvatar,
  showSenderInfo = false,
  isGroupChat = false,
  status = 'sent',
}) => {
  const [now, setNow] = useState(Date.now());
  const [resolvedItemUrls, setResolvedItemUrls] = useState<Record<string, string>>({});
  const [replyThumbUri, setReplyThumbUri] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const { url: resolvedObjectUrl } = useMedia(metadata?.objectKey, true);

  useEffect(() => {
    if (type !== 'liveLocation' || !location?.expiresAt) return undefined;

    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [location?.expiresAt, type]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const bubbleColor = isOwn ? theme.messageGreen : theme.messageBlue;
  const liveLocationActive = type === 'liveLocation' && !!location?.expiresAt && now < location.expiresAt;
  useEffect(() => {
    // resolve reply thumbnail URI for the specific media index (if provided)
    let cancelled = false;
    (async () => {
      try {
        if (replyTo && replyTo.mediaItems && replyTo.mediaItems.length) {
          const item =
            replyTo.mediaItems.find((mediaItem: any) => {
              const itemIds = [mediaItem?.id, mediaItem?.objectKey, mediaItem?.key]
                .filter(Boolean)
                .map((value) => String(value));
              return (
                (replyToMediaItemId && itemIds.includes(String(replyToMediaItemId))) ||
                (replyToMediaItemObjectKey && itemIds.includes(String(replyToMediaItemObjectKey)))
              );
            }) ||
            (typeof replyToIndex === 'number' ? replyTo.mediaItems[replyToIndex] : undefined) ||
            replyTo.mediaItems[0];
          if (!item) {
            if (!cancelled) setReplyThumbUri(null);
            return;
          }
          if (item.uri) {
            if (!cancelled) setReplyThumbUri(item.uri);
            return;
          }
          if (item.objectKey) {
            try {
              const uri = await fetchDownloadUrl(item.objectKey);
              if (!cancelled) setReplyThumbUri(uri || null);
            } catch (e) {
              if (!cancelled) setReplyThumbUri(null);
            }
            return;
          }
        }
        if (!cancelled) setReplyThumbUri(null);
      } catch (e) {
        if (!cancelled) setReplyThumbUri(null);
      }
    })();
    return () => { cancelled = true; };
  }, [replyTo, replyToIndex, replyToMediaItemId, replyToMediaItemObjectKey]);

  useEffect(() => {
    const itemsNeedingUrls = (mediaItems || []).filter((item: any) => item?.objectKey && !item.uri && !resolvedItemUrls[item.objectKey]);
    if (!itemsNeedingUrls.length) return undefined;

    let cancelled2 = false;
    Promise.all(
      itemsNeedingUrls.map(async (item: any) => {
        try {
          const uri = await fetchDownloadUrl(item.objectKey);
          return [item.objectKey, uri] as const;
        } catch (e) {
          return [item.objectKey, ''] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled2) return;
      setResolvedItemUrls((current) => {
        const next = { ...current };
        entries.forEach(([key, uri]) => {
          if (uri) next[key] = uri;
        });
        return next;
      });
    });

    return () => {
      cancelled2 = true;
    };
  }, [mediaItems, resolvedItemUrls]);

  const resolvedMediaItems = (
    (mediaItems && mediaItems.length > 0
      ? mediaItems.map((item: any) => ({
          ...item,
          uri: item.uri || (item.objectKey ? resolvedItemUrls[item.objectKey] : undefined),
        })).filter((item: any) => !!item.uri)
      : undefined) ||
    ((mediaUrl || resolvedObjectUrl) && (type === 'image' || type === 'video')
      ? [
          {
            id: metadata?.objectKey || mediaUrl || resolvedObjectUrl || 'media',
            uri: mediaUrl || resolvedObjectUrl || '',
            type,
            name: message || type,
          },
        ]
      : [])
  );
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

  const isIncomingGroupMessage = isGroupChat && !isOwn;
  const showAvatarWithName = isIncomingGroupMessage && showSenderInfo;

  // Render system messages as a centered, muted pill
  if (type === 'system') {
    const display = (typeof message === 'string' && senderName && message.trim().startsWith('Someone'))
      ? message.replace(/^Someone\b/, senderName)
      : message;
    return (
      <View style={{ alignItems: 'center', marginVertical: SPACING.sm }}>
        <View style={[styles.systemContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Text style={[styles.systemText, { color: theme.textSecondary }]}>{display}</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View
        style={[
          styles.container,
          isIncomingGroupMessage && styles.avatarContainer,
          isOwn ? styles.ownContainer : styles.otherContainer,
          (!!reaction || (Array.isArray(reactions) && reactions.length > 0)) && { marginBottom: SPACING.lg + SPACING.sm },
          style,
        ]}
      >
        {showAvatarWithName ? (
          <Avatar
            source={senderAvatar}
            size="small"
            theme={theme}
            style={styles.leftAvatar}
          />
        ) : isIncomingGroupMessage ? (
          <View style={styles.leftAvatarSpacer} />
        ) : null}
      <TouchableOpacity
        onLongPress={onLongPress}
        onPress={onPress}
        style={[
          styles.bubble,
          isIncomingGroupMessage && styles.groupBubble,
          isMediaMessage && styles.mediaBubble,
          { 
            backgroundColor: isSelected
              ? isOwn
                ? 'rgba(96, 160, 84, 0.7)'
                : 'rgba(66, 133, 244, 0.7)'
              : isIncomingGroupMessage
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
            onPress={() => {
              try {
                console.log('[ChatBubble] reply preview pressed', { replyToId: replyTo?.id, hasMedia: !!(replyTo?.mediaItems?.length), onOpenReplyMediaFn: !!onOpenReplyMedia });
                if (replyTo.mediaItems && replyTo.mediaItems.length && onOpenReplyMedia) {
                  const idx = (() => {
                    const matchIndex = replyTo.mediaItems.findIndex((mediaItem: any) => {
                      const itemIds = [mediaItem?.id, mediaItem?.objectKey, mediaItem?.key]
                        .filter(Boolean)
                        .map((value) => String(value));
                      return (
                        (replyToMediaItemId && itemIds.includes(String(replyToMediaItemId))) ||
                        (replyToMediaItemObjectKey && itemIds.includes(String(replyToMediaItemObjectKey)))
                      );
                    });
                    if (matchIndex !== -1) return matchIndex;
                    if (typeof replyToIndex === 'number') return replyToIndex;
                    if (typeof replyTo.replyToMediaItemIndex === 'number') return replyTo.replyToMediaItemIndex;
                    return 0;
                  })();
                  console.log('[ChatBubble] calling onOpenReplyMedia with', { msgId: replyTo.id, mediaCount: replyTo.mediaItems.length, replyToIndex: idx });
                  onOpenReplyMedia(replyTo, idx);
                } else {
                  console.log('[ChatBubble] no media or no handler, calling onReplyPress');
                  onReplyPress && onReplyPress();
                }
              } catch (e) {
                console.error('[ChatBubble] reply preview error', e);
              }
            }}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text
                  style={[styles.replyContextMessage, { color: theme.textSecondary, flex: 1 }]}
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
                {replyTo.mediaItems && replyTo.mediaItems.length > 0 ? (
                  <View style={{ width: 40, height: 40, marginLeft: 8 }}>
                    <Image source={{ uri: replyThumbUri || (replyTo.mediaItems.find((mediaItem: any) => {
                      const itemIds = [mediaItem?.id, mediaItem?.objectKey, mediaItem?.key]
                        .filter(Boolean)
                        .map((value) => String(value));
                      return (
                        (replyToMediaItemId && itemIds.includes(String(replyToMediaItemId))) ||
                        (replyToMediaItemObjectKey && itemIds.includes(String(replyToMediaItemObjectKey)))
                      );
                    })?.uri) || (replyTo.mediaItems[(typeof replyToIndex === 'number' ? replyToIndex : 0)]?.uri) || '' }} style={{ width: 40, height: 40, borderRadius: 6 }} />
                  </View>
                ) : null}
              </View>
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
                  <Image source={{ uri: resolvedMediaItems[0].uri || '' }} style={styles.image} resizeMode="cover" />
                </View>
              </TouchableOpacity>
            )}

            {/* 2 images: two side-by-side */}
            {resolvedMediaItems.length === 2 && (
              <View style={styles.twoMediaRow}>
                {resolvedMediaItems.map((item, idx) => (
                  <TouchableOpacity key={item.id} activeOpacity={0.95} onPress={() => onMediaPress?.(idx)} onLongPress={onLongPress} style={styles.twoMediaPressable}>
                    <View style={[styles.mediaTile, styles.twoMediaTile]}>
                      <Image source={{ uri: item.uri || '' }} style={styles.image} resizeMode="cover" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* 3 images: one large image above two smaller images */}
            {resolvedMediaItems.length === 3 && (
              <View>
                <TouchableOpacity activeOpacity={0.95} onPress={() => onMediaPress?.(0)} onLongPress={onLongPress}>
                  <View style={[styles.mediaTile, styles.threeMediaHero]}>
                    <Image source={{ uri: resolvedMediaItems[0].uri || '' }} style={styles.image} resizeMode="cover" />
                  </View>
                </TouchableOpacity>
                <View style={styles.threeMediaBottomRow}>
                  {resolvedMediaItems.slice(1, 3).map((item, idx) => (
                    <TouchableOpacity key={item.id} activeOpacity={0.95} onPress={() => onMediaPress?.(idx + 1)} onLongPress={onLongPress} style={styles.twoMediaPressable}>
                      <View style={[styles.mediaTile, styles.threeMediaBottomTile]}>
                        <Image source={{ uri: item.uri || '' }} style={styles.image} resizeMode="cover" />
                      </View>
                    </TouchableOpacity>
                  ))}
                    </View>
              </View>
            )}

            {/* 4+ images: 2x2 grid showing all (wrap) */}
            {resolvedMediaItems.length >= 4 && (
              <View style={styles.gridContainer}>
                {resolvedMediaItems.slice(0, 4).map((item, idx) => (
                  <TouchableOpacity key={item.id} activeOpacity={0.95} onPress={() => onMediaPress?.(idx)} onLongPress={onLongPress} style={styles.gridTile}>
                    <Image source={{ uri: item.uri || '' }} style={styles.gridImage} resizeMode="cover" />
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
        {type === 'file' && (mediaUrl || resolvedObjectUrl || message) ? (
          <TouchableOpacity 
            activeOpacity={0.85} 
            style={[styles.fileContainer, { backgroundColor: isOwn ? theme.messageGreen : theme.surface }]} 
            onPress={() => console.info('Open file', mediaUrl || resolvedObjectUrl || message)}
            onLongPress={onLongPress}
          >
            <View style={styles.fileLeft}>
              <Icon name="document" size={26} color={theme.primary} />
            </View>
            <View style={styles.fileMeta}>
              <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={2}>{filenameFrom(message || mediaUrl || resolvedObjectUrl || undefined)}</Text>
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
        {type === 'deleted' ? (
          <View style={[styles.deletedContainer, { backgroundColor: isOwn ? theme.messageGreen : theme.surface }]}> 
            <Icon name="ban" size={18} color={isOwn ? '#000000' : theme.textSecondary} style={{ marginRight: 8 }} />
            <Text style={[styles.deletedText, { color: isOwn ? '#000000' : theme.textSecondary, fontStyle: 'italic' }]}>{message}</Text>
          </View>
        ) : type === 'text' ? (
          <View>
            <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
          </View>
        ) : null}

        <View style={[styles.footer, isMediaMessage && styles.mediaFooter]}>
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>{formatTime(timestamp)}</Text>
          {isOwn && (
            (() => {
              // Determine tick rendering. Preserve one-to-one behavior (status 'seen').
              const msgStatus = status || 'sent';
              const hasReadCount = typeof (message as any).readCount === 'number' && typeof (message as any).totalRecipients === 'number';
              const showBlue = hasReadCount ? ((message as any).readCount >= (message as any).totalRecipients) : (msgStatus === 'seen');

              if (msgStatus === 'sent') {
                return (
                  <Icon name="checkmark" size={14} color={theme.textSecondary} />
                );
              }

              if (showBlue) {
                return <Icon name="checkmark-done" size={16} color={theme.primary} />;
              }

              // If delivered but not all have read, show gray double-tick
              return <Icon name="checkmark-done" size={16} color={theme.textSecondary} />;
            })()
          )}
        </View>
        {
          (() => {
            // prefer explicit reactions array when provided
            // Do not render reactions on deleted messages
            if (type === 'deleted') return null;
            const arr = Array.isArray(reactions) && reactions.length ? reactions : (reaction ? [{ userId: '0', reaction }] : []);
            if (!arr || arr.length === 0) return null;
            const totals: Record<string, number> = {};
            let totalCount = 0;
            arr.forEach((r) => {
              if (!r || !r.reaction) return;
              totals[r.reaction] = (totals[r.reaction] || 0) + 1;
              totalCount += 1;
            });
            const sorted = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
            const displayEmojis = sorted.slice(0, 2).join(' ');

            return (
              <View style={[
                styles.reactionBadge,
                { backgroundColor: theme.surface },
                isOwn ? styles.reactionBadgeOwn : styles.reactionBadgeOther,
              ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.reactionText}>{displayEmojis}</Text>
                  {totalCount > 1 ? (
                    <View style={{ marginLeft: 6, backgroundColor: theme.primary, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: theme.background, fontSize: 12 }}>{totalCount}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })()
        }
      </TouchableOpacity>

      {/* Do not show an initial avatar under own messages. If the app should display the current user's avatar, it
          will be passed via `senderAvatar` and can be used elsewhere (e.g. profile). We purposely omit rendering
          the small avatar circle for own messages to match requested UI. */}
    </View>
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
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: SPACING.sm,
  },
  groupContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: SPACING.sm,
  },
  ownContainer: { alignItems: 'flex-end' },
  otherContainer: { alignItems: 'flex-start' },
  leftAvatar: {
    marginBottom: 2,
    marginRight: SPACING.sm,
  },
  systemContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: '80%',
  },
  systemText: {
    fontSize: 13,
    textAlign: 'center',
  },
  leftAvatarSpacer: {
    width: 32,
    marginRight: SPACING.sm,
  },
  rightAvatar: {
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'visible',
  },
  groupBubble: {
    maxWidth: '76%',
    borderTopLeftRadius: BORDER_RADIUS.md,
  },
  groupSenderAvatar: {
    marginBottom: 2,
  },
  groupSenderName: {
    fontSize: FONT_SIZES.sm,
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
  doubleCheckContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.xs,
    width: 16,
  },
  checkmarkOverlap: {
    marginRight: -4,
  },
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
  deletedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  deletedText: {
    fontSize: FONT_SIZES.base,
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
  twoMediaRow: {
    flexDirection: 'row',
    marginHorizontal: -1,
  },
  twoMediaPressable: {
    flex: 1,
    paddingHorizontal: 1,
  },
  twoMediaTile: {
    height: 164,
  },
  threeMediaHero: {
    height: 178,
    marginBottom: 2,
  },
  threeMediaBottomRow: {
    flexDirection: 'row',
    marginHorizontal: -1,
  },
  threeMediaBottomTile: {
    height: 98,
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
    bottom: -22,
    minWidth: 32,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    elevation: 3,
  },
  reactionText: {
    fontSize: 16,
    lineHeight: 18,
  },
  reactionBadgeOwn: {
    right: 12,
  },
  reactionBadgeOther: {
    left: 12,
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
