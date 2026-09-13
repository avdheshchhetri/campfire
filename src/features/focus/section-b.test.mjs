import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./orientation.js', import.meta.url), 'utf8');
const { orientationState, createStateWriter } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('orientation handles flat, inverted, edge-on, invalid and hysteresis cases', () => {
  assert.equal(orientationState(0, 0), 'up');
  assert.equal(orientationState(180, 0), 'down');
  assert.equal(orientationState(-180, 0), 'down');
  assert.equal(orientationState(90, 0), 'up');
  assert.equal(orientationState(180, 90), 'up');
  assert.equal(orientationState(null, 0), 'up');
  assert.equal(orientationState(NaN, 0, 'down'), 'up');
  assert.equal(orientationState(140, 0, 'up'), 'up');
  assert.equal(orientationState(140, 0, 'down'), 'down');
  assert.equal(orientationState(120, 0, 'down'), 'up');
});

test('default throttle preserves trailing latest state and 2-second spacing', async () => {
  const writes = [];
  const writer = createStateWriter(async state => writes.push({ state, at: performance.now() }), () => {});
  try {
    writer.set('up'); await sleep(50);
    writer.set('down'); writer.set('up'); writer.set('down');
    await sleep(2200);
    assert.deepEqual(writes.map(x => x.state), ['up', 'down']);
    assert.ok(writes[1].at - writes[0].at >= 1999);
    writer.set('down'); await sleep(30);
    assert.equal(writes.length, 2);
  } finally { writer.stop(); }
});

test('writes stay serialized, retry failures, and stop after cleanup', async () => {
  let active = 0, maximum = 0, calls = 0;
  const reports = [];
  const writer = createStateWriter(async () => {
    calls++; maximum = Math.max(maximum, ++active);
    await sleep(35); active--;
    if (calls === 1) throw new Error('offline');
  }, error => reports.push(Boolean(error)), 20);
  writer.set('down');
  await sleep(130);
  assert.equal(maximum, 1);
  assert.deepEqual(reports, [true, false]);
  writer.set('up'); writer.stop();
  await sleep(50);
  assert.equal(calls, 2);
});
