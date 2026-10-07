/**
 * Retry policy for the API client: which methods are idempotent, which
 * failures are retryable, exponential backoff with full jitter, and
 * Retry-After parsing.
 *
 * @module api/retry
 */

import { isApiError } from './errors.js';

/** Methods safe to retry without an idempotency key. @type {Set<string>} */
const IDEMPOTENT_METHODS = new Set(['GET', 'PUT', 'DELETE']);

/**
 * Whether an HTTP method is idempotent (safe to retry blindly).
 * @param {string} method HTTP method.
 * @returns {boolean} True for GET, PUT, DELETE.
 */
export function isIdempotentMethod(method) {
  return IDEMPOTENT_METHODS.has(String(method).toUpperCase());
}

/** @type {Set<number>} Statuses worth retrying. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Decide whether a failed attempt should be retried.
 * Rules: never retry aborts; PATCH never retries; POST retries only when an
 * idempotency key was sent (carried on `err.idempotencyKey`); never retry 4xx
 * except 429; retry network/timeout kinds and 429/502/503/504.
 * @param {unknown} err The failure (expected ApiError).
 * @param {string} method HTTP method of the request.
 * @param {number} attempt Attempt number just completed (1-based).
 * @param {number} maxAttempts Configured attempt ceiling.
 * @returns {boolean} True when another attempt is allowed.
 */
export function shouldRetry(err, method, attempt, maxAttempts) {
  if (!isApiError(err)) return false;
  if (attempt >= maxAttempts) return false;
  if (err.kind === 'abort') return false;
  const m = String(method).toUpperCase();
  if (m === 'PATCH') return false;
  const postWithoutKey = m === 'POST' && !err.idempotencyKey;
  if (err.kind === 'timeout' || err.kind === 'network') {
    return !postWithoutKey;
  }
  if (err.kind === 'http') {
    if (!RETRYABLE_STATUSES.has(err.status)) return false;
    return !postWithoutKey;
  }
  return false;
}

/**
 * Exponential backoff with FULL jitter, capped. `retryAfterMs` (from a
 * Retry-After header) overrides the computed delay entirely.
 * @param {number} attempt Attempt number just completed (1-based).
 * @param {number} baseMs Base delay in ms.
 * @param {number} capMs Maximum delay in ms.
 * @param {number|null} [retryAfterMs] Server-requested delay override.
 * @returns {number} Delay in ms before the next attempt.
 */
export function computeDelayMs(attempt, baseMs, capMs, retryAfterMs) {
  if (retryAfterMs !== null && retryAfterMs !== undefined) {
    return Math.max(0, retryAfterMs);
  }
  const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  return Math.random() * exp;
}

/**
 * Parse a Retry-After value (delta-seconds or HTTP-date) into milliseconds.
 * @param {Headers|Record<string, string>|null|undefined} headers Response headers.
 * @returns {number|null} Delay in ms, or null when absent/unparseable.
 */
export function parseRetryAfterMs(headers) {
  if (!headers) return null;
  /** @type {string|null|undefined} */
  let raw;
  if (typeof /** @type {any} */ (headers).get === 'function') {
    raw = /** @type {any} */ (headers).get('retry-after');
  } else {
    const h = /** @type {Record<string, string>} */ (headers);
    raw = h['retry-after'] ?? h['Retry-After'];
  }
  if (raw === null || raw === undefined || raw === '') return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

/**
 * Sleep helper.
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>} Resolves after the delay.
 */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
