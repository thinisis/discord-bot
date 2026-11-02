import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
const cache = new Map<string, unknown>();
let cacheEpoch = 0;
export function clearCache() {
  cache.clear();
  cacheEpoch++;
}
export function useResource<T>(path: string, poll = 0) {
  const [data, setData] = useState<T | undefined>(() => cache.get(path) as T | undefined);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!cache.has(path));
  const reloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    const epoch = cacheEpoch;
    let active = true;
    let running = false;
    let queued = false;
    let controller: AbortController | undefined;
    setData(cache.get(path) as T | undefined);
    setLoading(!cache.has(path));
    setError('');
    const load = async () => {
      if (!active) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      controller = new AbortController();
      try {
        const next = await api<T>(path, { signal: controller.signal });
        if (active && epoch === cacheEpoch) {
          cache.set(path, next);
          setData(next);
          setError('');
        }
      } catch (e) {
        if (active && !(e instanceof DOMException && e.name === 'AbortError'))
          setError(errorMessage(e));
      } finally {
        running = false;
        if (active) {
          setLoading(false);
          if (queued) {
            queued = false;
            void load();
          }
        }
      }
    };
    const refresh = () => {
      if (!document.hidden) void load();
    };
    reloadRef.current = () => void load();
    void load();
    window.addEventListener('data-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = poll ? window.setInterval(refresh, poll) : undefined;
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('data-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [path, poll]);
  const reload = useCallback(() => reloadRef.current(), []);
  return { data, error, loading, reload };
}
