// beta/gamma are degrees; the screen normal points down near z = -1.
export function orientationState(beta, gamma, previous = 'up') {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return 'up';
  const radians = Math.PI / 180;
  const z = Math.cos(beta * radians) * Math.cos(gamma * radians);
  // Enter within 35 degrees of face-down, leave beyond 40 degrees. This
  // five-degree hysteresis ignores tiny movements without delaying a flip.
  const tolerance = previous === 'down' ? 40 : 35;
  return z <= -Math.cos(tolerance * radians) + Number.EPSILON ? 'down' : 'up';
}

// State changes dispatch immediately. One request runs at a time and its
// completion flushes the latest state, so a slow down write cannot overwrite up.
// Only failed writes have a timer; unchanged healthy state never needs a poll.
export function createStateWriter(write, report = () => {}, { retryDelay = 300, maxRetries = 3 } = {}) {
  let desired = null, saved = null, revision = 0, savedRevision = 0;
  let timer = null, busy = false, stopped = false, failures = 0;

  function cancelRetry() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  async function flush() {
    if (stopped || busy || desired === null || (desired === saved && revision === savedRevision)) return;
    busy = true;
    const value = desired;
    const requestedRevision = revision;
    let failed = false;
    try {
      await write(value);
      saved = value;
      savedRevision = requestedRevision;
      failures = 0;
      if (!stopped) report(null, value);
    } catch (error) {
      failed = true;
      // A request may have committed before its response was lost. Do not trust
      // an older saved value when deciding whether the latest state needs a write.
      saved = null;
      if (!stopped) report(error, value);
    } finally {
      busy = false;
      if (!stopped) {
        if (failed && value === desired && requestedRevision === revision) {
          failures += 1;
          if (failures <= maxRetries) {
            timer = setTimeout(() => { timer = null; void flush(); }, Math.min(4000, retryDelay * 2 ** (failures - 1)));
          }
        } else {
          // A different value or forced reconnect sync supersedes an old error.
          void flush();
        }
      }
    }
  }

  function update(value, force) {
    if (stopped) return;
    if (value !== 'up' && value !== 'down') throw new Error('Invalid phone state.');
    if (value === desired && !force) return;
    desired = value;
    if (force) revision += 1;
    failures = 0;
    cancelRetry();
    void flush();
  }

  return {
    set(value) { update(value, false); },
    resync(value = desired) { if (value !== null) update(value, true); },
    stop() { stopped = true; cancelRetry(); },
  };
}
