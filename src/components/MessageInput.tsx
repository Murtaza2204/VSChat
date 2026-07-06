import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ViewStyle,
  Text,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SPACING, BORDER_RADIUS, FONT_SIZES } from '../constants/colors';

interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  replyTo?: any;
  onCancelReply?: () => void;
  onAttachmentPress?: () => void;
  onEmojiPress?: () => void;
  onCameraPress?: () => void;
  onAttachmentOptionSelect?: (option: string) => void;
  onFocusChange?: (focused: boolean) => void;
  style?: ViewStyle;
  theme: any;
  placeholder?: string;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChangeText,
  onSend,
  replyTo,
  onCancelReply,
  onAttachmentPress,
  onEmojiPress,
  onCameraPress,
  onAttachmentOptionSelect,
  onFocusChange,
  style,
  theme,
  placeholder = 'Type a message...',
  disabled = false,
}) => {
  const [focused, setFocused] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  const attachmentOptions = [
    { name: 'Gallery', icon: 'images', color: '#168DFF' },
    { name: 'Camera', icon: 'camera', color: '#FF2F7D' },
    { name: 'Document', icon: 'document-text', color: '#8C69FF' },
  ];

  const handleAttachmentPress = () => {
    setShowAttachmentMenu((visible) => !visible);
    onAttachmentPress?.();
  };

  const handleAttachmentOptionSelect = (option: string) => {
    setShowAttachmentMenu(false);
    onAttachmentOptionSelect?.(option);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
        },
        style,
      ]}
    >
      {replyTo && (
        <View
          style={[
            styles.replyPreview,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
          ]}
        >
          <View style={styles.replyPreviewLeft}>
            <View
              style={[
                styles.replyPreviewBorder,
                { borderLeftColor: theme.primary },
              ]}
            />
            <View style={styles.replyPreviewContent}>
              <Text style={[styles.replyPreviewSender, { color: theme.primary }]} numberOfLines={1}>
                {replyTo.senderName}
              </Text>
              <Text
                style={[styles.replyPreviewMessage, { color: theme.text }]}
                numberOfLines={1}
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
          </View>
          <TouchableOpacity
            onPress={onCancelReply}
            style={styles.replyPreviewClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.inputBackground,
              borderColor: focused ? theme.primary : theme.border,
            },
          ]}
        >
          <TextInput
            placeholder={placeholder}
            placeholderTextColor={theme.textSecondary}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => {
              setFocused(true);
              onFocusChange?.(true);
            }}
            onBlur={() => {
              setFocused(false);
              onFocusChange?.(false);
            }}
            style={[
              styles.input,
              {
                color: theme.text,
              },
            ]}
            multiline
            editable={!disabled}
          />
          <TouchableOpacity
            onPress={handleAttachmentPress}
            disabled={disabled}
            style={styles.attachButton}
          >
            <Icon
              name="attach"
              size={20}
              color={showAttachmentMenu ? theme.primary : theme.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onCameraPress}
          disabled={disabled}
          style={styles.iconButton}
        >
          <Icon name="camera" size={22} color={theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSend}
          disabled={!value.trim() || disabled}
          style={[
            styles.sendButton,
            {
              backgroundColor: value.trim() ? theme.primary : theme.border,
            },
          ]}
        >
          <Icon
            name="send"
            size={18}
            color={value.trim() ? theme.background : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {showAttachmentMenu && (
        <View
          style={[
            styles.attachmentTray,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
              paddingBottom: SPACING.lg,
            },
          ]}
        >
          <View style={styles.attachmentGridContent}>
            {attachmentOptions.map((option) => (
              <TouchableOpacity
                key={option.name}
                style={styles.attachmentOption}
                activeOpacity={0.75}
                onPress={() => handleAttachmentOptionSelect(option.name)}
              >
                <View
                  style={[
                    styles.attachmentIconContainer,
                    {
                      backgroundColor: theme.inputBackground,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Icon name={option.icon} size={24} color={option.color} />
                </View>
                <Text
                  style={[styles.attachmentOptionText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {option.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  iconButton: {
    padding: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    maxHeight: 100,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    minHeight: 40,
    maxHeight: 100,
    paddingVertical: SPACING.sm,
  },
  attachButton: {
    padding: SPACING.xs,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.xs,
  },
  attachmentTray: {
    borderTopWidth: 1,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  attachmentGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    rowGap: SPACING.lg,
  },
  attachmentOption: {
    width: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentIconContainer: {
    width: 54,
    height: 54,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  attachmentOptionText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  replyPreviewLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  replyPreviewBorder: {
    borderLeftWidth: 4,
    height: 44,
    marginRight: SPACING.md,
  },
  replyPreviewContent: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  replyPreviewSender: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  replyPreviewMessage: {
    fontSize: FONT_SIZES.sm,
  },
  replyPreviewClose: {
    padding: SPACING.sm,
    marginLeft: SPACING.sm,
  }
});

export default MessageInput;
