/**
 * Typed endpoint wrappers over {@link ./client.js}. Each function takes an
 * options object `{ signal, timeoutMs, traceLabel, retry, baseUrl }` and
 * returns the client's {@link RequestResult} object.
 *
 * Path note: core resource paths (`/health`, `/tracks`, `/interns`, `/stats`)
 * follow standard REST conventions; the `/demo/*` helper paths are
 * provisional and must be aligned with the backend worker if they differ.
 *
 * @module api/endpoints
 */

import { request } from './client.js';
import { isApiError } from './errors.js';

/**
 * @typedef {Object} CallOpts
 * @property {AbortSignal} [signal] Caller abort signal.
 * @property {number} [timeoutMs] Per-attempt timeout in ms.
 * @property {string} [traceLabel] Human label for trace display.
 * @property {boolean|{maxAttempts?: number, baseMs?: number, capMs?: number}} [retry] Retry policy.
 * @property {string} [baseUrl] Per-call base URL override.
 */

/**
 * @typedef {import('./client.js').RequestResult} RequestResult
 */

/**
 * UUID for idempotency keys (crypto.randomUUID with fallback).
 * @returns {string} UUID string.
 */
function newIdempotencyKey() {
  try {
    const c = /** @type {any} */ (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* crypto unavailable — fallback */
  }
  return `idem-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * @param {string|number} id Resource id.
 * @returns {string} URL-encoded id.
 */
function enc(id) {
  return encodeURIComponent(String(id));
}

/**
 * Split the flexible `(queryOrOpts, maybeOpts)` argument pair used by
 * parameter-less endpoints. Supports both the contract form `fn(opts)` and
 * the two-argument form `fn(query, opts)`: when a second argument is present,
 * the first is treated as query params.
 * @param {CallOpts|Record<string, string|number|boolean>} [first] Opts or query params.
 * @param {CallOpts} [second] Opts (only in the two-argument form).
 * @returns {{ query: Record<string, string|number|boolean>|undefined, opts: CallOpts }} Split args.
 */
function splitArgs(first = {}, second) {
  if (second !== undefined) {
    return { query: /** @type {Record<string, string|number|boolean>} */ (first), opts: second };
  }
  return { query: undefined, opts: /** @type {CallOpts} */ (first) };
}

/**
 * GET /health — backend liveness probe.
 * @param {CallOpts|Record<string, string|number|boolean>} [queryOrOpts] Opts, or query params when a second arg is given.
 * @param {CallOpts} [maybeOpts] Opts for the two-argument form.
 * @returns {Promise<RequestResult>} Result object.
 */
export function health(queryOrOpts = {}, maybeOpts) {
  const { query, opts } = splitArgs(queryOrOpts, maybeOpts);
  return request('GET', '/health', { ...opts, query, traceLabel: opts.traceLabel ?? 'health check' });
}

/**
 * GET /tracks — list available tracks.
 * @param {CallOpts|Record<string, string|number|boolean>} [queryOrOpts] Opts, or query params when a second arg is given.
 * @param {CallOpts} [maybeOpts] Opts for the two-argument form.
 * @returns {Promise<RequestResult>} Result object.
 */
export function listTracks(queryOrOpts = {}, maybeOpts) {
  const { query, opts } = splitArgs(queryOrOpts, maybeOpts);
  return request('GET', '/tracks', { ...opts, query, traceLabel: opts.traceLabel ?? 'list tracks' });
}

/**
 * GET /interns — list interns with optional filters/pagination.
 * @param {Record<string, string|number|boolean>} [params] Query params (search, track, page, limit…).
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function listInterns(params = {}, opts = {}) {
  return request('GET', '/interns', {
    ...opts,
    query: params,
    traceLabel: opts.traceLabel ?? 'list interns',
  });
}

/**
 * GET /interns/:id — fetch one intern.
 * @param {string|number} id Intern id.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function getIntern(id, opts = {}) {
  return request('GET', `/interns/${enc(id)}`, {
    ...opts,
    traceLabel: opts.traceLabel ?? `get intern ${id}`,
  });
}

/**
 * POST /interns — create an intern. Always sends an auto-generated
 * idempotency key so safe retries are possible.
 * @param {Record<string, unknown>} data Intern payload.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function createIntern(data, opts = {}) {
  return request('POST', '/interns', {
    ...opts,
    body: data,
    idempotencyKey: newIdempotencyKey(),
    traceLabel: opts.traceLabel ?? 'create intern',
  });
}

/**
 * PUT /interns/:id — replace an intern.
 * @param {string|number} id Intern id.
 * @param {Record<string, unknown>} data Full intern payload.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function replaceIntern(id, data, opts = {}) {
  return request('PUT', `/interns/${enc(id)}`, {
    ...opts,
    body: data,
    traceLabel: opts.traceLabel ?? `replace intern ${id}`,
  });
}

/**
 * PATCH /interns/:id — partially update an intern. Never retried by policy.
 * @param {string|number} id Intern id.
 * @param {Record<string, unknown>} partial Partial payload.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function patchIntern(id, partial, opts = {}) {
  return request('PATCH', `/interns/${enc(id)}`, {
    ...opts,
    body: partial,
    traceLabel: opts.traceLabel ?? `patch intern ${id}`,
  });
}

/**
 * DELETE /interns/:id — delete an intern. A 404 is treated as success
 * (already gone) and resolves with `data: { alreadyGone: true }`.
 * @param {string|number} id Intern id.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export async function deleteIntern(id, opts = {}) {
  try {
    return await request('DELETE', `/interns/${enc(id)}`, {
      ...opts,
      traceLabel: opts.traceLabel ?? `delete intern ${id}`,
    });
  } catch (err) {
    if (isApiError(err) && err.kind === 'http' && err.status === 404) {
      return {
        data: { alreadyGone: true },
        status: 404,
        ok: true,
        headers: new Headers(),
        durationMs: err.durationMs ?? 0,
        serverMs: 0,
        networkMs: 0,
        requestId: err.requestId ?? null,
        attempts: err.attempts ?? 1,
        traceId: err.traceId ?? 'unknown',
      };
    }
    throw err;
  }
}

/**
 * GET /admin/stats — aggregate stats (admin only).
 * @param {CallOpts|Record<string, string|number|boolean>} [queryOrOpts] Opts, or query params when a second arg is given.
 * @param {CallOpts} [maybeOpts] Opts for the two-argument form.
 * @returns {Promise<RequestResult>} Result object.
 */
export function getStats(queryOrOpts = {}, maybeOpts) {
  const { query, opts } = splitArgs(queryOrOpts, maybeOpts);
  return request('GET', '/admin/stats', { ...opts, query, traceLabel: opts.traceLabel ?? 'get stats' });
}

/**
 * GET /demo/status/:code — force an arbitrary status code (demo).
 * @param {number} code Status code to return.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function demoStatus(code, opts = {}) {
  return request('GET', `/demo/status/${encodeURIComponent(code)}`, {
    ...opts,
    traceLabel: opts.traceLabel ?? `demo status ${code}`,
  });
}

/**
 * GET /demo/slow?ms= — respond after a delay (demo).
 * @param {number} ms Delay in ms.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function demoSlow(ms, opts = {}) {
  return request('GET', '/demo/slow', {
    ...opts,
    query: { ms },
    traceLabel: opts.traceLabel ?? `demo slow ${ms}ms`,
  });
}

/**
 * GET /demo/flaky?key=&failFirst= — fail the first N calls for a key (demo).
 * @param {string} key Flakiness bucket key.
 * @param {boolean|number} failFirst Fail the first call(s).
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function demoFlaky(key, failFirst, opts = {}) {
  return request('GET', '/demo/flaky', {
    ...opts,
    query: { key, failFirst },
    traceLabel: opts.traceLabel ?? `demo flaky ${key}`,
  });
}

/**
 * GET /demo/bad-body?mode= — return a malformed body (demo).
 * @param {string} mode Malformation mode.
 * @param {CallOpts} [opts] Call options.
 * @returns {Promise<RequestResult>} Result object.
 */
export function demoBadBody(mode, opts = {}) {
  return request('GET', '/demo/bad-body', {
    ...opts,
    query: { mode },
    traceLabel: opts.traceLabel ?? `demo bad body (${mode})`,
  });
}

/**
 * GET /demo/echo — echo request headers back (demo; proves X-Request-Id flow).
 * @param {CallOpts|Record<string, string|number|boolean>} [queryOrOpts] Opts, or query params when a second arg is given.
 * @param {CallOpts} [maybeOpts] Opts for the two-argument form.
 * @returns {Promise<RequestResult>} Result object.
 */
export function demoEcho(queryOrOpts = {}, maybeOpts) {
  const { query, opts } = splitArgs(queryOrOpts, maybeOpts);
  return request('GET', '/demo/echo', { ...opts, query, traceLabel: opts.traceLabel ?? 'demo echo' });
}

/**
 * GET /demo/requests — recent requests seen by the server (demo; joins
 * client/server logs via X-Request-Id).
 * @param {CallOpts|Record<string, string|number|boolean>} [queryOrOpts] Opts, or query params when a second arg is given.
 * @param {CallOpts} [maybeOpts] Opts for the two-argument form.
 * @returns {Promise<RequestResult>} Result object.
 */
export function demoRequests(queryOrOpts = {}, maybeOpts) {
  const { query, opts } = splitArgs(queryOrOpts, maybeOpts);
  return request('GET', '/demo/requests', {
    ...opts,
    query,
    traceLabel: opts.traceLabel ?? 'demo requests',
  });
}
