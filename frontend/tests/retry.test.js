/** Tests for js/api/retry.js — backoff, jitter, Retry-After, retry matrix. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIdempotentMethod,
  shouldRetry,
  computeDelayMs,
  parseRetryAfterMs,
  sleep,
} from '../js/api/retry.js';
import { ApiError } from '../js/api/errors.js';

/** Build an ApiError quickly. */
function err(kind, status = 0, extra = {}) {
  return new ApiError(kind, { status, ...extra });
}

test('isIdempotentMethod: GET/PUT/DELETE true, POST/PATCH false', () => {
  assert.equal(isIdempotentMethod('GET'), true);
  assert.equal(isIdempotentMethod('PUT'), true);
  assert.equal(isIdempotentMethod('DELETE'), true);
  assert.equal(isIdempotentMethod('POST'), false);
  assert.equal(isIdempotentMethod('PATCH'), false);
  assert.equal(isIdempotentMethod('get'), true);
});

test('shouldRetry: network/timeout kinds retry for safe methods', () => {
  assert.equal(shouldRetry(err('network'), 'GET', 1, 3), true);
  assert.equal(shouldRetry(err('timeout'), 'GET', 1, 3), true);
  assert.equal(shouldRetry(err('network'), 'PUT', 2, 3), true);
});

test('shouldRetry: never retry aborts or PATCH', () => {
  assert.equal(shouldRetry(err('abort'), 'GET', 1, 3), false);
  assert.equal(shouldRetry(err('timeout'), 'PATCH', 1, 3), false);
  assert.equal(shouldRetry(err('http', 503), 'PATCH', 1, 3), false);
});

test('shouldRetry: POST only with idempotency key', () => {
  assert.equal(shouldRetry(err('http', 503), 'POST', 1, 3), false);
  assert.equal(shouldRetry(err('network'), 'POST', 1, 3), false);
  assert.equal(
    shouldRetry(err('http', 503, { idempotencyKey: 'k' }), 'POST', 1, 3),
    true,
  );
  assert.equal(shouldRetry(err('timeout', 0, { idempotencyKey: 'k' }), 'POST', 1, 3), true);
});

test('shouldRetry: 4xx never except 429', () => {
  assert.equal(shouldRetry(err('http', 400), 'GET', 1, 3), false);
  assert.equal(shouldRetry(err('http', 401), 'GET', 1, 3), false);
  assert.equal(shouldRetry(err('http', 404), 'GET', 1, 3), false);
  assert.equal(shouldRetry(err('http', 422), 'GET', 1, 3), false);
  assert.equal(shouldRetry(err('http', 429), 'GET', 1, 3), true);
});

test('shouldRetry: 429/502/503/504 retry; other 5xx do not', () => {
  assert.equal(shouldRetry(err('http', 502), 'GET', 1, 3), true);
  assert.equal(shouldRetry(err('http', 503), 'GET', 1, 3), true);
  assert.equal(shouldRetry(err('http', 504), 'DELETE', 1, 3), true);
  assert.equal(shouldRetry(err('http', 500), 'GET', 1, 3), false);
  assert.equal(shouldRetry(err('http', 501), 'GET', 1, 3), false);
});

test('shouldRetry: attempt cap and non-ApiError', () => {
  assert.equal(shouldRetry(err('network'), 'GET', 3, 3), false);
  assert.equal(shouldRetry(err('network'), 'GET', 4, 3), false);
  assert.equal(shouldRetry(new Error('nope'), 'GET', 1, 3), false);
  assert.equal(shouldRetry(err('parse', 200), 'GET', 1, 3), false);
});

test('computeDelayMs: bounded by base and cap (full jitter)', () => {
  for (let i = 0; i < 50; i += 1) {
    const d1 = computeDelayMs(1, 400, 5000);
    assert.ok(d1 >= 0 && d1 <= 400, `attempt 1: ${d1}`);
    const d9 = computeDelayMs(9, 400, 5000);
    assert.ok(d9 >= 0 && d9 <= 5000, `attempt 9: ${d9}`);
  }
});

test('computeDelayMs: backoff grows on average', () => {
  const mean = (attempt) => {
    let sum = 0;
    const n = 400;
    for (let i = 0; i < n; i += 1) sum += computeDelayMs(attempt, 400, 5000);
    return sum / n;
  };
  const m1 = mean(1);
  const m4 = mean(4);
  assert.ok(m4 > m1 * 2, `mean(4)=${m4} should exceed 2x mean(1)=${m1}`);
});

test('computeDelayMs: retryAfterMs overrides', () => {
  assert.equal(computeDelayMs(1, 400, 5000, 2500), 2500);
  assert.equal(computeDelayMs(5, 400, 5000, 0), 0);
});

test('parseRetryAfterMs: seconds, HTTP-date, garbage', () => {
  assert.equal(parseRetryAfterMs(new Headers({ 'retry-after': '120' })), 120000);
  assert.equal(parseRetryAfterMs({ 'retry-after': '0' }), 0);
  assert.equal(parseRetryAfterMs(new Headers()), null);
  assert.equal(parseRetryAfterMs(null), null);
  assert.equal(parseRetryAfterMs({ 'retry-after': 'nonsense' }), null);
  const future = new Date(Date.now() + 45000).toUTCString();
  const parsed = parseRetryAfterMs({ 'retry-after': future });
  assert.ok(parsed !== null && Math.abs(parsed - 45000) < 5000, `got ${parsed}`);
});

test('sleep resolves after the delay', async () => {
  const start = Date.now();
  await sleep(30);
  assert.ok(Date.now() - start >= 25);
});
