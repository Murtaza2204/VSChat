import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

// Screens
import SplashScreen from '../screens/SplashScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import OTPVerificationScreen from '../screens/OTPVerificationScreen';
import UserSetupScreen from '../screens/UserSetupScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import ContactInfoScreen from '../screens/ContactInfoScreen';
import SelectContactScreen from '../screens/SelectContactScreen';
import NewGroupScreen from '../screens/NewGroupScreen';
import NewGroupDetailsScreen from '../screens/NewGroupDetailsScreen';
import CallsListScreen from '../screens/CallsListScreen';
import DialPadScreen from '../screens/DialPadScreen';
import IncomingCallScreen from '../screens/IncomingCallScreen';
import ActiveCallScreen from '../screens/ActiveCallScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';

// Stores
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'default',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
      <Stack.Screen name="UserSetup" component={UserSetupScreen} />
    </Stack.Navigator>
  );
};

const ChatStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          animation: 'default',
        }}
      />
      <Stack.Screen name="ContactInfo" component={ContactInfoScreen} />
      <Stack.Screen name="SelectContact" component={SelectContactScreen} />
      <Stack.Screen name="NewGroup" component={NewGroupScreen} />
      <Stack.Screen name="NewGroupDetails" component={NewGroupDetailsScreen} />
    </Stack.Navigator>
  );
};

const CallsStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="CallsList" component={CallsListScreen} />
      <Stack.Screen name="CallDetails" component={CallsListScreen} />
      <Stack.Screen name="DialPad" component={DialPadScreen} />
      <Stack.Screen name="IncomingCall" component={IncomingCallScreen} />
      <Stack.Screen name="ActiveCall" component={ActiveCallScreen} />
    </Stack.Navigator>
  );
};

const ProfileStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="IncomingCall" component={IncomingCallScreen} />
    </Stack.Navigator>
  );
};

const MainTabs = () => {
  const { theme } = useThemeStore();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const focusedRouteName =
          getFocusedRouteNameFromRoute(route) ??
          (route.name === 'Calls' ? 'CallsList' : 'ChatList');
        const shouldHideTabBar =
          (route.name === 'Chats' &&
            (focusedRouteName === 'Chat' || focusedRouteName === 'NewGroupDetails')) ||
          (route.name === 'Calls' &&
            (focusedRouteName === 'DialPad' || focusedRouteName === 'ActiveCall'));

        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'chatbubbles';

          if (route.name === 'Chats') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Calls') {
            iconName = focused ? 'call' : 'call-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          display: shouldHideTabBar ? 'none' : 'flex',
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        };
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatStack}
        options={{
          tabBarLabel: 'Chats',
        }}
      />
      <Tab.Screen
        name="Calls"
        component={CallsStack}
        options={{
          tabBarLabel: 'Calls',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

const RootNavigator = () => {
  const { isAuthenticated } = useAuthStore();
  const { theme } = useThemeStore();

  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: theme.primary,
          background: theme.background,
          card: theme.surface,
          text: theme.text,
          border: theme.border,
          notification: theme.error,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {!isAuthenticated ? (
          <Stack.Group>
            <Stack.Screen name="Auth" component={AuthStack} />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen name="Main" component={MainTabs} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
