import { useState, useEffect, useCallback } from 'react';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(fetchFn: (signal?: AbortSignal) => Promise<T>, deps: any[] = []): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn(signal);
      if (signal?.aborted) return;
      setData(result);
    } catch (err: any) {
      if (signal?.aborted || err.name === 'AbortError') return;
      setError(err.response?.data?.error || err.message || '데이터를 불러올 수 없습니다');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    const controller = new AbortController();
    fetch(controller.signal);
    return () => controller.abort();
  }, [fetch]);

  return { data, loading, error, refetch: () => fetch() };
}


