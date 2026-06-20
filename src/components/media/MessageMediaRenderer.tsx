import React, { useCallback, useRef } from 'react';
import { View, Text } from 'react-native';
import { MessageRecord } from '../../types/mediaTypes';
import { ImageMessage, VideoMessage, AudioMessage, DocumentMessage } from './index';

export default function MessageMediaRenderer({ message, visible }: { message: MessageRecord; visible: boolean }) {
  const type = message.metadata?.mediaType || message.type;
  switch (type) {
    case 'image':
      return <ImageMessage message={message} visible={visible} />;
    case 'video':
      return <VideoMessage message={message} visible={visible} />;
    case 'audio':
      return <AudioMessage message={message} visible={visible} />;
    case 'document':
      return <DocumentMessage message={message} visible={visible} />;
    default:
      return <Text>Unsupported media type</Text>;
  }
}
