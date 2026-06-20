import { MediaMetadata } from '../types/mediaTypes';

const API_BASE = '/api/media';

export async function fetchDownloadUrl(objectKey: string): Promise<string> {
  const res = await fetch(`${API_BASE}/download-url?key=${encodeURIComponent(objectKey)}`);
  if (!res.ok) throw new Error(`Failed to fetch download url: ${res.status}`);
  const body = await res.json();
  return body.downloadUrl;
}

export async function fetchUploadUrl(chatId: string, filename: string, contentType?: string) {
  const res = await fetch(`${API_BASE}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, filename, contentType }),
  });
  if (!res.ok) throw new Error('Failed to fetch upload url');
  return res.json();
}

export type DownloadState = { url?: string; loading: boolean; error?: string };
