import { useCallback, useEffect, useRef, useState } from 'react';

// Locks belong to a visible document and must be reacquired after returning to it.
export function useWakeLock(active) {
  const [status, setStatus] = useState('idle');
  const retry = useRef(() => {});
  useEffect(() => {
    if (!active) { setStatus('idle'); return; }
    let disposed = false, pending = false, lock = null;
    async function acquire() {
      if (disposed || pending || lock || document.hidden) return;
      if (!navigator.wakeLock?.request) { setStatus('unsupported'); return; }
      pending = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (disposed || document.hidden) { await acquired.release(); return; }
        lock = acquired;
        setStatus('active');
        acquired.addEventListener('release', () => {
          if (lock === acquired) lock = null;
          if (!disposed) setStatus('released');
        });
      } catch { if (!disposed) setStatus('unavailable'); }
      finally { pending = false; }
    }
    const visibility = () => {
      if (document.hidden) {
        const previous = lock;
        lock = null;
        if (previous) void previous.release().catch(() => {});
        setStatus('released');
      } else void acquire();
    };
    retry.current = acquire;
    void acquire();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      retry.current = () => {};
      document.removeEventListener('visibilitychange', visibility);
      if (lock) void lock.release().catch(() => {});
    };
  }, [active]);
  return { status, retry: useCallback(() => void retry.current(), []) };
}
