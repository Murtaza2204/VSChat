import { MediaMetadata } from '../types/mediaTypes';
import api from '../config/api';

export async function fetchDownloadUrl(objectKey: string): Promise<string> {
  try {
    const resp = await api.get('/media/download-url', { params: { key: objectKey } });
    return resp.data.downloadUrl;
  } catch (e: any) {
    console.error('[mediaService] fetchDownloadUrl error', e);
    throw e;
  }
}

export async function fetchUploadUrl(chatId: string, filename: string, contentType?: string) {
  try {
    const resp = await api.post('/media/upload-url', { chatId, filename, contentType });
    console.log('[mediaService] fetchUploadUrl response:', resp.data);
    return resp.data;
  } catch (e: any) {
    console.error('[mediaService] fetchUploadUrl error', e);
    throw e;
  }
}

export type DownloadState = { url?: string; loading: boolean; error?: string };
