import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useThemeStore } from '../stores/themeStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/colors';
import Avatar from '../components/Avatar';
import { AGORA_APP_ID, AGORA_CHANNEL, AGORA_TOKEN } from '../config/agora';
import { stopCallTone } from '../services/callToneService';

const IncomingCallScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { theme } = useThemeStore();
  const [callDuration, setCallDuration] = useState(0);
  const scaleAnim = new Animated.Value(1);

  // Mock caller info
  const caller = {
    name: 'John Doe',
    avatar: '👨‍💼',
    type: 'video' as const,
  };

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scaleAnim]);

  const handleAccept = () => {
    stopCallTone();
    const appId = route?.params?.appId || AGORA_APP_ID;
    const channel = route?.params?.channel || AGORA_CHANNEL;
    const token = route?.params?.token || AGORA_TOKEN;
    navigation.navigate('ActiveCall', {
      callType: caller.type,
      appId,
      channel,
      token,
      callerName: caller.name,
    });
  };

  const handleReject = () => {
    stopCallTone();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.incoming, { color: theme.textSecondary }]}>
          Incoming {caller.type} call
        </Text>

        <Animated.View
          style={[
            styles.avatarContainer,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Avatar source={caller.avatar} size="extra-large" theme={theme} />
        </Animated.View>

        <Text style={[styles.callerName, { color: theme.text }]}>
          {caller.name}
        </Text>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            onPress={handleReject}
            style={[styles.rejectButton, { backgroundColor: theme.error }]}
          >
            <Icon name="call" size={28} color={theme.background} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAccept}
            style={[styles.acceptButton, { backgroundColor: theme.success }]}
          >
            <Icon name="call" size={28} color={theme.background} />
          </TouchableOpacity>
        </View>

        <View style={styles.optionsContainer}>
          <TouchableOpacity style={styles.optionButton}>
            <Icon name="mic-off" size={24} color={theme.textSecondary} />
            <Text style={[styles.optionText, { color: theme.textSecondary }]}>
              Mute
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionButton}>
            <Icon name="speaker-off" size={24} color={theme.textSecondary} />
            <Text style={[styles.optionText, { color: theme.textSecondary }]}>
              Speaker
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  incoming: {
    fontSize: FONT_SIZES.base,
    marginBottom: SPACING.xl,
  },
  avatarContainer: {
    marginBottom: SPACING.xxl,
  },
  callerName: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    marginBottom: SPACING.xxl,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xxxl,
    gap: SPACING.xxl,
  },
  rejectButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  acceptButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xxxl,
    marginTop: SPACING.xxl,
  },
  optionButton: {
    alignItems: 'center',
    padding: SPACING.md,
  },
  optionText: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
});

export default IncomingCallScreen;

