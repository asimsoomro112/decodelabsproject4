/**
 * HTTP client for the SynapseBridge API. The ONLY module allowed to call
 * `fetch`. Emits lifecycle events via core/events so the tracer, background
 * canvas and cold-start banner can observe every request:
 *
 * - `request:start`            { traceId, method, url, path, label, requestHeaders, body }
 * - `request:preflight-suspected` { traceId }
 * - `request:attempt`          { traceId, attempt, delayMs }
 * - `request:end`              { traceId, status, ok, durationMs, serverMs, networkMs, requestId, attempts, parseMs, responseHeaders, body }
 * - `request:error`            { traceId, kind, status, attempts, durationMs }
 *
 * Every request carries a client-generated `X-Request-Id` (a UUID) so client
 * and server logs can be joined. Safe to import in Node: nothing touches
 * `window`/`document` at import time.
 *
 * @module api/client
 */

import { emit } from '../core/events.js';
import { ApiError } from './errors.js';
import { computeDelayMs, parseRetryAfterMs, shouldRetry, sleep } from './retry.js';
import { getRole, getToken } from './auth.js';
import { IS_DEV, resolveBaseUrl } from '../config.js';

/**
 * @typedef {Object} RetryOptions
 * @property {number} [maxAttempts] Default 3.
 * @property {number} [baseMs] Backoff base in ms. Default 400.
 * @property {number} [capMs] Backoff cap in ms. Default 5000.
 */

/**
 * @typedef {Object} RequestOptions
 * @property {Record<string, string|number|boolean>} [query] URL query params.
 * @property {unknown} [body] JSON-serializable request body.
 * @property {Record<string, string>} [headers] Extra headers (win over defaults).
 * @property {AbortSignal} [signal] Caller abort signal.
 * @property {number} [timeoutMs] Per-attempt timeout. Default 8000.
 * @property {boolean|RetryOptions} [retry] Retry policy. Default true.
 * @property {string} [idempotencyKey] Sent as Idempotency-Key; enables POST retries.
 * @property {string} [traceLabel] Human label for trace/canvas display.
 * @property {string} [baseUrl] Per-call base URL override.
 */

/**
 * @typedef {Object} RequestResult
 * @property {any} data Parsed response body (null for 204/empty).
 * @property {number} status HTTP status.
 * @property {boolean} ok response.ok.
 * @property {Headers} headers Response headers (the live Headers object).
 * @property {number} durationMs Total time from request() entry to completion.
 * @property {number} serverMs Server time from the Server-Timing header (0 if absent).
 * @property {number} networkMs max(0, durationMs - serverMs).
 * @property {string|null} requestId Server echo of X-Request-Id (if any).
 * @property {number} attempts Attempts made (1-based).
 * @property {string} traceId Client-generated trace id (also sent as X-Request-Id).
 */

/** Methods that never trigger a CORS preflight on their own. @type {Set<string>} */
const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);

/** Content types that never trigger a CORS preflight. @type {Set<string>} */
const SIMPLE_CONTENT_TYPES = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
]);

/**
 * High-resolution timestamp.
 * @returns {number} ms timestamp.
 */
function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * UUID v4, preferring crypto.randomUUID with a Math.random fallback.
 * @returns {string} UUID string.
 */
function newTraceId() {
  try {
    const c = /** @type {any} */ (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* crypto unavailable — use fallback below */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Build the full URL from base + path + query params.
 * @param {string} base Base URL, e.g. http://localhost:4000/api/v1.
 * @param {string} path Path, e.g. '/interns'.
 * @param {Record<string, string|number|boolean>} [query] Query params.
 * @returns {string} Full URL string.
 */
function buildUrl(base, path, query) {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(b + p);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.append(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Truncate a value's JSON rendering for trace snippets.
 * @param {unknown} value Value to summarize.
 * @param {number} [max] Max characters.
 * @returns {string|null} Snippet or null for undefined.
 */
function snippet(value, max = 2000) {
  if (value === undefined) return null;
  let s;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s === undefined) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Normalize the retry option into a concrete config.
 * @param {boolean|RetryOptions|undefined} retry Retry option.
 * @returns {{ maxAttempts: number, baseMs: number, capMs: number }} Normalized config.
 */
function normalizeRetry(retry) {
  if (retry === false) return { maxAttempts: 1, baseMs: 400, capMs: 5000 };
  if (retry === true || retry === undefined || retry === null) {
    return { maxAttempts: 3, baseMs: 400, capMs: 5000 };
  }
  return {
    maxAttempts: retry.maxAttempts ?? 3,
    baseMs: retry.baseMs ?? 400,
    capMs: retry.capMs ?? 5000,
  };
}

/**
 * Whether this request is expected to trigger a CORS preflight
 * (non-simple method, Authorization header, or non-simple content type).
 * @param {string} method HTTP method.
 * @param {Headers} headers Request headers.
 * @returns {boolean} True when a preflight is suspected.
 */
function willPreflight(method, headers) {
  if (!SIMPLE_METHODS.has(method.toUpperCase())) return true;
  if (headers.has('authorization')) return true;
  const ct = headers.get('content-type');
  if (ct) {
    const mime = ct.split(';')[0].trim().toLowerCase();
    if (!SIMPLE_CONTENT_TYPES.has(mime)) return true;
  }
  return false;
}

/**
 * Build request headers: Accept always; Content-Type only when a body is
 * present; Authorization for non-guest roles; Idempotency-Key when provided
 * (or auto-generated for POST); X-Request-Id always.
 * @param {string} method HTTP method.
 * @param {unknown} body Request body.
 * @param {Record<string, string>} extra Caller-supplied headers (win on conflict).
 * @param {string} traceId Trace id to send as X-Request-Id.
 * @param {string} [idempotencyKey] Explicit idempotency key.
 * @returns {Headers} Final headers.
 */
function buildHeaders(method, body, extra, traceId, idempotencyKey) {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const role = getRole();
  const token = getToken();
  if (role !== 'guest' && token) headers.set('Authorization', `Bearer ${token}`);
  const key = idempotencyKey ?? (method.toUpperCase() === 'POST' ? newTraceId() : undefined);
  if (key) headers.set('Idempotency-Key', key);
  headers.set('X-Request-Id', traceId);
  for (const [k, v] of Object.entries(extra || {})) {
    if (v !== undefined && v !== null) headers.set(k, String(v));
  }
  return headers;
}

/**
 * Headers as a plain object, with sensitive values redacted for traces.
 * @param {Headers} headers Headers to serialize.
 * @returns {Record<string, string>} Plain redacted headers.
 */
function plainHeaders(headers) {
  /** @type {Record<string, string>} */
  const out = {};
  headers.forEach((value, key) => {
    out[key] = key.toLowerCase() === 'authorization' ? 'Bearer •••' : value;
  });
  return out;
}

/**
 * Combine our per-attempt timeout with the caller's abort signal.
 * Uses AbortSignal.any when available, otherwise a manual fallback.
 * @param {number} timeoutMs Timeout in ms.
 * @param {AbortSignal} [callerSignal] Caller's signal.
 * @returns {{ signal: AbortSignal, timeoutSignal: AbortSignal }} Combined + raw timeout signal.
 */
function combineSignals(timeoutMs, callerSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return { signal: timeoutSignal, timeoutSignal };
  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any([timeoutSignal, callerSignal]), timeoutSignal };
  }
  const ctrl = new AbortController();
  /** @param {AbortSignal} source */
  const forward = (source) => {
    if (ctrl.signal.aborted) return;
    try {
      ctrl.abort(source.reason);
    } catch {
      /* already aborted */
    }
  };
  if (callerSignal.aborted) {
    forward(callerSignal);
  } else if (timeoutSignal.aborted) {
    forward(timeoutSignal);
  } else {
    callerSignal.addEventListener('abort', () => forward(callerSignal), { once: true });
    timeoutSignal.addEventListener('abort', () => forward(timeoutSignal), { once: true });
  }
  return { signal: ctrl.signal, timeoutSignal };
}

/**
 * Extract the app duration from a Server-Timing header (`app;dur=12.3`).
 * @param {string|null} value Server-Timing header value.
 * @returns {number} Server ms, 0 when absent/unparseable.
 */
function parseServerTiming(value) {
  if (!value) return 0;
  const m = /app;dur=([\d.]+)/.exec(value);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize problem-style field errors into a field → messages map.
 * Accepts `{ field: [...] }` maps or `[{ field, message }]` arrays.
 * @param {unknown} raw Raw errors value.
 * @returns {Record<string, string[]>|null} Normalized map or null.
 */
function normalizeFieldErrors(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw)) {
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const f = String(/** @type {any} */ (item).field ?? 'unknown');
        const msg = String(/** @type {any} */ (item).message ?? 'invalid');
        (out[f] = out[f] || []).push(msg);
      }
    }
    return Object.keys(out).length ? out : null;
  }
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    if (Array.isArray(v)) out[k] = v.map(String);
    else if (v !== undefined && v !== null) out[k] = [String(v)];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Build an ApiError for an HTTP error status.
 * @param {number} status HTTP status.
 * @param {unknown} payload Parsed JSON body, raw text, or null.
 * @param {Response} response Fetch response.
 * @param {{ traceId: string, idempotencyKey: string|null, attempts: number, durationMs: number }} ctx Request context.
 * @returns {ApiError} Typed error.
 */
function httpError(status, payload, response, ctx) {
  let title = response.statusText || `HTTP ${status}`;
  let detail = '';
  /** @type {Record<string, string[]>|null} */
  let fieldErrors = null;
  /** @type {unknown} */
  let problem = null;
  if (payload && typeof payload === 'object') {
    problem = payload;
    const p = /** @type {Record<string, any>} */ (payload);
    title = p.title ?? p.error ?? title;
    detail = p.detail ?? p.message ?? '';
    fieldErrors = normalizeFieldErrors(p.errors ?? p.fieldErrors);
  } else if (typeof payload === 'string' && payload) {
    detail = snippet(payload, 300) ?? '';
  }
  const retryAfterMs = status === 429 ? parseRetryAfterMs(response.headers) : null;
  const retriable = status === 429 || status === 502 || status === 503 || status === 504;
  return new ApiError('http', {
    status,
    title: String(title),
    detail: String(detail),
    problem,
    requestId: response.headers.get('x-request-id'),
    retryAfterMs,
    fieldErrors,
    retriable,
    idempotencyKey: ctx.idempotencyKey,
    traceId: ctx.traceId,
    attempts: ctx.attempts,
    durationMs: ctx.durationMs,
    headers: response.headers,
  });
}

/**
 * Classify a fetch() rejection into an ApiError. Distinguishes our timeout
 * (TimeoutError, caller not aborted) from caller aborts and network failures.
 * @param {unknown} err Rejection reason.
 * @param {{ traceId: string, idempotencyKey: string|null, attempts: number, durationMs: number, callerSignal?: AbortSignal }} ctx Request context.
 * @returns {ApiError} Typed error.
 */
function classifyNetworkError(err, ctx) {
  const name = err && typeof err === 'object' ? /** @type {any} */ (err).name : '';
  /** @type {'network'|'timeout'|'abort'} */
  let kind = 'network';
  if (name === 'TimeoutError') {
    // Our timeout fired — unless the caller also aborted, in which case the
    // caller wins and this is an abort.
    kind = ctx.callerSignal && ctx.callerSignal.aborted ? 'abort' : 'timeout';
  } else if (name === 'AbortError') {
    kind = 'abort';
  }
  const titles = {
    network: 'Network error',
    timeout: 'Request timed out',
    abort: 'Request aborted',
  };
  return new ApiError(kind, {
    status: 0,
    title: titles[kind],
    detail: err instanceof Error ? err.message : String(err ?? ''),
    retriable: kind !== 'abort',
    idempotencyKey: ctx.idempotencyKey,
    traceId: ctx.traceId,
    attempts: ctx.attempts,
    durationMs: ctx.durationMs,
  });
}

/**
 * Read and validate the response body.
 * Rules: 204/empty → null; JSON content-type → parse (throws parse error on
 * bad JSON, http error on !ok); non-JSON + !ok → http error (never crashes on
 * HTML bodies); non-JSON + 2xx → parse error.
 * @param {Response} response Fetch response.
 * @param {{ traceId: string, idempotencyKey: string|null, attempts: number, durationMs: number }} ctx Request context.
 * @returns {Promise<{ data: unknown, parseMs: number }>} Parsed body + parse time.
 */
async function readBody(response, ctx) {
  const parseStart = now();
  let text;
  try {
    text = await response.text();
  } catch (err) {
    throw classifyNetworkError(err, { ...ctx, callerSignal: undefined });
  }
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('json');

  if (response.status === 204 || text === '') {
    if (!response.ok) throw httpError(response.status, null, response, ctx);
    return { data: null, parseMs: now() - parseStart };
  }
  if (isJson) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError('parse', {
        status: response.status,
        title: 'Invalid JSON',
        detail: "The server sent a response we couldn't read.",
        requestId: response.headers.get('x-request-id'),
        retriable: false,
        idempotencyKey: ctx.idempotencyKey,
        traceId: ctx.traceId,
        attempts: ctx.attempts,
        durationMs: ctx.durationMs,
      });
    }
    if (!response.ok) throw httpError(response.status, parsed, response, ctx);
    return { data: parsed, parseMs: now() - parseStart };
  }
  if (!response.ok) throw httpError(response.status, text, response, ctx);
  throw new ApiError('parse', {
    status: response.status,
    title: 'Unexpected response format',
    detail: "The server sent a response we couldn't read.",
    requestId: response.headers.get('x-request-id'),
    retriable: false,
    idempotencyKey: ctx.idempotencyKey,
    traceId: ctx.traceId,
    attempts: ctx.attempts,
    durationMs: ctx.durationMs,
    headers: response.headers,
  });
}

/**
 * Perform one HTTP request with timeout, retries, and full lifecycle events.
 * @param {string} method HTTP method.
 * @param {string} path API path, e.g. '/interns'.
 * @param {RequestOptions} [opts] Request options.
 * @returns {Promise<RequestResult>} Result object.
 * @throws {ApiError} Typed error when the request fails after retries.
 */
export async function request(method, path, opts = {}) {
  const {
    query,
    body,
    headers = {},
    signal: callerSignal,
    timeoutMs = 8000,
    retry = true,
    idempotencyKey,
    traceLabel,
    baseUrl,
  } = opts;

  const traceId = newTraceId();
  const url = buildUrl(resolveBaseUrl(baseUrl), path, query);
  const label = traceLabel || `${method.toUpperCase()} ${path}`;
  const upperMethod = method.toUpperCase();
  const reqHeaders = buildHeaders(upperMethod, body, headers, traceId, idempotencyKey);
  // Retry eligibility uses ONLY the caller-supplied key. The client still sends
  // an auto-generated Idempotency-Key header on POST (header contract), but an
  // auto key must not silently opt the caller into POST retries.
  const retryIdempotencyKey = idempotencyKey ?? null;
  const retryCfg = normalizeRetry(retry);
  const overallStart = now();

  emit('request:start', {
    traceId,
    method: upperMethod,
    url,
    path,
    label,
    requestHeaders: plainHeaders(reqHeaders),
    body: snippet(body),
  });

  if (willPreflight(upperMethod, reqHeaders)) {
    emit('request:preflight-suspected', { traceId });
  }

  let attempts = 0;
  /** @type {ApiError|null} */
  let lastError = null;
  /** @type {number|null} */
  let pendingRetryAfterMs = null;

  while (attempts < retryCfg.maxAttempts) {
    attempts += 1;
    const delayMs =
      attempts === 1
        ? 0
        : computeDelayMs(attempts - 1, retryCfg.baseMs, retryCfg.capMs, pendingRetryAfterMs);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    if (callerSignal && callerSignal.aborted) {
      const durationMs = now() - overallStart;
      const err = new ApiError('abort', {
        status: 0,
        title: 'Request aborted',
        detail: 'The request was cancelled before it could be sent.',
        retriable: false,
        idempotencyKey: retryIdempotencyKey,
        traceId,
        attempts,
        durationMs,
      });
      emit('request:error', { traceId, kind: 'abort', status: 0, attempts, durationMs });
      throw err;
    }

    emit('request:attempt', { traceId, attempt: attempts, delayMs });

    const { signal: fetchSignal } = combineSignals(timeoutMs, callerSignal);
    /** @type {Response} */
    let response;
    try {
      response = await fetch(url, {
        method: upperMethod,
        headers: reqHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: fetchSignal,
      });
    } catch (err) {
      const durationMs = now() - overallStart;
      const apiErr = classifyNetworkError(err, {
        traceId,
        idempotencyKey: retryIdempotencyKey,
        attempts,
        durationMs,
        callerSignal,
      });
      lastError = apiErr;
      pendingRetryAfterMs = null;
      if (!shouldRetry(apiErr, upperMethod, attempts, retryCfg.maxAttempts)) {
        emit('request:error', {
          traceId,
          kind: apiErr.kind,
          status: apiErr.status,
          attempts,
          durationMs,
        });
        throw apiErr;
      }
      continue;
    }

    const ctx = {
      traceId,
      idempotencyKey: retryIdempotencyKey,
      attempts,
      durationMs: now() - overallStart,
    };
    try {
      const { data, parseMs } = await readBody(response, ctx);
      const durationMs = now() - overallStart;
      const serverMs = parseServerTiming(response.headers.get('server-timing'));
      const networkMs = Math.max(0, durationMs - serverMs);
      const requestId = response.headers.get('x-request-id');
      const result = {
        data,
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        durationMs,
        serverMs,
        networkMs,
        requestId,
        attempts,
        traceId,
      };
      emit('request:end', {
        traceId,
        status: response.status,
        ok: response.ok,
        durationMs,
        serverMs,
        networkMs,
        requestId,
        attempts,
        parseMs,
        responseHeaders: response.headers,
        body: snippet(data),
      });
      return result;
    } catch (err) {
      const durationMs = now() - overallStart;
      if (!(err instanceof ApiError)) {
        if (IS_DEV) console.error('[client] unexpected non-ApiError:', err);
        throw err;
      }
      err.durationMs = durationMs;
      lastError = err;
      pendingRetryAfterMs = err.retryAfterMs;
      if (!shouldRetry(err, upperMethod, attempts, retryCfg.maxAttempts)) {
        emit('request:error', {
          traceId,
          kind: err.kind,
          status: err.status,
          attempts,
          durationMs,
        });
        throw err;
      }
    }
  }

  // Retry budget exhausted.
  const durationMs = now() - overallStart;
  const exhausted =
    lastError ||
    new ApiError('network', {
      status: 0,
      title: 'Request failed',
      detail: 'The request failed after all retry attempts.',
      retriable: true,
      idempotencyKey: retryIdempotencyKey,
      traceId,
      attempts,
      durationMs,
    });
  emit('request:error', {
    traceId,
    kind: exhausted.kind,
    status: exhausted.status,
    attempts,
    durationMs,
  });
  throw exhausted;
}
