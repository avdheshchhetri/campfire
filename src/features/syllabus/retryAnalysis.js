function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Retry read-only analysis, never database writes or teaching-status mutations.
export async function retryAnalysis(request, { signal, onRetry = () => {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await request(); }
    catch (error) {
      signal?.throwIfAborted();
      if (![429, 502, 504].includes(error.status) || attempt >= 2) throw error;
      onRetry(attempt + 1);
      await wait((attempt + 1) * 2000 + Math.floor(Math.random() * 500), signal);
    }
  }
}
