/**
 * Typed API errors. Every failure from {@link ../api/client.js} arrives as an
 * `ApiError` with a machine-readable `kind` plus human context.
 * `reportError` is the central hook where Sentry (or similar) would plug in.
 *
 * @module api/errors
 */

import { IS_DEV } from '../config.js';

/**
 * @typedef {'network'|'timeout'|'abort'|'http'|'parse'} ApiErrorKind
 * @typedef {Object} ApiErrorOptions
 * @property {number} [status] HTTP status (0 when there was no response).
 * @property {string} [title] Short machine-ish title (e.g. problem title).
 * @property {string} [detail] Longer human detail.
 * @property {unknown} [problem] Raw parsed problem body, if any.
 * @property {string|null} [requestId] Server request id, if echoed back.
 * @property {number|null} [retryAfterMs] Parsed Retry-After, if any.
 * @property {Record<string, string[]>|null} [fieldErrors] Field → messages map (422).
 * @property {boolean} [retriable] Whether the failure is retryable in principle.
 * @property {string|null} [idempotencyKey] Key sent with the request (retry logic).
 * @property {string|null} [traceId] Client trace id of the failed request.
 * @property {number} [attempts] Attempts made before failing.
 * @property {number} [durationMs] Total time spent before failing.
 * @property {Headers|null} [headers] Raw response headers, when a response was received.
 */

/**
 * Typed error thrown by the API client.
 */
export class ApiError extends Error {
  /**
   * @param {ApiErrorKind} kind Error category.
   * @param {ApiErrorOptions} [opts] Error context.
   */
  constructor(kind, opts = {}) {
    super(opts.detail || opts.title || 'Request failed');
    this.name = 'ApiError';
    /** @type {ApiErrorKind} */
    this.kind = kind;
    /** @type {number} HTTP status, 0 when no response was received. */
    this.status = opts.status ?? 0;
    /** @type {string} */
    this.title = opts.title ?? 'Request failed';
    /** @type {string} */
    this.detail = opts.detail ?? '';
    /** @type {unknown} */
    this.problem = opts.problem ?? null;
    /** @type {string|null} */
    this.requestId = opts.requestId ?? null;
    /** @type {number|null} */
    this.retryAfterMs = opts.retryAfterMs ?? null;
    /** @type {Record<string, string[]>|null} */
    this.fieldErrors = opts.fieldErrors ?? null;
    /** @type {boolean} */
    this.retriable = opts.retriable ?? false;
    // Extras used internally by the client / tracer (not part of the wire contract).
    /** @type {string|null} Explicit caller-supplied key (drives POST retry eligibility). */
    this.idempotencyKey = opts.idempotencyKey ?? null;
    /** @type {string|null} */
    this.traceId = opts.traceId ?? null;
    /** @type {number} */
    this.attempts = opts.attempts ?? 0;
    /** @type {number} */
    this.durationMs = opts.durationMs ?? 0;
    /** @type {Headers|null} Raw response headers when a response was received. */
    this.headers = opts.headers ?? null;
  }

  /**
   * Friendly, actionable message safe to show in the UI.
   * @returns {string} Human-readable message.
   */
  userMessage() {
    if (this.kind === 'network') return "Can't reach the server. Check your connection";
    if (this.kind === 'timeout') return 'The request timed out…';
    if (this.kind === 'abort') return 'Request cancelled';
    if (this.kind === 'parse') return "The server sent a response we couldn't read";
    switch (this.status) {
      case 401:
        return 'Pick the Editor or Admin role first';
      case 403:
        return "Your role can't do that";
      case 404:
        return 'That intern no longer exists';
      case 409:
        return 'That email is already registered';
      case 422:
        return 'Please fix the highlighted fields';
      case 429: {
        const s =
          this.retryAfterMs !== null && this.retryAfterMs !== undefined
            ? Math.max(1, Math.ceil(this.retryAfterMs / 1000))
            : null;
        return s ? `Slow down — retry in ${s} s` : 'Slow down — retry in a moment';
      }
      default:
        if (this.status >= 500) return "The server had a problem — we're retrying";
        return this.detail || this.title || 'Something went wrong';
    }
  }
}

/**
 * Type guard for ApiError.
 * @param {unknown} e Value to test.
 * @returns {e is ApiError} True when `e` is an ApiError.
 */
export function isApiError(e) {
  return e instanceof ApiError;
}

/**
 * Central error reporting hook — this is where Sentry.captureException
 * (or similar) would plug in. Logs to console in dev only.
 * @param {unknown} err The error to report.
 * @returns {void}
 */
export function reportError(err) {
  // Sentry.captureException(err) plugs in here.
  if (IS_DEV) {
    console.error('[synapsebridge]', err);
  }
}
