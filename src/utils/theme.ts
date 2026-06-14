import { LIGHT_THEME, DARK_THEME } from '../constants/colors';
import { ThemeColors } from '../types';

export const getTheme = (isDark: boolean): ThemeColors => {
  return isDark ? DARK_THEME : LIGHT_THEME;
};

export const formatTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
};

export const formatCallDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

export const formatCallTimestamp = (date: Date): string => {
  const now = new Date();
  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (isSameDay(date, now)) return `Today, ${date.toLocaleTimeString('en-US', timeOptions)}`;
  if (isSameDay(date, yesterday)) return `Yesterday, ${date.toLocaleTimeString('en-US', timeOptions)}`;
  const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return date.toLocaleString('en-US', dateOptions);
};

export const validatePhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^[0-9]{6,15}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
};

export const validateOTP = (otp: string): boolean => {
  return /^[0-9]{6}$/.test(otp);
};

export const generateMockOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
