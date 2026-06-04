# ChatApp - React Native WhatsApp Clone

A modern, feature-rich messaging application built with React Native. This app demonstrates best practices in React Native development including navigation, state management, UI/UX design, and responsive layouts.

## ✨ Features

### Authentication Flow
- ✅ Splash Screen with animated branding
- ✅ Phone number login with country code picker
- ✅ 6-digit OTP verification
- ✅ User profile setup with avatar selection
- ✅ Secure authentication with AsyncStorage

### Chats Module
- ✅ Chat list with search functionality
- ✅ Message display with timestamps
- ✅ Text message support
- ✅ Image, video, and file message placeholders
- ✅ Read receipts with checkmarks
- ✅ Unread message badges
- ✅ Pull-to-refresh functionality
- ✅ Skeleton loading states

### Calls Module
- ✅ Calls history with sorting
- ✅ Call search functionality
- ✅ Audio and video call types
- ✅ Incoming/outgoing indicators
- ✅ Call duration tracking
- ✅ Missed call indicators
- ✅ Incoming call screen with animations
- ✅ Active call screen with controls

### Profile & Settings
- ✅ User profile display
- ✅ Edit profile functionality
- ✅ Avatar selection from emoji options
- ✅ Bio editing
- ✅ Dark mode toggle
- ✅ Notifications settings
- ✅ Settings panel with multiple options
- ✅ Logout functionality

### UI/UX Features
- ✅ Modern Material Design inspired interface
- ✅ Dark mode support (system-wide toggle)
- ✅ Smooth animations and transitions
- ✅ Responsive layouts for different screen sizes
- ✅ Gesture handling with react-native-gesture-handler
- ✅ Bottom tab navigation
- ✅ Stack navigation with deep linking support
- ✅ Loading skeletons for better perceived performance
- ✅ Empty states for better user guidance

### State Management
- ✅ Zustand for global state management
- ✅ Auth store for authentication state
- ✅ Chat store for messaging
- ✅ Call store for call history
- ✅ Theme store for dark mode
- ✅ AsyncStorage persistence

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Avatar.tsx
│   ├── CallCard.tsx
│   ├── ChatBubble.tsx
│   ├── CustomButton.tsx
│   ├── CustomInput.tsx
│   ├── EmptyState.tsx
│   ├── Header.tsx
│   ├── Loader.tsx
│   ├── MessageInput.tsx
│   ├── SkeletonLoader.tsx
│   ├── UserCard.tsx
│   └── index.ts
├── screens/             # Screen components
│   ├── ActiveCallScreen.tsx
│   ├── CallsListScreen.tsx
│   ├── ChatListScreen.tsx
│   ├── ChatScreen.tsx
│   ├── EditProfileScreen.tsx
│   ├── IncomingCallScreen.tsx
│   ├── LoginScreen.tsx
│   ├── OTPVerificationScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── SplashScreen.tsx
│   ├── UserSetupScreen.tsx
│   └── index.ts
├── stores/              # Zustand state stores
│   ├── authStore.ts
│   ├── callStore.ts
│   ├── chatStore.ts
│   ├── themeStore.ts
│   └── index.ts
├── navigation/          # Navigation setup
│   └── RootNavigator.tsx
├── constants/           # App constants
│   ├── colors.ts        # Theme colors, spacing, fonts
│   └── mockData.ts      # Mock data for demo
├── types/               # TypeScript interfaces
│   └── index.ts
├── utils/               # Utility functions
│   └── theme.ts
└── App.tsx              # App entry point
```

## 🛠️ Installation

### Prerequisites
- Node.js 22.11.0 or higher
- npm or yarn
- Android Studio (for Android development)
- Xcode (for iOS development on macOS)

### Setup Steps

1. **Clone/Setup Project**
   ```bash
   cd e:\whatapp\WhatsAppClone
   ```

2. **Install Dependencies**
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Connect Physical Device**
   - Enable USB Debugging on Android device
   - Or use Android emulator

4. **Run App**
   ```bash
   npm start          # Start Metro bundler
   npm run android    # In another terminal, deploy to Android
   ```

## 🎨 Theme System

The app includes a comprehensive theming system with:

- **Light Theme**: Clean white background with dark text
- **Dark Theme**: Dark background with light text for reduced eye strain
- **Customizable Colors**: Easy to modify in `constants/colors.ts`
- **Spacing System**: Consistent spacing throughout the app
- **Typography**: Predefined font sizes for consistency
- **Shadows**: Material Design inspired shadows

### Switching Themes
- Toggle in Profile > Settings > Dark Mode
- Theme preference is persisted to AsyncStorage

## 📱 Navigation Flow

```
Splash Screen
    ↓
├── Not Authenticated
│   ├── Login → OTP Verification → User Setup
│   └── (Redirects to Main after success)
│
└── Authenticated
    ├── Chats Tab
    │   ├── Chat List
    │   └── Individual Chat
    ├── Calls Tab
    │   ├── Calls List
    │   ├── Incoming Call
    │   └── Active Call
    └── Profile Tab
        ├── Profile
        ├── Edit Profile
        └── Settings
```

## 🔧 Component API

### CustomButton
```tsx
<CustomButton
  title="Send"
  onPress={() => {}}
  variant="primary"      // 'primary' | 'secondary' | 'outlined' | 'danger'
  size="medium"          // 'small' | 'medium' | 'large'
  loading={false}
  disabled={false}
  theme={theme}
/>
```

### CustomInput
```tsx
<CustomInput
  placeholder="Enter text"
  value={value}
  onChangeText={setText}
  label="Field Label"
  error="Error message"
  theme={theme}
  icon="search"
  keyboardType="default"
/>
```

### Avatar
```tsx
<Avatar
  source="👤"          // Emoji or image URL
  size="medium"        // 'small' | 'medium' | 'large' | 'extra-large'
  theme={theme}
  badge={5}            // Unread count
  online={true}        // Online status indicator
/>
```

## 📝 State Management

### Using Stores

**Auth Store**
```tsx
const { user, isAuthenticated, login, logout } = useAuthStore();
```

**Chat Store**
```tsx
const { chats, messages, addMessage, setCurrentChat } = useChatStore();
```

**Call Store**
```tsx
const { calls, addCall, getSearchedCalls } = useCallStore();
```

**Theme Store**
```tsx
const { isDark, theme, toggleTheme } = useThemeStore();
```

## 🎬 Mock Data

The app comes with mock data for testing:
- 5 sample users
- 5 sample chats
- 4 sample calls
- Pre-populated messages

All stored in `constants/mockData.ts`

## 🚀 Performance Optimizations

- ✅ Lazy loading with skeleton screens
- ✅ Optimized re-renders with Zustand
- ✅ Image caching (ready for implementation)
- ✅ FlatList virtualization for large lists
- ✅ Gesture handler for smooth interactions
- ✅ AsyncStorage for data persistence

## 🔐 Security Features

- Secure OTP verification flow
- AsyncStorage for local authentication state
- Phone number validation
- Input sanitization

## 📦 Dependencies

Main packages used:
- `@react-navigation/*`: Navigation
- `zustand`: State management
- `react-native-vector-icons`: Icons
- `@react-native-async-storage/async-storage`: Local storage
- `react-native-gesture-handler`: Gesture support
- `react-native-screens`: Navigation optimization

## 🎯 Key Screens

### SplashScreen
- Animated app logo and name
- Auto-navigation based on auth state
- 2.5-second display duration

### LoginScreen
- Country code picker
- Phone number input with validation
- OTP send functionality

### OTPVerificationScreen
- 6-digit OTP input fields
- Animated OTP boxes
- Resend OTP with countdown timer
- Error handling

### ChatListScreen
- Search functionality
- Unread message badges
- Last message preview
- Pull-to-refresh
- Skeleton loading

### ChatScreen
- Message history display
- Auto-scroll to latest message
- Read receipts
- Message timestamp display
- Message input with emoji and attachment buttons

### CallsListScreen
- Call history with duration
- Call type indicators (audio/video)
- Incoming/outgoing direction
- Search functionality

### ProfileScreen
- User avatar and info
- Edit profile action
- Theme toggle
- Notifications setting
- Settings access
- Logout button

## 🌗 Dark Mode Support

The app fully supports dark mode:
- Automatic theme detection from system
- Manual toggle in settings
- Persistent theme preference
- All colors update dynamically
- Smooth transitions

## 📲 Testing

To test the app:

1. **Login Flow**
   - Use any country code
   - Enter any phone number
   - Use any 6 digits for OTP (e.g., 123456)

2. **Chat Messages**
   - Type and send messages
   - Messages appear in real-time with timestamps

3. **Dark Mode**
   - Toggle in Profile > Dark Mode
   - Reload app to see persistence

4. **Navigation**
   - Test tab switching
   - Test back navigation
   - Test deep linking

## 📚 Resources

- [React Native Documentation](https://reactnative.dev)
- [React Navigation Docs](https://reactnavigation.org)
- [Zustand GitHub](https://github.com/pmndrs/zustand)

## 🤝 Contributing

This is a demo project. Feel free to:
- Extend with real backend API
- Add push notifications
- Implement file uploads
- Add video/audio calling
- Add encryption

## 📄 License

This project is open source and available for educational purposes.

## 🎓 Learning Points

This project demonstrates:
- React Native best practices
- Navigation patterns
- State management with Zustand
- Component composition
- TypeScript usage
- Responsive UI design
- Dark mode implementation
- Gesture handling
- AsyncStorage usage
- Mock API patterns

---

**Happy Coding!** 🚀

For questions or issues, please refer to the component documentation or React Native docs.
