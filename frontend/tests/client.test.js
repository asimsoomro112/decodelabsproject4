/**
 * Tests for js/api/client.js — the only module allowed to call fetch.
 * globalThis.fetch is mocked per test. Uses tiny retry windows to stay fast.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../js/api/client.js';
import { ApiError, isApiError } from '../js/api/errors.js';
import { setBaseUrl } from '../js/config.js';
import { setRole } from '../js/api/auth.js';
import { on } from '../js/core/events.js';

setBaseUrl('http://test.local/api/v1');

const realFetch = globalThis.fetch;
const FAST_RETRY = { maxAttempts: 3, baseMs: 5, capMs: 20 };

afterEach(() => {
  globalThis.fetch = realFetch;
  setRole('guest');
});

/** Minimal fetch-Response stand-in. */
function mockResponse(status, { text = '', contentType = 'application/json', headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    headers: new Headers({ 'content-type': contentType, ...headers }),
    text: async () => text,
  };
}

const json = (status, payload, extra) =>
  mockResponse(status, { text: JSON.stringify(payload), headers: extra });

/** Subscribe to request:* events, collecting names in order. Returns { names, stop }. */
function captureEvents() {
  const names = [];
  const stops = [
    'request:start',
    'request:preflight-suspected',
    'request:attempt',
    'request:end',
    'request:error',
  ].map((name) => on(name, () => names.push(name)));
  return { names, stop: () => stops.forEach((s) => s()) };
}

test('success: returns parsed JSON with timing metadata', async () => {
  globalThis.fetch = async () => json(200, { a: 1 }, { 'x-request-id': 'srv-1' });
  const res = await request('GET', '/interns', { retry: false });
  assert.deepEqual(res.data, { a: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.ok, true);
  assert.equal(res.attempts, 1);
  assert.equal(res.requestId, 'srv-1');
  assert.match(res.traceId, /^[0-9a-f-]{36}$/);
  assert.ok(res.durationMs >= 0);
  assert.ok(res.networkMs >= 0);
});

test('204 resolves data null', async () => {
  globalThis.fetch = async () =>
    mockResponse(204, { text: '', contentType: 'text/plain' });
  const res = await request('GET', '/interns', { retry: false });
  assert.equal(res.data, null);
  assert.equal(res.status, 204);
});

test('2xx with non-JSON body → parse error', async () => {
  globalThis.fetch = async () =>
    mockResponse(200, { text: 'not json at all', contentType: 'text/plain' });
  await assert.rejects(request('GET', '/x', { retry: false }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.kind, 'parse');
    return true;
  });
});

test('invalid JSON body → parse error', async () => {
  globalThis.fetch = async () => mockResponse(200, { text: '{oops' });
  await assert.rejects(request('GET', '/x', { retry: false }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.kind, 'parse');
    return true;
  });
});

test('404 with HTML body → http error, no crash', async () => {
  globalThis.fetch = async () =>
    mockResponse(404, { text: '<html><body>nope</body></html>', contentType: 'text/html' });
  await assert.rejects(request('GET', '/interns/9', { retry: false }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.kind, 'http');
    assert.equal(err.status, 404);
    return true;
  });
});

test('422 maps fieldErrors and friendly message', async () => {
  globalThis.fetch = async () =>
    json(422, { title: 'Validation failed', errors: { email: ['already taken'] } });
  await assert.rejects(request('POST', '/interns', { body: {}, retry: false }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.kind, 'http');
    assert.equal(err.status, 422);
    assert.deepEqual(err.fieldErrors, { email: ['already taken'] });
    assert.equal(err.userMessage(), 'Please fix the highlighted fields');
    return true;
  });
});

test('401/403 friendly messages', async () => {
  globalThis.fetch = async () => json(401, { title: 'Unauthorized' });
  await assert.rejects(request('GET', '/x', { retry: false }), (err) => {
    assert.equal(err.userMessage(), 'Pick the Editor or Admin role first');
    return true;
  });
  globalThis.fetch = async () => json(403, { title: 'Forbidden' });
  await assert.rejects(request('GET', '/x', { retry: false }), (err) => {
    assert.equal(err.userMessage(), "Your role can't do that");
    return true;
  });
});

test('timeout: tiny timeoutMs vs never-resolving fetch → kind timeout', async () => {
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  const started = Date.now();
  await assert.rejects(request('GET', '/slow', { timeoutMs: 30, retry: false }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.kind, 'timeout');
    assert.equal(err.retriable, true);
    return true;
  });
  assert.ok(Date.now() - started < 2000, 'should fail fast on timeout');
});

test('caller abort → kind abort, attempts 1, no retry', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    if (init.signal.aborted) throw init.signal.reason;
    return json(200, {});
  };
  await assert.rejects(
    request('GET', '/x', { signal: ctrl.signal, retry: FAST_RETRY }),
    (err) => {
      assert.ok(isApiError(err));
      assert.equal(err.kind, 'abort');
      assert.equal(err.attempts, 1);
      assert.equal(err.retriable, false);
      return true;
    },
  );
  assert.equal(calls, 0);
});

test('network failure → kind network', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(request('GET', '/x', { retry: false }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.kind, 'network');
    assert.equal(err.retriable, true);
    assert.equal(err.userMessage(), "Can't reach the server. Check your connection");
    return true;
  });
});

test('GET retries 503 then succeeds; events in order', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? json(503, { title: 'busy' }) : json(200, { ok: true });
  };
  const { names, stop } = captureEvents();
  try {
    const res = await request('GET', '/flaky', { retry: FAST_RETRY });
    assert.equal(res.attempts, 2);
    assert.deepEqual(res.data, { ok: true });
    assert.deepEqual(names, ['request:start', 'request:attempt', 'request:attempt', 'request:end']);
  } finally {
    stop();
  }
});

test('PATCH 503 is never retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return json(503, { title: 'busy' });
  };
  await assert.rejects(request('PATCH', '/interns/1', { body: {}, retry: FAST_RETRY }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.attempts, 1);
    return true;
  });
  assert.equal(calls, 1);
});

test('POST 503 without idempotency key → attempts 1', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return json(503, { title: 'busy' });
  };
  await assert.rejects(request('POST', '/interns', { body: {}, retry: FAST_RETRY }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.attempts, 1);
    return true;
  });
  assert.equal(calls, 1);
});

test('POST 503 with idempotency key → retried', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? json(503, { title: 'busy' }) : json(201, { id: '1' });
  };
  const res = await request('POST', '/interns', {
    body: {},
    idempotencyKey: 'key-123',
    retry: FAST_RETRY,
  });
  assert.equal(res.attempts, 2);
  assert.deepEqual(res.data, { id: '1' });
});

test('Retry-After header is honored', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? json(429, { title: 'slow down' }, { 'retry-after': '1' }) : json(200, {});
  };
  const started = Date.now();
  const res = await request('GET', '/limited', { retry: FAST_RETRY });
  const elapsed = Date.now() - started;
  assert.equal(res.attempts, 2);
  assert.ok(elapsed >= 900, `expected >= 900ms delay, got ${elapsed}ms`);
});

test('gives up after maxAttempts', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return json(503, { title: 'busy' });
  };
  await assert.rejects(request('GET', '/down', { retry: FAST_RETRY }), (err) => {
    assert.ok(isApiError(err));
    assert.equal(err.attempts, 3);
    assert.equal(err.status, 503);
    return true;
  });
  assert.equal(calls, 3);
});

test('headers: GET sends no Content-Type; POST sends Content-Type + Idempotency-Key + X-Request-Id', async () => {
  /** @type {Headers[]} */
  const seen = [];
  globalThis.fetch = async (_url, init) => {
    seen.push(init.headers);
    return json(200, {});
  };
  const getRes = await request('GET', '/interns', { retry: false });
  assert.equal(seen[0].get('content-type'), null);
  assert.equal(seen[0].get('x-request-id'), getRes.traceId);
  assert.equal(seen[0].get('authorization'), null);

  setRole('editor');
  const postRes = await request('POST', '/interns', { body: { name: 'A' }, retry: false });
  assert.equal(seen[1].get('content-type'), 'application/json');
  assert.ok(seen[1].get('idempotency-key'), 'POST gets an idempotency key');
  assert.equal(seen[1].get('x-request-id'), postRes.traceId);
  assert.equal(seen[1].get('authorization'), 'Bearer demo-editor');
});

test('preflight-suspected emitted for PUT with Authorization', async () => {
  setRole('admin');
  globalThis.fetch = async () => json(200, {});
  const { names, stop } = captureEvents();
  try {
    await request('PUT', '/interns/1', { body: {}, retry: false });
    assert.ok(names.includes('request:preflight-suspected'), `events: ${names.join(',')}`);
    assert.equal(names[0], 'request:start');
  } finally {
    stop();
  }
});

test('server-timing parsed into serverMs; networkMs floored at 0', async () => {
  globalThis.fetch = async () =>
    json(200, { ok: true }, { 'server-timing': 'app;dur=42.5' });
  const res = await request('GET', '/x', { retry: false });
  assert.equal(res.serverMs, 42.5);
  assert.equal(res.networkMs, 0);
});

test('query params are encoded into the URL', async () => {
  let seenUrl = '';
  globalThis.fetch = async (url) => {
    seenUrl = String(url);
    return json(200, {});
  };
  await request('GET', '/interns', { query: { search: 'a b', page: 2 }, retry: false });
  assert.ok(seenUrl.startsWith('http://test.local/api/v1/interns?'), seenUrl);
  assert.ok(seenUrl.includes('search=a+b') || seenUrl.includes('search=a%20b'), seenUrl);
  assert.ok(seenUrl.includes('page=2'), seenUrl);
});

test('ApiError carries trace context', async () => {
  globalThis.fetch = async () => json(500, { title: 'boom' });
  await assert.rejects(request('GET', '/x', { retry: false }), (err) => {
    assert.ok(err instanceof ApiError);
    assert.match(err.traceId, /^[0-9a-f-]{36}$/);
    assert.equal(err.attempts, 1);
    assert.equal(err.userMessage(), "The server had a problem — we're retrying");
    return true;
  });
});
