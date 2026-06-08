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
    { name: 'Location', icon: 'location', color: '#00C989' },
    { name: 'Contact', icon: 'person', color: '#00A7E8' },
    { name: 'Document', icon: 'document-text', color: '#8C69FF' },
    { name: 'Poll', icon: 'reorder-three', color: '#F4A62A' },
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
      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={onEmojiPress}
          disabled={disabled}
          style={styles.iconButton}
        >
          <Icon name="happy" size={22} color={theme.primary} />
        </TouchableOpacity>

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
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
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
      {replyTo && (
        <View style={{ padding: 8, backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.textSecondary }}>Replying to {replyTo.senderName}</Text>
            <TouchableOpacity onPress={onCancelReply}><Text style={{ color: theme.primary }}>Cancel</Text></TouchableOpacity>
          </View>
          <Text numberOfLines={1} style={{ color: theme.text }}>{replyTo.content}</Text>
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
    marginHorizontal: SPACING.xs,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.xs,
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
    paddingBottom: SPACING.xl,
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
});

export default MessageInput;
