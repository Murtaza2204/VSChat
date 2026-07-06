import React, { useMemo, useState } from 'react';
import {  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { BORDER_RADIUS, FONT_SIZES, SPACING } from '../constants/colors';
import { useCallStore } from '../stores/callStore';
import { useThemeStore } from '../stores/themeStore';

const DIAL_KEYS = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

const DialPadScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { theme } = useThemeStore();
  const { addCall } = useCallStore();
  const [phoneNumber, setPhoneNumber] = useState('');

  const formattedNumber = useMemo(
    () => phoneNumber || 'Enter phone number',
    [phoneNumber],
  );

  const handleKeyPress = (digit: string) => {
    setPhoneNumber((current) => `${current}${digit}`);
  };

  const handleDelete = () => {
    setPhoneNumber((current) => current.slice(0, -1));
  };

  const handleCallPress = () => {
    if (!phoneNumber.trim()) {
      return;
    }

    const dialedNumber = phoneNumber.trim();
    addCall({
      id: `dial-${Date.now()}`,
      userId: dialedNumber,
      userName: dialedNumber,
      userAvatar: '#',
      type: 'audio',
      direction: 'outgoing',
      duration: 0,
      timestamp: new Date(),
      status: 'completed',
    });

    navigation.navigate('ActiveCall', {
      callerName: dialedNumber,
      callerAvatar: null,
      peerName: dialedNumber,
      peerAvatar: null,
      calleeName: dialedNumber,
      calleeAvatar: null,
      callType: 'audio',
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Dial number</Text>
      </View>

      <View style={[styles.content, { paddingBottom: SPACING.xxxl }]}>
        <View style={styles.numberRow}>
          <Text
            style={[
              styles.numberText,
              { color: phoneNumber ? theme.text : theme.textSecondary },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formattedNumber}
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            activeOpacity={phoneNumber ? 0.75 : 1}
            onPress={handleDelete}
            disabled={!phoneNumber}
          >
            <Icon
              name="backspace-outline"
              size={24}
              color={phoneNumber ? theme.textSecondary : 'transparent'}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.keypad}>
          {DIAL_KEYS.map((key) => (
            <TouchableOpacity
              key={key.digit}
              style={[styles.keyButton, { backgroundColor: theme.surface }]}
              activeOpacity={0.75}
              onPress={() => handleKeyPress(key.digit)}
              onLongPress={() => key.digit === '0' && handleKeyPress('+')}
            >
              <Text style={[styles.keyDigit, { color: theme.text }]}>{key.digit}</Text>
              <Text style={[styles.keyLetters, { color: theme.textSecondary }]}>
                {key.letters}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.callButton,
            {
              backgroundColor: phoneNumber ? theme.success : theme.border,
              opacity: phoneNumber ? 1 : 0.65,
            },
          ]}
          activeOpacity={phoneNumber ? 0.85 : 1}
          onPress={handleCallPress}
        >
          <Icon
            name="call"
            size={28}
            color={phoneNumber ? theme.background : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 64,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  headerButton: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
  },
  numberRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  numberText: {
    flex: 1,
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '600',
    textAlign: 'center',
  },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  keyButton: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  keyDigit: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '600',
    lineHeight: 34,
  },
  keyLetters: {
    minHeight: 16,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    letterSpacing: 0,
  },
  callButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: SPACING.sm,
    elevation: 6,
  },
});

export default DialPadScreen;

