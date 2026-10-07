/**
 * Interop tests: endpoint conveniences the views rely on, toast aliases,
 * and contract behaviors (deleteIntern 404, createIntern idempotency).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  health,
  listTracks,
  getStats,
  createIntern,
  deleteIntern,
  demoEcho,
  demoRequests,
} from '../js/api/endpoints.js';
import { toast, success, error as toastError, info } from '../js/ui/toast.js';
import { setBaseUrl } from '../js/config.js';
import { on } from '../js/core/events.js';

setBaseUrl('http://test.local/api/v1');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonRes(status, payload, extraHeaders = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    headers: new Headers({ 'content-type': 'application/json', ...extraHeaders }),
    text: async () => JSON.stringify(payload),
  };
}

test('toast exposes .success/.error/.info aliases', () => {
  assert.equal(typeof toast, 'function');
  assert.equal(typeof toast.success, 'function');
  assert.equal(typeof toast.error, 'function');
  assert.equal(typeof toast.info, 'function');
  assert.equal(toast.success, success);
  assert.equal(toast.error, toastError);
  assert.equal(toast.info, info);
});

test('endpoints accept (query, opts) two-arg form', async () => {
  /** @type {any[]} */
  const starts = [];
  const stop = on('request:start', (d) => starts.push(d));
  globalThis.fetch = async () => jsonRes(200, { ok: true });
  try {
    await listTracks({}, { traceLabel: 'tracks-label', retry: false });
    await getStats({}, { traceLabel: 'stats-label', retry: false });
    await health({}, { traceLabel: 'health-label', retry: false });
    await demoEcho({}, { traceLabel: 'echo-label', retry: false });
    await demoRequests({}, { traceLabel: 'req-label', retry: false });
    assert.deepEqual(
      starts.map((s) => [s.path, s.label]),
      [
        ['/tracks', 'tracks-label'],
        ['/admin/stats', 'stats-label'],
        ['/health', 'health-label'],
        ['/demo/echo', 'echo-label'],
        ['/demo/requests', 'req-label'],
      ],
    );
  } finally {
    stop();
  }
});

test('endpoints keep single-arg contract form', async () => {
  /** @type {any[]} */
  const starts = [];
  const stop = on('request:start', (d) => starts.push(d));
  globalThis.fetch = async () => jsonRes(200, { ok: true });
  try {
    await listTracks({ traceLabel: 'single', retry: false });
    await getStats({ retry: false });
    assert.equal(starts[0].label, 'single');
    assert.equal(starts[1].label, 'get stats');
  } finally {
    stop();
  }
});

test('deleteIntern treats 404 as success', async () => {
  globalThis.fetch = async () => jsonRes(404, { title: 'Not found' });
  const res = await deleteIntern('nope', { retry: false });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, { alreadyGone: true });
  assert.equal(res.status, 404);
});

test('createIntern sends stable idempotency key and retries', async () => {
  /** @type {(string|null)[]} */
  const keys = [];
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    keys.push(init.headers.get('idempotency-key'));
    return calls === 1 ? jsonRes(503, { title: 'busy' }) : jsonRes(201, { id: '7' });
  };
  const res = await createIntern(
    { name: 'A' },
    { retry: { maxAttempts: 3, baseMs: 5, capMs: 20 } },
  );
  assert.equal(res.attempts, 2);
  assert.ok(keys[0], 'idempotency key sent');
  assert.equal(keys[0], keys[1], 'key stable across retries');
});
