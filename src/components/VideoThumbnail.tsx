import React, { useEffect, useState } from 'react';
import { Image, ActivityIndicator, View, ImageProps, ViewStyle } from 'react-native';
import Video from 'react-native-video';

interface VideoThumbnailProps extends ImageProps {
  containerStyle?: ViewStyle;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (error: any) => void;
}

export const VideoThumbnailComponent = React.forwardRef<
  any,
  VideoThumbnailProps
>(({ source, style, containerStyle, onLoadStart, onLoadEnd, onError, ...rest }, ref) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
    onLoadEnd?.();
  }, [onLoadEnd]);

  if (!source || typeof source === 'string') {
    return (
      <View style={[{ justifyContent: 'center', alignItems: 'center' }, style, containerStyle]}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }

  if ('uri' in source && source.uri) {
    return (
      <View style={[containerStyle, { overflow: 'hidden' }]}>
        <Video
          source={source}
          style={style}
          paused={true}
          controls={false}
          resizeMode="cover"
          onLoadStart={() => {
            setLoading(true);
            onLoadStart?.();
          }}
          onLoad={() => {
            setLoading(false);
            onLoadEnd?.();
          }}
          onError={(error) => {
            setLoading(false);
            onError?.(error);
          }}
          poster={undefined}
        />
      </View>
    );
  }

  return (
    <View style={[{ justifyContent: 'center', alignItems: 'center' }, style, containerStyle]}>
      <ActivityIndicator size="small" color="#999" />
    </View>
  );
});

VideoThumbnailComponent.displayName = 'VideoThumbnail';
