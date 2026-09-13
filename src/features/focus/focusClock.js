// One clock per session, independent of the currently displayed route.
export function createFocusClock({ initial = 0, now = () => performance.now(), save = () => {} } = {}) {
  let total = initial, since = null;
  return {
    elapsed() { return total + (since === null ? 0 : Math.max(0, now() - since)); },
    setRunning(running) {
      if (running && since === null) since = now();
      if (!running && since !== null) { total += Math.max(0, now() - since); since = null; }
      save(this.elapsed());
    },
    checkpoint() { save(this.elapsed()); },
  };
}
