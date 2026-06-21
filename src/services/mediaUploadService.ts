import { fetchUploadUrl } from './mediaService';
import api from '../config/api';

type CompleteUploadItem = {
  objectKey: string;
  mimeType: string;
  fileSize: number;
  mediaType: string;
  originalFilename?: string;
  order?: number;
};

type CompleteUploadPayload = {
  chatId: string;
  objectKey?: string;
  mimeType?: string;
  fileSize?: number;
  mediaType?: string;
  content?: string;
  items?: CompleteUploadItem[];
};

export async function completeUpload(payload: CompleteUploadPayload) {
  console.log('[mediaUploadService] Calling complete-upload:', { endpoint: '/media/complete-upload', payload });
  try {
    const resp = await api.post('/media/complete-upload', payload);
    console.log('[mediaUploadService] complete-upload response:', resp.data);
    // Support both APIs that return the message directly and APIs that wrap it.
    return resp.data?.message || resp.data;
  } catch (error) {
    console.error('[mediaUploadService] complete-upload error:', error);
    throw error;
  }
}

export async function getUploadUrl(chatId: string, filename: string, contentType?: string) {
  console.log('[mediaUploadService] Getting upload URL for:', { chatId, filename, contentType });
  return fetchUploadUrl(chatId, filename, contentType);
}
