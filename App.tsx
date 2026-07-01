import React, { useEffect } from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { useThemeStore } from './src/stores/themeStore';
import { useAuthStore } from './src/stores/authStore';
import { initNotifications } from './src/services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate } from './src/navigation/NavigationService';

let GestureHandlerRootView: any;
try {
  GestureHandlerRootView = require('react-native-gesture-handler').GestureHandlerRootView;
} catch (error) {
  // Fallback if gesture handler isn't available
  GestureHandlerRootView = View;
}

function App(): React.JSX.Element {
  const { theme, isDark, initializeTheme } = useThemeStore();
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    const initialize = async () => {
      await initializeTheme();
      await initializeAuth();
      // initialize notifications (foreground/background handlers)
      try {
        await initNotifications();
      } catch (e) {
        console.warn('notifications init failed', e);
      }

      // if a background notification saved a pending incoming call, navigate to it now
      try {
        const accepted = await AsyncStorage.getItem('pendingAcceptedCall');
        if (accepted) {
          const data = JSON.parse(accepted);
          await AsyncStorage.removeItem('pendingAcceptedCall');
          let caller: any = {};
          try {
            caller = data.caller ? JSON.parse(String(data.caller)) : {};
          } catch (e) {
            caller = {};
          }
          const isGroupCall = String(data?.isGroupCall) === 'true' || !!data?.groupName || !!data?.groupId;
          setTimeout(() => {
            try {
              navigate('Main', {
                screen: 'Calls',
                params: {
                  screen: isGroupCall ? 'GroupActiveCall' : 'ActiveCall',
                  params: {
                    callType: data.callType || 'audio',
                    callerName: caller.name || caller.displayName || data.callerName || 'Unknown',
                    callerAvatar: caller.avatar || caller.profilePictureUrl || data.callerAvatar,
                    callerId: caller.id || data.callerId || data.fromUserId,
                    appId: data.appId,
                    channel: data.channel,
                    token: data.token,
                    callId: data.callId,
                    isReceiver: true,
                    isGroupCall,
                    groupId: data.groupId,
                    groupName: data.groupName || caller.name || data.callerName,
                    groupAvatar: data.groupAvatar || caller.avatar || data.callerAvatar,
                    groupParticipants: data.groupParticipants,
                  },
                },
              });
            } catch (e) {}
          }, 400);
          return;
        }

        const pending = await AsyncStorage.getItem('pendingIncomingCall');
        if (pending) {
          const data = JSON.parse(pending);
          await AsyncStorage.removeItem('pendingIncomingCall');
          // navigate after a short delay to ensure navigation is ready
          setTimeout(() => {
            try { navigate('Main', { screen: 'Calls', params: { screen: 'IncomingCall', params: data } }); } catch (e) {}
          }, 400);
        }
      } catch (e) {}
    };
    initialize();
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
          translucent={false}
        />
        <RootNavigator />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default App;
