import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  Dimensions,
  Animated,
  Image,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PinchGestureHandler, PanGestureHandler, State } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type MediaItem = { id: string; uri: string; type?: string; name?: string };

const MAX_ZOOM = 3; // similar to WhatsApp

const FullScreenImageViewer: React.FC<{
  visible: boolean;
  mediaItems: MediaItem[];
  startIndex?: number;
  onRequestClose?: () => void;
}> = ({ visible, mediaItems, startIndex = 0, onRequestClose }) => {
  const indexRef = useRef(startIndex);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [imgW, setImgW] = useState<number>(0);
  const [imgH, setImgH] = useState<number>(0);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const lastPan = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);

  useEffect(() => {
    indexRef.current = startIndex;
    setCurrentIndex(startIndex);
  }, [startIndex]);

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

  const item = mediaItems && mediaItems[currentIndex];
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

        {/* Back / close button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onRequestClose} style={styles.backButton} activeOpacity={0.8}>
            <Icon name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.viewerArea} pointerEvents="box-none">
          <PanGestureHandler onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange} enabled={true} minDist={10}>
            <Animated.View style={styles.flexFill}>
              <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
                <Animated.View style={styles.flexFill}>
                  <View style={[{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }]} pointerEvents="box-none">
                    {item && (
                      <Animated.Image
                        source={{ uri: item.uri }}
                        style={[
                          { width: displayWidth, height: displayHeight, alignSelf: 'center' },
                          animatedStyle,
                        ]}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                </Animated.View>
              </PinchGestureHandler>
            </Animated.View>
          </PanGestureHandler>
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
});

export default FullScreenImageViewer;
