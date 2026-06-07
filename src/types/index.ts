export interface User {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  bio?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: Date;
  profileCompleted?: boolean;
  permissions?: {
    contacts?: string;
    notifications?: string;
    photos?: string;
    camera?: string;
    microphone?: string;
  };
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'file';
  timestamp: Date;
  read: boolean;
  mediaUrl?: string;
}

export interface Chat {
  id: string;
  userId?: string;
  groupId?: string;
  title: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  isGroup: boolean;
  participants?: User[];
  messages: Message[];
}

export interface Call {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  duration: number;
  timestamp: Date;
  status: 'completed' | 'missed' | 'rejected';
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  phoneVerified: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
}
