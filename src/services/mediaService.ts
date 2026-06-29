import { MediaMetadata } from '../types/mediaTypes';
import api from '../config/api';

/**
 * Fetch download URL for media object
 * Strategy: Try public URL first (more reliable, never expires), fall back to presigned
 * @param objectKey The S3/R2 object key
 * @param preferPublic Whether to prefer public URL (default true)
 */
async function verifyUrl(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    if (resp.ok) return true;
    return false;
  } catch {
    return false;
  }
}

export async function fetchDownloadUrl(objectKey: string, preferPublic = true, mediaType?: string): Promise<string> {
  try {
    // Step 1: Try public URL first (most reliable)
    if (preferPublic) {
      try {
        console.debug('[mediaService] Attempting to fetch public URL for:', objectKey);
        const params: Record<string, string> = { key: objectKey, requestType: 'public' };
        if (mediaType) {
          params.mediaType = mediaType;
        }
        const resp = await api.get('/media/download-url', { 
          params,
          timeout: 5000 // 5 second timeout for public URL fetch
        });
        if (resp.data.downloadUrl) {
          const publicUrl = resp.data.downloadUrl;
          console.debug('[mediaService] Successfully fetched public URL', publicUrl);
          const valid = await verifyUrl(publicUrl);
          if (valid) {
            return publicUrl;
          }
          console.warn('[mediaService] Public URL verification failed, falling back to presigned:', publicUrl);
        }
      } catch (publicErr) {
        console.warn('[mediaService] Public URL fetch failed, trying presigned:', publicErr.message);
        // Fall through to presigned URL
      }
    }

    // Step 2: Fall back to presigned URL (24-hour expiration)
    console.debug('[mediaService] Fetching presigned URL for:', objectKey);
    const params: Record<string, string> = { key: objectKey };
    if (mediaType) {
      params.mediaType = mediaType;
    }
    const resp = await api.get('/media/download-url', { 
      params,
      timeout: 5000 // 5 second timeout
    });
    
    if (!resp.data.downloadUrl) {
      throw new Error('No downloadUrl in response');
    }
    
    console.debug('[mediaService] Successfully fetched presigned URL');
    return resp.data.downloadUrl;
  } catch (e: any) {
    console.error('[mediaService] fetchDownloadUrl error for', objectKey, ':', e);
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
