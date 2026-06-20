import { useEffect, useState, useRef } from 'react';
import { fetchDownloadUrl } from '../services/mediaService';

export default function useMedia(objectKey?: string, visible = false) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!objectKey) return;
    if (!visible) return; // lazy load only when visible
    if (fetchedRef.current) return;
    let cancelled = false;
    setLoading(true);
    fetchDownloadUrl(objectKey)
      .then((u) => { if (!cancelled) { setUrl(u); setError(null); fetchedRef.current = true; } })
      .catch((e) => { if (!cancelled) setError(e.message || 'failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [objectKey, visible]);

  const retry = () => {
    // allow retry even if previously fetchedRef prevented fetch
    fetchedRef.current = false;
    setUrl(null);
    setError(null);
    setLoading(false);
  };

  return { url, loading, error, retry };
}
