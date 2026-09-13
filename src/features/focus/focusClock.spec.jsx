import { expect, it } from 'vitest';
import { createFocusClock } from './focusClock';
it('keeps elapsed time across views, pauses for blockers, and checkpoints without counting reload gaps', () => {
  let time = 0, saved = 0;
  const clock = createFocusClock({ now: () => time, save: value => { saved = value; } });
  clock.setRunning(true); time = 2000; expect(clock.elapsed()).toBe(2000);
  // Removing the display does not destroy this provider-owned clock.
  time = 6000; clock.checkpoint(); expect(saved).toBe(6000);
  clock.setRunning(false); time = 9000; expect(clock.elapsed()).toBe(6000);
  clock.setRunning(true); time = 10000; clock.setRunning(false); expect(saved).toBe(7000);
  const restored = createFocusClock({ initial: saved, now: () => time });
  time = 99999; expect(restored.elapsed()).toBe(7000);
});
