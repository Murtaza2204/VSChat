import { useEffect, useState } from 'react';
import { fetchDownloadUrl } from '../services/mediaService';

export default function useMedia(objectKey?: string, visible = false) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!objectKey) return;
    if (!visible) return; // lazy load only when visible
    let cancelled = false;
    setUrl(null);
    setError(null);
    setLoading(true);
    fetchDownloadUrl(objectKey)
      .then((u) => { if (!cancelled) { setUrl(u); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [objectKey, visible, requestVersion]);

  const retry = () => {
    setUrl(null);
    setError(null);
    setLoading(false);
    setRequestVersion((version) => version + 1);
  };

  return { url, loading, error, retry };
}
