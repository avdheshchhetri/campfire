import test from 'node:test';
import assert from 'node:assert/strict';
import { orientationState, createStateWriter } from './orientation.js';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = () => sleep(0);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('orientation detects either inverted direction, rejects edge-on and invalid sensor data', () => {
  assert.equal(orientationState(0, 0), 'up');
  assert.equal(orientationState(180, 0), 'down');
  assert.equal(orientationState(-180, 0), 'down');
  assert.equal(orientationState(90, 0), 'up');
  assert.equal(orientationState(180, 90), 'up');
  assert.equal(orientationState(null, 0), 'up');
  assert.equal(orientationState(NaN, 0, 'down'), 'up');
  assert.equal(orientationState(180, Infinity, 'down'), 'up');
});

test('orientation enters at 35 degrees and exits beyond 40 degrees, without a delay', () => {
  assert.equal(orientationState(145, 0, 'up'), 'down');
  assert.equal(orientationState(144, 0, 'up'), 'up');
  assert.equal(orientationState(142, 0, 'down'), 'down');
  assert.equal(orientationState(140, 0, 'down'), 'down');
  assert.equal(orientationState(139, 0, 'down'), 'up');
  assert.equal(orientationState(180, 35, 'up'), 'down');
  assert.equal(orientationState(180, 36, 'up'), 'up');
  assert.equal(orientationState(180, 41, 'down'), 'up');
});

test('changes dispatch immediately, deduplicate repeats and never poll a healthy state', async () => {
  const writes = [];
  const writer = createStateWriter(async state => writes.push(state));
  try {
    writer.set('up');
    assert.deepEqual(writes, ['up']);
    await settle();
    writer.set('down');
    assert.deepEqual(writes, ['up', 'down']);
    writer.set('down');
    await sleep(40);
    assert.deepEqual(writes, ['up', 'down']);
    writer.set('up');
    assert.deepEqual(writes, ['up', 'down', 'up']);
  } finally { writer.stop(); }
});

test('slow writes stay serialized and flush the latest rapid sensor change on completion', async () => {
  const requests = [], values = [];
  const writer = createStateWriter(value => {
    values.push(value);
    const request = deferred(); requests.push(request);
    return request.promise;
  });
  try {
    writer.set('down'); writer.set('up'); writer.set('down'); writer.set('up');
    assert.deepEqual(values, ['down']);
    requests[0].resolve();
    await settle();
    assert.deepEqual(values, ['down', 'up']);
    requests[1].resolve();
    await settle();
    assert.equal(requests.length, 2);
  } finally { writer.stop(); }
});

test('a failed in-flight write cannot suppress a correction back to the previous saved state', async () => {
  const lost = deferred(), writes = [];
  const writer = createStateWriter(value => {
    writes.push(value);
    return writes.length === 2 ? lost.promise : Promise.resolve();
  }, () => {}, { retryDelay: 5 });
  try {
    writer.set('up'); await settle();
    writer.set('down'); writer.set('up');
    lost.reject(new Error('Response lost after commit'));
    await settle();
    assert.deepEqual(writes, ['up', 'down', 'up']);
  } finally { writer.stop(); }
});

test('only failures retry, retries are bounded, and explicit reconnect can resync an unchanged state', async () => {
  let calls = 0;
  const writer = createStateWriter(async () => { calls++; throw new Error('offline'); }, () => {}, { retryDelay: 5, maxRetries: 2 });
  try {
    writer.set('down');
    await sleep(50);
    assert.equal(calls, 3);
    writer.set('down');
    await sleep(30);
    assert.equal(calls, 3);
    writer.resync();
    assert.equal(calls, 4);
    await sleep(50);
    assert.equal(calls, 6);
  } finally { writer.stop(); }
});

test('reconnect during an in-flight write performs a fresh sync after its completion', async () => {
  const request = deferred(), writes = [];
  const writer = createStateWriter(value => {
    writes.push(value);
    return writes.length === 1 ? request.promise : Promise.resolve();
  });
  try {
    writer.set('up'); writer.resync('up');
    assert.deepEqual(writes, ['up']);
    request.resolve(); await settle();
    assert.deepEqual(writes, ['up', 'up']);
  } finally { writer.stop(); }
});

test('cleanup cancels pending retries, suppresses late reports and discards queued state', async () => {
  const request = deferred();
  let calls = 0, reports = 0;
  const writer = createStateWriter(() => { calls++; return request.promise; }, () => { reports++; }, { retryDelay: 5 });
  writer.set('down'); writer.set('up'); writer.stop();
  request.reject(new Error('offline'));
  await sleep(30);
  assert.equal(calls, 1);
  assert.equal(reports, 0);
  const retryWriter = createStateWriter(async () => { calls++; throw new Error('offline'); }, () => {}, { retryDelay: 20 });
  retryWriter.set('up'); await settle(); retryWriter.stop();
  await sleep(50);
  assert.equal(calls, 2);
});
