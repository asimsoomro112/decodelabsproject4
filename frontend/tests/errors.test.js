/** Tests for js/api/errors.js — ApiError shape, userMessage, guards. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, isApiError, reportError } from '../js/api/errors.js';

test('isApiError guard', () => {
  assert.equal(isApiError(new ApiError('network')), true);
  assert.equal(isApiError(new Error('x')), false);
  assert.equal(isApiError(null), false);
  assert.equal(isApiError({ kind: 'network' }), false);
});

test('ApiError preserves all fields', () => {
  const e = new ApiError('http', {
    status: 422,
    title: 'Validation failed',
    detail: 'Bad fields',
    requestId: 'req-1',
    retryAfterMs: 2000,
    fieldErrors: { name: ['required'] },
    retriable: false,
  });
  assert.equal(e.kind, 'http');
  assert.equal(e.status, 422);
  assert.equal(e.title, 'Validation failed');
  assert.equal(e.detail, 'Bad fields');
  assert.equal(e.requestId, 'req-1');
  assert.equal(e.retryAfterMs, 2000);
  assert.deepEqual(e.fieldErrors, { name: ['required'] });
  assert.equal(e.retriable, false);
  assert.equal(e.name, 'ApiError');
  assert.ok(e instanceof Error);
});

test('userMessage: 401/403/404/409/422', () => {
  assert.equal(new ApiError('http', { status: 401 }).userMessage(), 'Pick the Editor or Admin role first');
  assert.equal(new ApiError('http', { status: 403 }).userMessage(), "Your role can't do that");
  assert.equal(new ApiError('http', { status: 404 }).userMessage(), 'That intern no longer exists');
  assert.equal(new ApiError('http', { status: 409 }).userMessage(), 'That email is already registered');
  assert.equal(new ApiError('http', { status: 422 }).userMessage(), 'Please fix the highlighted fields');
});

test('userMessage: 429 includes retry seconds', () => {
  assert.equal(
    new ApiError('http', { status: 429, retryAfterMs: 3000 }).userMessage(),
    'Slow down — retry in 3 s',
  );
  assert.equal(
    new ApiError('http', { status: 429 }).userMessage(),
    'Slow down — retry in a moment',
  );
});

test('userMessage: 5xx', () => {
  assert.equal(
    new ApiError('http', { status: 500 }).userMessage(),
    "The server had a problem — we're retrying",
  );
  assert.equal(
    new ApiError('http', { status: 503 }).userMessage(),
    "The server had a problem — we're retrying",
  );
});

test('userMessage: network/timeout/abort/parse kinds', () => {
  assert.equal(
    new ApiError('network').userMessage(),
    "Can't reach the server. Check your connection",
  );
  assert.equal(
    new ApiError('timeout').userMessage(),
    'The request timed out…',
  );
  assert.equal(new ApiError('abort').userMessage(), 'Request cancelled');
  assert.equal(
    new ApiError('parse').userMessage(),
    "The server sent a response we couldn't read",
  );
});

test('reportError does not throw', () => {
  assert.doesNotThrow(() => reportError(new ApiError('network')));
  assert.doesNotThrow(() => reportError(new Error('boom')));
  assert.doesNotThrow(() => reportError('string error'));
});
