import { useEffect, useState, useRef } from 'react';
import { fetchDownloadUrl } from '../services/mediaService';

// In-memory cache for downloaded URLs to reduce API calls
const urlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

// Track failed keys to limit retry attempts
const failedKeysMap = new Map<string, number>();
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Hook to fetch and cache media URLs with automatic retry
 * @param objectKey - S3/R2 object key
 * @param visible - Whether media is currently visible (lazy load)
 * @returns { url, loading, error, retry }
 */
export default function useMedia(objectKey?: string, visible = false) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!objectKey) return;
    if (!visible) return; // lazy load only when visible

    let cancelled = false;

    const fetchWithRetry = async (attemptNumber = 0) => {
      try {
        if (cancelled) return;

        // Check cache first
        const cached = urlCache.get(objectKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          console.debug('[useMedia] Using cached URL for', objectKey);
          if (!cancelled) {
            setUrl(cached.url);
            setError(null);
            setLoading(false);
          }
          return;
        }

        // Check if we've exceeded max retries
        const failCount = failedKeysMap.get(objectKey) || 0;
        if (failCount >= MAX_RETRY_ATTEMPTS && attemptNumber === 0) {
          console.error('[useMedia] Max retry attempts exceeded for', objectKey);
          if (!cancelled) {
            setError(`Failed to load media after ${MAX_RETRY_ATTEMPTS} attempts`);
            setLoading(false);
          }
          return;
        }

        if (attemptNumber === 0) {
          setLoading(true);
          setError(null);
          setUrl(null);
        }

        // Fetch the URL
        const fetchedUrl = await fetchDownloadUrl(objectKey);
        
        if (cancelled) return;

        // Success: cache it and update state
        urlCache.set(objectKey, { url: fetchedUrl, timestamp: Date.now() });
        failedKeysMap.delete(objectKey); // Clear failure count on success
        retryCountRef.current = 0;

        setUrl(fetchedUrl);
        setError(null);
        setLoading(false);

        console.debug('[useMedia] Successfully loaded media URL:', objectKey);
      } catch (e: any) {
        if (cancelled) return;

        const errorMsg = e.message || 'Failed to load media';
        console.error('[useMedia] Error fetching URL for', objectKey, ':', errorMsg, 'Attempt:', attemptNumber + 1);

        // Implement exponential backoff retry
        if (attemptNumber < MAX_RETRY_ATTEMPTS) {
          const delayMs = Math.min(1000 * Math.pow(2, attemptNumber), 16000); // 1s, 2s, 4s, 8s, 16s max
          console.warn(`[useMedia] Retrying in ${delayMs}ms (attempt ${attemptNumber + 1}/${MAX_RETRY_ATTEMPTS})`);
          
          retryTimeoutRef.current = setTimeout(() => {
            if (!cancelled) {
              fetchWithRetry(attemptNumber + 1);
            }
          }, delayMs);
        } else {
          // Max retries exceeded
          failedKeysMap.set(objectKey, (failedKeysMap.get(objectKey) || 0) + 1);
          setError(`Failed to load media (after ${attemptNumber + 1} attempts)`);
          setLoading(false);
          console.error('[useMedia] Max retries exceeded for', objectKey);
        }
      }
    };

    fetchWithRetry();

    return () => {
      cancelled = true;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [objectKey, visible, requestVersion]);

  const retry = () => {
    console.debug('[useMedia] Manual retry for', objectKey);
    setUrl(null);
    setError(null);
    setLoading(false);
    retryCountRef.current = 0;
    // Remove from failed keys to allow retry
    if (objectKey) failedKeysMap.delete(objectKey);
    // Trigger re-fetch by incrementing version
    setRequestVersion((version) => version + 1);
  };

  return { url, loading, error, retry };
}
