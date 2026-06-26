export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface MediaMetadata {
  objectKey: string;
  mimeType?: string | null;
  fileSize?: number | null;
  mediaType?: MediaType | null;
  originalFilename?: string | null;
  pageCount?: number | null;
}

export interface MessageRecord {
  _id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content?: string | null;
  metadata?: MediaMetadata | null;
  createdAt?: string;
}
