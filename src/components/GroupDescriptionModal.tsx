import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';

interface GroupDescriptionModalProps {
  visible: boolean;
  currentDescription: string;
  onClose: () => void;
  onSave: (description: string) => Promise<void>;
  isLoading?: boolean;
}

const GroupDescriptionModal: React.FC<GroupDescriptionModalProps> = ({
  visible,
  currentDescription,
  onClose,
  onSave,
  isLoading = false,
}) => {
  const { theme } = useThemeStore();
  const [description, setDescription] = useState(currentDescription);

  useEffect(() => {
    if (visible) {
      setDescription(currentDescription);
    }
  }, [visible, currentDescription]);

  const handleSave = async () => {
    try {
      await onSave(description.trim());
    } catch (error: any) {
      console.error('Error saving description:', error);
      Alert.alert('Error', error.message || 'Failed to save group description');
    }
  };

  const handleCancel = () => {
    setDescription(currentDescription);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isLoading}
              style={styles.headerButton}
            >
              <Text style={[styles.headerButtonText, { color: theme.primary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Group Description
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isLoading}
              style={styles.headerButton}
            >
              <Text
                style={[
                  styles.headerButtonText,
                  {
                    color: isLoading ? theme.textSecondary : theme.primary,
                  },
                ]}
              >
                {isLoading ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={[styles.label, { color: theme.text }]}>
              Add or edit the group description
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBackground,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="Group description"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={6}
              maxLength={500}
              value={description}
              onChangeText={setDescription}
              editable={!isLoading}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: theme.textSecondary }]}>
              {description.length}/500
            </Text>

            <View style={styles.infoBox}>
              <Icon name="information-circle" size={20} color={theme.textSecondary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                Visible to all group members
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerButtonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.base,
    minHeight: 120,
    marginBottom: SPACING.sm,
  },
  charCount: {
    fontSize: FONT_SIZES.sm,
    textAlign: 'right',
    marginBottom: SPACING.lg,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#F2F2F7',
    marginTop: SPACING.lg,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    marginLeft: SPACING.md,
  },
});

export default GroupDescriptionModal;
