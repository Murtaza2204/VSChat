import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SPACING, BORDER_RADIUS, FONT_SIZES } from '../constants/colors';

interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachmentPress?: () => void;
  onEmojiPress?: () => void;
  onCameraPress?: () => void;
  style?: ViewStyle;
  theme: any;
  placeholder?: string;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChangeText,
  onSend,
  onAttachmentPress,
  onEmojiPress,
  onCameraPress,
  style,
  theme,
  placeholder = 'Type a message...',
  disabled = false,
}) => {
  const [focused, setFocused] = useState(false);

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
          onPress={onAttachmentPress}
          disabled={disabled}
          style={styles.attachButton}
        >
          <Icon name="attach" size={20} color={theme.primary} />
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
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
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
});

export default MessageInput;
