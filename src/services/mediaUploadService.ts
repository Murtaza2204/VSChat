import { fetchUploadUrl } from './mediaService';

const API_BASE = '/api/media';

export async function completeUpload(payload: { chatId: string; objectKey: string; mimeType: string; fileSize: number; mediaType: string }) {
  const res = await fetch(`${API_BASE}/complete-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`complete-upload failed: ${res.status}`);
  return res.json();
}

export async function getUploadUrl(chatId: string, filename: string, contentType?: string) {
  return fetchUploadUrl(chatId, filename, contentType);
}
