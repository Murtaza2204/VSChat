import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import CustomButton from '../components/CustomButton';

const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout } = useAuthStore();
  const { theme, isDark, toggleTheme } = useThemeStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleLogout = async () => {
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Profile"
        showBackButton={false}
        theme={theme}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileSection}>
          <Avatar source={user?.avatar} size="extra-large" theme={theme} />
          <Text style={[styles.name, { color: theme.text }]}>
            {user?.name}
          </Text>
          <Text style={[styles.phone, { color: theme.textSecondary }]}>
            {user?.phone}
          </Text>
          {user?.bio && (
            <Text style={[styles.bio, { color: theme.textSecondary }]}>
              {user.bio}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('EditProfile')}
          style={[
            styles.actionButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Icon name="create" size={20} color={theme.primary} />
          <Text style={[styles.actionText, { color: theme.text }]}>
            Edit Profile
          </Text>
          <Icon name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        <View style={styles.settingsSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Settings
          </Text>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Icon name="moon" size={20} color={theme.primary} />
              <Text style={[styles.settingText, { color: theme.text }]}>
                Dark Mode
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.secondary, true: theme.primary }}
              thumbColor={theme.background}
            />
          </View>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Icon name="notifications" size={20} color={theme.primary} />
              <Text style={[styles.settingText, { color: theme.text }]}>
                Notifications
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: theme.secondary, true: theme.primary }}
              thumbColor={theme.background}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={() => navigation.navigate('Settings')}
          >
            <View style={styles.settingContent}>
              <Icon name="settings" size={20} color={theme.primary} />
              <Text style={[styles.settingText, { color: theme.text }]}>
                More Settings
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.footerSection}>
          <Text style={[styles.appVersion, { color: theme.textSecondary }]}>
            ChatApp v1.0.0
          </Text>
          <CustomButton
            title="Logout"
            onPress={handleLogout}
            variant="danger"
            theme={theme}
            style={styles.logoutButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: SPACING.xxxl,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
  },
  name: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    marginTop: SPACING.lg,
  },
  phone: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
  bio: {
    fontSize: FONT_SIZES.base,
    marginTop: SPACING.md,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.xl,
    borderWidth: 1,
  },
  actionText: {
    flex: 1,
    marginLeft: SPACING.md,
    fontSize: FONT_SIZES.base,
    fontWeight: '600',
  },
  settingsSection: {
    marginBottom: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    fontSize: FONT_SIZES.base,
    marginLeft: SPACING.md,
    fontWeight: '500',
  },
  footerSection: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  appVersion: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.lg,
  },
  logoutButton: {
    minWidth: 150,
  },
});

export default ProfileScreen;
