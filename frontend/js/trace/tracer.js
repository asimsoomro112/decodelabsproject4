/**
 * Request tracer. Subscribes to the client's `request:*` events and keeps a
 * bounded log (max 200) of trace entries, each with a lifecycle timeline.
 * Call {@link initTracer} once from main.js.
 *
 * @module trace/tracer
 */

import { on } from '../core/events.js';

/**
 * @typedef {Object} LifecycleMark
 * @property {string} step Step id (see trace/lifecycle.js).
 * @property {string} at ISO timestamp of the mark.
 * @property {string} [note] Short note for the mark.
 */

/**
 * @typedef {Object} TraceEntry
 * @property {string} traceId Client trace id.
 * @property {string} startedAt ISO timestamp of request:start.
 * @property {string} label Human label.
 * @property {string} method HTTP method.
 * @property {string} url Full URL.
 * @property {string} path API path.
 * @property {number|null} status HTTP status (null until response).
 * @property {boolean|null} ok response.ok (null until response).
 * @property {number|null} durationMs Total duration in ms.
 * @property {number|null} serverMs Server-Timing app duration.
 * @property {number|null} networkMs Duration minus server time.
 * @property {string|null} requestId Server-echoed request id.
 * @property {number} attempts Attempts made.
 * @property {string} outcome 'pending' | 'ok' | 'http-error' | 'network-error' | 'timeout' | 'aborted' | 'parse-error'.
 * @property {Record<string, string>} requestHeaders Redacted request headers.
 * @property {Record<string, string>} responseHeaders Response headers.
 * @property {string|null} body Body snippet (request snippet, then response snippet).
 * @property {{ kind: string, message: string }|null} error Error summary.
 * @property {LifecycleMark[]} lifecycle Timeline marks in order.
 */

const MAX_ENTRIES = 200;

/** @type {Map<string, TraceEntry>} */
const entries = new Map();

/** @type {Set<(entries: TraceEntry[]) => void>} */
const listeners = new Set();

let initialized = false;

/**
 * @returns {string} Current ISO timestamp.
 */
function stamp() {
  return new Date().toISOString();
}

/**
 * Notify subscribers with a fresh snapshot.
 * @returns {void}
 */
function notify() {
  const snapshot = getEntries();
  for (const fn of [...listeners]) {
    try {
      fn(snapshot);
    } catch {
      /* subscriber errors must not break tracing */
    }
  }
}

/**
 * Enforce the 200-entry cap by dropping the oldest entries.
 * @returns {void}
 */
function enforceCap() {
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}

/**
 * Internal event handler: folds one `request:*` event into its trace entry.
 * Exported for tests; wire via {@link initTracer} in the app.
 * @param {'start'|'preflight'|'attempt'|'end'|'error'} kind Event kind.
 * @param {any} detail Event detail payload.
 * @returns {void}
 */
export function recordEntry(kind, detail) {
  if (kind === 'start') {
    /** @type {TraceEntry} */
    const entry = {
      traceId: detail.traceId,
      startedAt: stamp(),
      label: detail.label ?? `${detail.method} ${detail.path}`,
      method: detail.method,
      url: detail.url,
      path: detail.path,
      status: null,
      ok: null,
      durationMs: null,
      serverMs: null,
      networkMs: null,
      requestId: null,
      attempts: 0,
      outcome: 'pending',
      requestHeaders: detail.requestHeaders ?? {},
      responseHeaders: {},
      body: detail.body ?? null,
      error: null,
      lifecycle: [
        { step: 'click', at: stamp(), note: detail.label ?? `${detail.method} ${detail.path}` },
        { step: 'try', at: stamp(), note: `${detail.method} ${detail.path}` },
      ],
    };
    entries.set(entry.traceId, entry);
    enforceCap();
    notify();
    return;
  }

  const entry = entries.get(detail.traceId);
  if (!entry) return; // unknown trace id — ignore

  if (kind === 'preflight') {
    entry.lifecycle.push({ step: 'fetch', at: stamp(), note: 'preflight OPTIONS' });
  } else if (kind === 'attempt') {
    entry.attempts = detail.attempt;
    const hasFetch = entry.lifecycle.some((m) => m.step === 'fetch');
    if (!hasFetch) entry.lifecycle.push({ step: 'fetch', at: stamp(), note: 'fetch' });
    entry.lifecycle.push({
      step: 'await',
      at: stamp(),
      note: detail.attempt === 1 ? 'awaiting response' : `retry #${detail.attempt} after ${detail.delayMs} ms`,
    });
  } else if (kind === 'end') {
    entry.status = detail.status;
    entry.ok = detail.ok;
    entry.durationMs = detail.durationMs;
    entry.serverMs = detail.serverMs;
    entry.networkMs = detail.networkMs;
    entry.requestId = detail.requestId ?? null;
    entry.attempts = detail.attempts;
    entry.responseHeaders = detail.responseHeaders ?? {};
    entry.body = detail.body ?? entry.body;
    entry.outcome = detail.ok ? 'ok' : 'http-error';
    entry.lifecycle.push({
      step: 'check',
      at: stamp(),
      note: `${detail.status} ${detail.ok ? 'ok' : 'error'}`,
    });
    entry.lifecycle.push({
      step: 'json',
      at: stamp(),
      note: `parsed in ${Math.round(detail.parseMs ?? 0)} ms`,
    });
  } else if (kind === 'error') {
    const kindToOutcome = {
      timeout: 'timeout',
      abort: 'aborted',
      network: 'network-error',
      parse: 'parse-error',
      http: 'http-error',
    };
    entry.outcome =
      /** @type {TraceEntry['outcome']} */ (
        kindToOutcome[/** @type {keyof typeof kindToOutcome} */ (detail.kind)] ?? 'http-error'
      );
    entry.attempts = detail.attempts ?? entry.attempts;
    entry.durationMs = detail.durationMs ?? entry.durationMs;
    entry.error = { kind: detail.kind, message: String(detail.kind) };
    entry.lifecycle.push({ step: 'error', at: stamp(), note: detail.kind });
  }
  notify();
}

/**
 * Subscribe to the client's request events. Call once from main.js.
 * @returns {void}
 */
export function initTracer() {
  if (initialized) return;
  initialized = true;
  on('request:start', (d) => recordEntry('start', d));
  on('request:preflight-suspected', (d) => recordEntry('preflight', d));
  on('request:attempt', (d) => recordEntry('attempt', d));
  on('request:end', (d) => recordEntry('end', d));
  on('request:error', (d) => recordEntry('error', d));
}

/**
 * All trace entries, oldest first.
 * @returns {TraceEntry[]} Entry snapshot.
 */
export function getEntries() {
  return [...entries.values()];
}

/**
 * Subscribe to trace changes.
 * @param {(entries: TraceEntry[]) => void} fn Listener receiving snapshots.
 * @returns {() => void} Unsubscribe function.
 */
export function onTraceChange(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Clear all trace entries.
 * @returns {void}
 */
export function clearTrace() {
  entries.clear();
  notify();
}

/**
 * Mark a trace's DOM work complete: appends the 'dom' and 'finally'
 * lifecycle steps. No-op for unknown trace ids.
 * @param {string} traceId Trace id to complete.
 * @param {{ renderMs?: number }} [opts] Optional render timing.
 * @returns {void}
 */
export function complete(traceId, opts = {}) {
  const entry = entries.get(traceId);
  if (!entry) return;
  const renderMs = opts.renderMs;
  entry.lifecycle.push({
    step: 'dom',
    at: stamp(),
    note: renderMs !== undefined ? `rendered in ${Math.round(renderMs)} ms` : 'rendered',
  });
  entry.lifecycle.push({ step: 'finally', at: stamp(), note: 'trace complete' });
  notify();
}

/**
 * Export all entries as a JSON string.
 * @returns {string} JSON string of the trace log.
 */
export function exportTraceJson() {
  return JSON.stringify(getEntries(), null, 2);
}
