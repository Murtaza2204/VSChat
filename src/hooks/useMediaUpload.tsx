import { useState, useRef } from 'react';
import { getUploadUrl, completeUpload } from '../services/mediaUploadService';
import type { MediaType } from '../types/mediaTypes';

type UploadState = {
  progress: number;
  loading: boolean;
  error?: string | null;
  done: boolean;
};

export default function useMediaUpload() {
  const [state, setState] = useState<UploadState>({ progress: 0, loading: false, error: null, done: false });
  const uploadControllerRef = useRef<AbortController | null>(null);

  const upload = async ({ chatId, file, mediaType }: { chatId: string; file: { uri: string; name: string; type: string; size?: number }; mediaType: MediaType }) => {
    setState({ progress: 0, loading: true, error: null, done: false });
    uploadControllerRef.current = new AbortController();
    try {
      // Step 1: Get signed upload URL
      const urlResp = await getUploadUrl(chatId, file.name, file.type);
      const { uploadUrl, key } = urlResp;

      // Step 2: Upload file to S3 using fetch (more reliable in React Native than XHR)
      const fileResp = await fetch(file.uri);
      if (!fileResp.ok) throw new Error('Failed to read local file');
      const fileBlob = await fileResp.blob();

      const s3Resp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: fileBlob,
        signal: uploadControllerRef.current?.signal,
      });

      if (!s3Resp.ok) {
        throw new Error(`S3 upload failed: ${s3Resp.status} ${s3Resp.statusText}`);
      }

      // Update progress to 100% after successful S3 upload
      setState((s) => ({ ...s, progress: 100 }));

      // Step 3: ONLY after successful S3 upload, call complete-upload to create message in DB
      const message = await completeUpload({
        chatId,
        objectKey: key,
        mimeType: file.type,
        fileSize: file.size || 0,
        mediaType,
      });

      setState({ progress: 100, loading: false, error: null, done: true });
      return { success: true, message };
    } catch (e: any) {
      // Only set error; do NOT create a message on failure
      const errorMsg = e.name === 'AbortError' ? 'Upload cancelled' : (e.message || 'Upload failed');
      setState({ progress: state.progress || 0, loading: false, error: errorMsg, done: false });
      return { success: false, error: errorMsg };
    }
  };

  const cancel = () => {
    uploadControllerRef.current?.abort();
    setState((s) => ({ ...s, loading: false, error: 'cancelled' }));
  };

  const reset = () => {
    setState({ progress: 0, loading: false, error: null, done: false });
  };

  return { state, upload, cancel, reset };
}
