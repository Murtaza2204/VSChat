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
  type: 'text' | 'image' | 'video' | 'mediaGroup' | 'file' | 'location' | 'liveLocation' | 'call' | 'deleted' | 'system';
  timestamp: Date;
  read: boolean;
  status?: 'sent' | 'delivered' | 'seen';
  mediaUrl?: string;
  mediaItems?: MediaItem[];
  metadata?: {
    objectKey: string;
    mimeType?: string | null;
    fileSize?: number | null;
    mediaType?: string | null;
    originalFilename?: string | null;
    pageCount?: number | null;
  };
  reaction?: string;
  reactions?: { userId: string; reaction: string }[];
  mediaReactions?: MediaReaction[];
  starred?: boolean;
  location?: {
    latitude: number;
    longitude: number;
    expiresAt?: number;
    durationLabel?: string;
  };
  call?: {
    type: 'voice' | 'video';
    status: 'completed' | 'missed' | 'noAnswer';
    durationSeconds?: number;
    direction: 'incoming' | 'outgoing';
  };
  // Reply/forward support
  replyToId?: string;
  // When replying to a specific media item inside a multi-image message,
  // this stores the 0-based index of that media item.
  replyToMediaItemIndex?: number;
  // Stable identifiers for the specific media item being referenced.
  replyToMediaItemId?: string;
  replyToMediaItemObjectKey?: string;
  forwarded?: boolean;
  forwardedFrom?: {
    senderName: string;
    originalContent: string;
  } | null;
  systemEventType?: string;
  systemActorId?: string | null;
  systemActorName?: string | null;
  systemTargetIds?: string[];
  systemTargetNames?: string[];
  systemAudienceIds?: string[];
  systemData?: Record<string, any>;
}

export interface MediaItem {
  id: string;
  uri?: string;
  objectKey?: string;
  mimeType?: string | null;
  fileSize?: number | null;
  type: 'image' | 'video' | 'document';
  name: string;
  loading?: boolean;
}

export interface MediaReaction {
  mediaItemId: string;
  userId: string;
  reaction: string;
  reactedAt?: Date;
}

export interface Chat {
  id: string;
  userId?: string;
  groupId?: string;
  title: string;
  avatar?: string;
  groupProfilePicture?: string | null;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  isGroup: boolean;
  participants?: User[];
  messages: Message[];
  // optional fields returned by backend / used across screens
  ownerId?: string;
  admins?: string[];
  description?: string;
  conversationId?: string;
  phoneNumber?: string;
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
