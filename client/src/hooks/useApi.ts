import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /**
   * Consecutive failures for the current query key, reset by any success.
   * Lets the UI tell a blip apart from an outage and escalate what it offers.
   */
  failures: number;
  /** Re-fetch in the background: no loading state, and a failure keeps the current data. */
  refresh: () => void;
}

function depsEqual(a: any[], b: any[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function useApi<T>(fetchFn: (signal?: AbortSignal) => Promise<T>, deps: any[] = []): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const depsRef = useRef<any[]>(deps);

  // When the query key (deps) changes, clear stale data and switch to loading
  // synchronously — before the fetch effect runs — so previous results don't
  // linger or flash a "no data" state during the transition.
  if (!depsEqual(depsRef.current, deps)) {
    depsRef.current = deps;
    if (data !== null) setData(null);
    if (!loading) setLoading(true);
    if (error !== null) setError(null);
    if (failures !== 0) setFailures(0);
  }

  const fetch = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const key = depsRef.current;
    try {
      const result = await fetchFn(signal);
      // A background refresh has no abort signal; drop it if the query changed meanwhile
      if (signal?.aborted || depsRef.current !== key) return;
      setData(result);
      setFailures(0);
    } catch (err: any) {
      if (signal?.aborted || err.name === 'AbortError' || silent) return;
      setError(err.response?.data?.error || err.message || '데이터를 불러올 수 없습니다');
      setFailures((n) => n + 1);
    } finally {
      if (!signal?.aborted && !silent) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    const controller = new AbortController();
    fetch(controller.signal);
    return () => controller.abort();
  }, [fetch]);

  return { data, loading, error, refetch: () => fetch(), failures, refresh: () => fetch(undefined, true) };
}


