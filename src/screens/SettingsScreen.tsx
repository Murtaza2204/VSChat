import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';
import Header from '../components/Header';

const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { theme } = useThemeStore();

  const settingsGroups = [
    {
      title: 'Account',
      items: [
        { label: 'Phone Number', icon: 'call', action: 'phone' },
        { label: 'Email', icon: 'mail', action: 'email' },
        { label: 'Password', icon: 'lock', action: 'password' },
      ],
    },
    {
      title: 'Privacy & Security',
      items: [
        { label: 'Privacy Settings', icon: 'shield', action: 'privacy' },
        { label: 'Blocked Contacts', icon: 'close-circle', action: 'blocked' },
        { label: 'Two-Factor Auth', icon: 'key', action: 'twofa' },
      ],
    },
    {
      title: 'Notifications',
      items: [
        { label: 'Message Alerts', icon: 'notifications', action: 'messages' },
        { label: 'Call Notifications', icon: 'call', action: 'calls' },
        { label: 'Sound', icon: 'volume-high', action: 'sound' },
      ],
    },
    {
      title: 'Help',
      items: [
        { label: 'FAQ', icon: 'help-circle', action: 'faq' },
        { label: 'Contact Support', icon: 'mail-outline', action: 'support' },
        { label: 'About', icon: 'information-circle', action: 'about' },
      ],
    },
  ];

  const renderSettingItem = (item: any) => (
    <TouchableOpacity
      key={item.action}
      style={[
        styles.settingItem,
        { backgroundColor: theme.surface, borderBottomColor: theme.border },
      ]}
      activeOpacity={0.7}
    >
      <View style={styles.itemContent}>
        <Icon name={item.icon} size={22} color={theme.primary} />
        <Text style={[styles.itemLabel, { color: theme.text }]}>
          {item.label}
        </Text>
      </View>
      <Icon name="chevron-forward" size={20} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Settings"
        onBackPress={() => navigation.goBack()}
        theme={theme}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {settingsGroups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={[styles.groupTitle, { color: theme.primary }]}>
              {group.title}
            </Text>
            <View style={{ borderRadius: BORDER_RADIUS.md, overflow: 'hidden' }}>
              {group.items.map((item, index) => (
                <View
                  key={item.action}
                  style={[
                    index < group.items.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  {renderSettingItem(item)}
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            App Version 1.0.0
          </Text>
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
  group: {
    marginBottom: SPACING.xl,
  },
  groupTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.md,
    marginLeft: SPACING.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemLabel: {
    fontSize: FONT_SIZES.base,
    marginLeft: SPACING.lg,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    marginTop: SPACING.xl,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: FONT_SIZES.sm,
  },
});

export default SettingsScreen;
