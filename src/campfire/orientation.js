// beta/gamma are degrees. The screen normal points down near z = -1.
export function orientationState(beta, gamma, previous = 'up') {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return 'up';
  const radians = Math.PI / 180;
  const z = Math.cos(beta * radians) * Math.cos(gamma * radians);
  // Hysteresis avoids flickering around the entry threshold (~37 degrees).
  return z <= (previous === 'down' ? -0.65 : -0.8) ? 'down' : 'up';
}

// Leading + trailing throttle: serial writes, latest value wins, retries on failure.
export function createStateWriter(write, report, interval = 2000) {
  let desired = null, saved = null, lastStart = -Infinity;
  let timer = null, busy = false, stopped = false;
  function schedule() {
    if (stopped || busy || timer !== null || desired === saved) return;
    timer = setTimeout(flush, Math.max(0, interval - (performance.now() - lastStart)));
  }
  async function flush() {
    timer = null;
    if (stopped || busy || desired === saved) return;
    // Timers may fire fractionally early; enforce the minimum at dispatch too.
    if (performance.now() - lastStart < interval) { schedule(); return; }
    busy = true;
    const value = desired;
    lastStart = performance.now();
    try {
      await write(value);
      saved = value;
      if (!stopped) report(null, value);
    } catch (error) {
      if (!stopped) report(error);
    } finally {
      busy = false;
      schedule();
    }
  }
  return {
    set(value) { desired = value; schedule(); },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
