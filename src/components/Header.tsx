import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBackPress?: () => void;
  onRightPress?: () => void;
  rightIcon?: string;
  style?: ViewStyle;
  theme: any;
  showBackButton?: boolean;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  titleStyle?: TextStyle;
}

const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onBackPress,
  onRightPress,
  rightIcon,
  style,
  theme,
  showBackButton = true,
  centerContent,
  rightContent,
  titleStyle,
}) => {
  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
        },
        style,
      ]}
    >
      <View style={styles.header}>
        {showBackButton && (
          <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={theme.primary} />
          </TouchableOpacity>
        )}

        {centerContent ? (
          centerContent
        ) : (
          <View style={styles.titleContainer}>
            {title && (
              <Text
                style={[
                  styles.title,
                  { color: theme.text },
                  titleStyle,
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
            )}
            {subtitle && (
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.textSecondary },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>
        )}

        <View style={styles.rightContainer}>
          {rightContent ? (
            rightContent
          ) : rightIcon ? (
            <TouchableOpacity onPress={onRightPress} style={styles.rightButton}>
              <Icon name={rightIcon} size={24} color={theme.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
  },
  backButton: {
    padding: SPACING.sm,
    marginLeft: -SPACING.sm,
  },
  titleContainer: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightButton: {
    padding: SPACING.sm,
    marginRight: -SPACING.sm,
  },
});

export default Header;
