import { Platform } from 'react-native';

const DEFAULT_PUBLIC_BASE_URL = 'https://pub-9e006aecccb34fa0af4dc9a24327c25f.r2.dev';

export type MediaDownloadDirMap = {
  PictureDir?: string;
  MovieDir?: string;
  DownloadDir?: string;
  DocumentDir?: string;
  MusicDir?: string;
};

export type MediaDownloadContext = {
  mediaId?: string;
  messageId?: string;
  objectKey?: string;
  mimeType?: string | null;
};

export const extractMediaObjectKey = (value?: string | null, baseUrl?: string) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  try {
    const parsed = new URL(trimmed);
    const normalizedBase = (baseUrl || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
    if (normalizedBase && parsed.origin === new URL(normalizedBase).origin) {
      return parsed.pathname.replace(/^\/+/, '');
    }
    return parsed.pathname.replace(/^\/+/, '');
  } catch {
    return trimmed.replace(/^\/+/, '');
  }
};

export const buildMediaDownloadUrl = (baseUrl: string, objectKey?: string) => {
  const resolvedObjectKey = extractMediaObjectKey(objectKey, baseUrl);
  if (!resolvedObjectKey) return '';
  const normalizedBase = (baseUrl || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
  return `${normalizedBase}/${resolvedObjectKey.replace(/^\/+/, '')}`;
};

export const getMediaStorageDirectory = (mediaType?: string | null, dirs?: MediaDownloadDirMap) => {
  // If dirs object is provided, use the full paths from it
  switch (mediaType) {
    case 'image':
      return dirs?.PictureDir || 'Pictures';
    case 'video':
      return dirs?.MovieDir || 'Movies';
    case 'audio':
      return dirs?.MusicDir || 'Music';
    case 'document':
      return dirs?.DocumentDir || 'Documents';
    default:
      return dirs?.DownloadDir || 'Downloads';
  }
};

export const getMediaFileExtension = (mimeType?: string | null, objectKey?: string) => {
  const keyExt = objectKey?.split('/').pop()?.split('.').pop();
  if (keyExt && keyExt.length <= 5) {
    return `.${keyExt}`;
  }

  if (!mimeType) return '';
  const extByMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  };

  return extByMime[mimeType.toLowerCase()] || '';
};

export const buildMediaDownloadFileName = ({ mediaId, messageId, objectKey, mimeType }: MediaDownloadContext) => {
  const baseName = mediaId || messageId || 'media';
  const extension = getMediaFileExtension(mimeType, objectKey);
  return `${baseName}${extension}`;
};
