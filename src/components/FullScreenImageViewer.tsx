import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  Dimensions,
  Animated,
  Image,
  FlatList,
  Text,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PinchGestureHandler, PanGestureHandler, State } from 'react-native-gesture-handler';
import { useAuthStore } from '../stores/authStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type MediaItem = { id: string; uri?: string; objectKey?: string; key?: string; type?: string; name?: string };

type MediaReaction = {
  mediaItemId: string;
  userId: string;
  reaction: string;
};

const MAX_ZOOM = 3; // similar to WhatsApp

const FullScreenImageViewer: React.FC<{
  visible: boolean;
  mediaItems: MediaItem[];
  startIndex?: number;
  onRequestClose?: () => void;
  // optional message object (when opened from chat) so callers can act on it
  message?: any;
  // callbacks to handle forward/delete actions using parent screen logic
  onForwardPress?: (messageOrMessages: any | any[]) => void;
  onDeletePress?: (messageOrMessages: any | any[]) => void;
  onReplyPress?: (messageOrMessages: any | any[]) => void;
  onReactPress?: (payload: { messageId: string; mediaItemId: string; mediaItemObjectKey?: string; reaction: string | null }) => void;
}> = ({ visible, mediaItems, startIndex = 0, onRequestClose, message, onForwardPress, onDeletePress, onReplyPress, onReactPress }) => {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const indexRef = useRef(startIndex);
  const listRef = useRef<FlatList<MediaItem> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [imgW, setImgW] = useState<number>(0);
  const [imgH, setImgH] = useState<number>(0);
  const [showControls, setShowControls] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [reactionPickerIndex, setReactionPickerIndex] = useState<number>(startIndex);
  const controlsAnim = useRef(new Animated.Value(0)).current;
  const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '😭'];

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '➕'];

  const toggleControls = () => {
    const next = !showControls;
    setShowControls(next);
    // clear selections when closing controls
    if (!next) setSelectedIndexes([]);
    Animated.timing(controlsAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const lastPan = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);

  useEffect(() => {
    console.log('[FullScreenImageViewer] prop update: visible=', visible, 'mediaItemsCount=', mediaItems?.length, 'startIndex=', startIndex);
  }, [visible, mediaItems, startIndex]);

  useEffect(() => {
    indexRef.current = startIndex;
    setCurrentIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: startIndex, animated: false });
      } catch (e) {}
    });
  }, [visible, startIndex]);

  useEffect(() => {
    if (!visible) return;
    const item = mediaItems[currentIndex];
    if (!item || !item.uri) return;
    // get image intrinsic size
    Image.getSize(
      item.uri,
      (w, h) => {
        setImgW(w);
        setImgH(h);
        // reset transforms
        baseScale.setValue(1);
        pinchScale.setValue(1);
        pan.setOffset({ x: 0, y: 0 });
        pan.setValue({ x: 0, y: 0 });
        lastPan.current = { x: 0, y: 0 };
        lastScale.current = 1;
      },
      () => {
        // fallback: assume square
        setImgW(SCREEN_WIDTH);
        setImgH(SCREEN_WIDTH);
      },
    );
  }, [visible, currentIndex, mediaItems, baseScale, pinchScale]);

  // calculate display size using sizing formula
  const getDisplaySize = () => {
    if (!imgW || !imgH) return { displayWidth: SCREEN_WIDTH, displayHeight: SCREEN_HEIGHT };
    const scaleFactor = Math.min(SCREEN_WIDTH / imgW, SCREEN_HEIGHT / imgH);
    return { displayWidth: imgW * scaleFactor, displayHeight: imgH * scaleFactor };
  };

  const getMediaItemKeys = (item?: MediaItem | null) => {
    if (!item) return [];
    // Only use stable identifiers (id and objectKey) to match reactions.
    // Avoid using React list `key` since it may be generated and not a stable media id.
    return [item.id, item.objectKey]
      .filter(Boolean)
      .map((value) => String(value));
  };

  const getCurrentMediaItem = () => mediaItems[currentIndex];

  const getCurrentMediaReactions = (): MediaReaction[] => {
    const currentItem = getCurrentMediaItem();
    const reactions = (Array.isArray(message?.mediaReactions) ? message.mediaReactions : []) as MediaReaction[];
    if (!currentItem || !reactions.length) return [];
    const keys = getMediaItemKeys(currentItem);
    if (!keys.length) return [];
    return reactions.filter((reaction) => keys.includes(String(reaction.mediaItemId)));
  };

  const getReactionSummary = () => {
    const totals: Record<string, number> = {};
    getCurrentMediaReactions().forEach((reaction) => {
      if (!reaction?.reaction) return;
      totals[reaction.reaction] = (totals[reaction.reaction] || 0) + 1;
    });

    return Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .map((reaction) => ({ reaction, count: totals[reaction] }));
  };

  const getCurrentUserReaction = () => {
    const currentMediaReactions = getCurrentMediaReactions();
    const userReaction = currentMediaReactions.find((r) => String(r.userId) === String(currentUserId));
    return userReaction?.reaction || null;
  };

  const handleEmojiSelect = (emoji: string) => {
    const targetIndex = typeof selectedIndexes[0] === 'number' ? selectedIndexes[0] : reactionPickerIndex;
    const targetItem = mediaItems[targetIndex];
    if (!targetItem || !message?.id || !onReactPress) {
      toggleControls();
      return;
    }

    onReactPress({
      messageId: String(message.id),
      mediaItemId: String(targetItem.id || targetItem.objectKey || targetItem.key),
      mediaItemObjectKey: targetItem.objectKey,
      reaction: emoji,
    });

    setReactionPickerIndex(targetIndex);
    toggleControls();
  };

  const reactionSummary = getReactionSummary();

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });

  const onPinchStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      let newScale = lastScale.current * event.nativeEvent.scale;
      newScale = Math.max(1, Math.min(newScale, MAX_ZOOM));
      lastScale.current = newScale;
      baseScale.setValue(newScale);
      pinchScale.setValue(1);
      // clamp pan after zoom ends
      clampPan(newScale);
    }
  };

  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: pan.x, translationY: pan.y } }],
    { useNativeDriver: true },
  );

  const onPanStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationX, translationY } = event.nativeEvent;
      const nextX = lastPan.current.x + translationX;
      const nextY = lastPan.current.y + translationY;
      lastPan.current.x = nextX;
      lastPan.current.y = nextY;
      pan.setOffset({ x: nextX, y: nextY });
      pan.setValue({ x: 0, y: 0 });
      // clamp to bounds
      clampPan(lastScale.current);
    }
  };

  const clampPan = (currentScale: number) => {
    const { displayWidth, displayHeight } = getDisplaySize();
    const scaledW = displayWidth * currentScale;
    const scaledH = displayHeight * currentScale;
    const boundX = Math.max(0, (scaledW - SCREEN_WIDTH) / 2);
    const boundY = Math.max(0, (scaledH - SCREEN_HEIGHT) / 2);
    // flatten any offset then clamp current animated value
    pan.flattenOffset();
    pan.stopAnimation((val: any) => {
      let nextX = Math.max(-boundX, Math.min(boundX, val.x || 0));
      let nextY = Math.max(-boundY, Math.min(boundY, val.y || 0));
      lastPan.current.x = nextX;
      lastPan.current.y = nextY;
      pan.setOffset({ x: nextX, y: nextY });
      pan.setValue({ x: 0, y: 0 });
    });
  };

  // double tap to zoom
  const lastTapRef = useRef<number>(0);
  const handleDoubleTap = () => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;
    if (delta < 300) {
      // double tap detected
      const target = lastScale.current > 1 ? 1 : 2.5;
      lastScale.current = target;
      Animated.timing(baseScale, { toValue: target, duration: 200, useNativeDriver: true }).start(() => {
        pinchScale.setValue(1);
        clampPan(target);
      });
    }
  };

  const { displayWidth, displayHeight } = getDisplaySize();

  // center the image in its container and apply pan/scale transforms
  const animatedStyle = {
    transform: [
      { translateX: pan.x },
      { translateY: pan.y },
      { scale },
    ],
  } as any;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onRequestClose} supportedOrientations={["portrait","landscape"]}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onRequestClose} onLongPress={() => {}} onPressIn={handleDoubleTap}>
          <View style={styles.flexFill} />
        </TouchableWithoutFeedback>

        {/* Back button - always visible */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => {
              if (showControls) {
                toggleControls();
              } else {
                // ensure selections cleared when closing viewer
                try { setSelectedIndexes([]); } catch (e) {}
                onRequestClose?.();
              }
            }} 
            style={styles.backButton} 
            activeOpacity={0.8}
          >
            <Icon name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Selected count shown next to back button when in selection mode */}
          {showControls && selectedIndexes.length > 0 && (
            <View style={styles.selectedCountHeader}>
              <Text style={styles.counterText}>{selectedIndexes.length}</Text>
            </View>
          )}
        </View>

        {/* Counter - always visible except on long press */}
        {mediaItems.length > 1 && !showControls ? (
          <View style={styles.counter}>
            <Text style={styles.counterText}>{currentIndex + 1} of {mediaItems.length}</Text>
          </View>
        ) : null}

        {/* Extra controls - appears on long press */}
          {showControls && (
          <Animated.View
            style={[
              styles.extraControls,
              {
                opacity: controlsAnim,
              },
            ]}
          >
            {selectedIndexes.length <= 1 && (
              <TouchableOpacity
                style={styles.headerIconButton}
                activeOpacity={0.8}
                onPress={() => {
                  try {
                    if (onReplyPress) {
                      if (selectedIndexes.length) {
                        // Reply to selected media item - use filtered mediaItems, not message.mediaItems
                        const selectedItem = mediaItems[selectedIndexes[0]];
                        const single = {
                          id: message?.id,
                          senderId: message?.senderId,
                          senderName: message?.senderName,
                          senderAvatar: message?.senderAvatar,
                          timestamp: message?.timestamp,
                          content: message?.content || '',
                          type: selectedItem?.type || 'image',
                          mediaItems: [selectedItem],
                          replyToMediaItemIndex: 0,
                          replyToMediaItemId: selectedItem?.id,
                          replyToMediaItemObjectKey: selectedItem?.objectKey,
                        };
                        console.log('[FullScreenImageViewer] Reply (selection) mediaId=', selectedItem?.id);
                        onReplyPress(single);
                      } else {
                        // Reply to currently viewed image - use filtered mediaItems, not message.mediaItems
                        const selectedItem = mediaItems[currentIndex];
                        if (selectedItem) {
                          const single = {
                            id: message?.id,
                            senderId: message?.senderId,
                            senderName: message?.senderName,
                            senderAvatar: message?.senderAvatar,
                            timestamp: message?.timestamp,
                            content: message?.content || '',
                            type: selectedItem?.type || 'image',
                            mediaItems: [selectedItem],
                            replyToMediaItemIndex: 0,
                            replyToMediaItemId: selectedItem?.id,
                            replyToMediaItemObjectKey: selectedItem?.objectKey,
                          };
                          console.log('[FullScreenImageViewer] Reply (current view) mediaId=', selectedItem?.id);
                          onReplyPress(single);
                        }
                      }
                    }
                  } catch (e) {}
                }}
              >
                <Icon name="chatbubble-ellipses-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {/* reply button removed per UX request - reply handled by parent chat page */}

            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.8}>
              <Icon name="star-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconButton}
              activeOpacity={0.8}
              onPress={() => {
                try {
                  if (onDeletePress) {
                    if (message && selectedIndexes.length) {
                      // Delete selected items - use filtered mediaItems to get IDs
                      const ids = selectedIndexes.map((si) => {
                        const mi = mediaItems[si];
                        return mi && (mi.id || mi.objectKey) ? (mi.id || mi.objectKey) : undefined;
                      }).filter(Boolean);
                      if (ids.length) onDeletePress({ messageId: message.id, mediaItemIds: ids });
                    } else if (message) {
                      // Delete single current item - use filtered mediaItems
                      const item = mediaItems[currentIndex];
                      if (item && (item.id || item.objectKey)) {
                        onDeletePress({ messageId: message.id, mediaItemIds: [item.id || item.objectKey] });
                      }
                    } else {
                      const item = mediaItems[currentIndex];
                      onDeletePress({ id: item.id, content: '', type: item.type || 'image', mediaItems: [item], mediaUrl: item.uri });
                    }
                  }
                } catch (e) {}
              }}
            >
              <Icon name="trash-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconButton}
              activeOpacity={0.8}
              onPress={() => {
                try {
                  if (onForwardPress) {
                    if (selectedIndexes.length) {
                      // Forward selected items - use filtered mediaItems, not message.mediaItems
                      const msgs = selectedIndexes.map((si) => {
                        const item = mediaItems[si];
                        return {
                          id: message?.id,
                          senderId: message?.senderId,
                          senderName: message?.senderName,
                          senderAvatar: message?.senderAvatar,
                          timestamp: message?.timestamp,
                          content: message?.content || '',
                          type: item?.type || 'image',
                          mediaItems: [item],
                        };
                      });
                      onForwardPress(msgs);
                    } else {
                      // Forward currently viewed item - use filtered mediaItems, not message.mediaItems
                      const currentItem = mediaItems[currentIndex];
                      if (currentItem) {
                        onForwardPress({
                          id: message?.id,
                          senderId: message?.senderId,
                          senderName: message?.senderName,
                          senderAvatar: message?.senderAvatar,
                          timestamp: message?.timestamp,
                          content: message?.content || '',
                          type: currentItem?.type || 'image',
                          mediaItems: [currentItem],
                        });
                      }
                    }
                  }
                } catch (e) {}
              }}
            >
              <Icon name="arrow-redo" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Emoji Picker - appears on long press */}
        {showControls && selectedIndexes.length <= 1 && (
          <Animated.View
            style={[
              styles.emojiPickerContainer,
              {
                opacity: controlsAnim,
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.emojiPickerContent}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.emojiScrollContent}
                scrollEnabled={reactionEmojis.length > 6}
              >
                {reactionEmojis.map((emoji, index) => {
                  const isActive = getCurrentUserReaction() === emoji;
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.emojiButton,
                        isActive && styles.emojiButtonActive,
                      ]}
                      onPress={() => handleEmojiSelect(emoji)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        <View style={styles.viewerArea} pointerEvents="box-none">
          
          <FlatList
            ref={listRef}
            data={mediaItems}
            keyExtractor={(mediaItem, index) => mediaItem.id || `${mediaItem.uri}-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(startIndex, Math.max(mediaItems.length - 1, 0))}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              indexRef.current = nextIndex;
              setCurrentIndex(nextIndex);
            }}
            renderItem={({ item, index }) => (
              <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}>
                <PanGestureHandler onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange} enabled={true} minDist={10}>
                  <Animated.View style={styles.flexFill}>
                    <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
                      <Animated.View style={styles.flexFill}>
                          <TouchableWithoutFeedback
                          onLongPress={() => {
                            try {
                              setSelectedIndexes([index]);
                              setReactionPickerIndex(index);
                            } catch (e) {}
                            if (!showControls) toggleControls();
                          }}
                          onPress={() => {
                            // when in selection mode, toggle selection for tapped image
                            if (showControls) {
                              const exists = selectedIndexes.includes(index);
                              const next = exists ? selectedIndexes.filter((i) => i !== index) : [...selectedIndexes, index];
                              setSelectedIndexes(next);
                              // if this tap cleared the last selection, close selection mode
                              if (next.length === 0) {
                                toggleControls();
                              }
                            }
                          }}
                        >
                          <View style={[{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }]} pointerEvents="box-none">
                            {item && (
                              <Animated.View
                                style={[
                                  {
                                    width: displayWidth,
                                    height: displayHeight,
                                    alignSelf: 'center',
                                  },
                                  animatedStyle,
                                ]}
                              >
                                <Animated.Image
                                  source={{ uri: item.uri || '' }}
                                  style={styles.fullImage}
                                  resizeMode="contain"
                                />

                                {!!reactionSummary.length && index === currentIndex && (
                                  <View style={styles.reactionBadge} pointerEvents="none">
                                    {reactionSummary.map((entry, badgeIndex) => (
                                      <View key={`${entry.reaction}-${badgeIndex}`} style={styles.reactionItem}>
                                        <Text style={styles.reactionEmoji}>{entry.reaction}</Text>
                                        <Text style={styles.reactionCount}>{entry.count}</Text>
                                      </View>
                                    ))}
                                  </View>
                                )}

                                {/* Blue selection overlay when selected */}
                                {selectedIndexes.includes(index) && (
                                  <View style={styles.longPressOverlay} pointerEvents="none" />
                                )}
                              </Animated.View>
                            )}
                          </View>
                        </TouchableWithoutFeedback>
                      </Animated.View>
                    </PinchGestureHandler>
                  </Animated.View>
                </PanGestureHandler>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  flexFill: { flex: 1 },
  viewerArea: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  centerArea: { justifyContent: 'center', alignItems: 'center' },
  header: {
    position: 'absolute',
    left: 0,
    top: Platform.OS === 'ios' ? 40 : 20,
    right: 0,
    height: 56,
    paddingHorizontal: 12,
    zIndex: 40,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 22,
  },
  counter: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 32,
    alignSelf: 'center',
    zIndex: 45,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  extraControls: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 20,
    right: 12,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 4,
    zIndex: 40,
    gap: 4,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  emojiPickerContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT / 2 - 40,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    paddingHorizontal: 16,
  },
  emojiPickerContent: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  longPressOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,122,255,0.22)',
    zIndex: 30,
  },
  emojiScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  emojiButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: 20,
  },
  emojiButtonActive: {
    borderWidth: 2,
    borderColor: '#7C3AED',
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  reactionBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    maxWidth: '88%',
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 60,
  },
  reactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  reactionEmoji: {
    fontSize: 15,
    marginRight: 3,
  },
  reactionCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  selectedCountHeader: {
    position: 'absolute',
    left: 64,
    top: Platform.OS === 'ios' ? 8 : 6,
    height: 32,
    minWidth: 32,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
});

export default FullScreenImageViewer;
