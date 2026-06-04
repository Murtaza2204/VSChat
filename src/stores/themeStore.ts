import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIGHT_THEME, DARK_THEME } from '../constants/colors';

interface ThemeStore {
  isDark: boolean;
  theme: any;
  toggleTheme: () => Promise<void>;
  setTheme: (isDark: boolean) => Promise<void>;
  initializeTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set, get) => {
  return {
    isDark: false,
    theme: LIGHT_THEME,

    toggleTheme: async () => {
      const { isDark } = get();
      const newIsDark = !isDark;
      try {
        await AsyncStorage.setItem('theme', JSON.stringify(newIsDark));
        set({
          isDark: newIsDark,
          theme: newIsDark ? DARK_THEME : LIGHT_THEME,
        });
      } catch (error) {
        console.warn('AsyncStorage not available, theme not persisted:', error);
        set({
          isDark: newIsDark,
          theme: newIsDark ? DARK_THEME : LIGHT_THEME,
        });
      }
    },

    setTheme: async (isDark: boolean) => {
      try {
        await AsyncStorage.setItem('theme', JSON.stringify(isDark));
        set({
          isDark,
          theme: isDark ? DARK_THEME : LIGHT_THEME,
        });
      } catch (error) {
        console.warn('AsyncStorage not available, theme not persisted:', error);
        set({
          isDark,
          theme: isDark ? DARK_THEME : LIGHT_THEME,
        });
      }
    },

    initializeTheme: async () => {
      try {
        const storedTheme = await AsyncStorage.getItem('theme');
        const isDark = storedTheme ? JSON.parse(storedTheme) : false;
        set({
          isDark,
          theme: isDark ? DARK_THEME : LIGHT_THEME,
        });
      } catch (error) {
        console.warn('Failed to initialize theme from storage:', error);
        // Continue with default theme
        set({
          isDark: false,
          theme: LIGHT_THEME,
        });
      }
    },
  };
});
