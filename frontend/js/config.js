/**
 * Runtime configuration for SynapseBridge frontend modules.
 *
 * The API base URL is read from `window.SYNAPSE_CONFIG` (set by the plain
 * `config.js` script tag in index.html, loaded before any module). Falls back
 * to the local dev backend when the config is absent. Safe to import in Node:
 * never touches `window`/`document` without guards.
 *
 * @module config
 */

/**
 * Default API base URL. Prefer {@link resolveBaseUrl} at call time so that
 * {@link setBaseUrl} overrides (used by tests) take effect.
 * @type {string}
 */
export const API_BASE_URL = (() => {
  const win = /** @type {any} */ (typeof globalThis.window !== 'undefined' ? globalThis.window : null);
  return (win && win.SYNAPSE_CONFIG && win.SYNAPSE_CONFIG.API_BASE_URL) || 'http://localhost:4000/api/v1';
})();

/** @type {string|null} Test/dev override set via {@link setBaseUrl}. */
let baseUrlOverride = null;

/**
 * Override the API base URL (used by tests; also handy in dev consoles).
 * @param {string} url New base URL, e.g. 'http://test.local/api/v1'.
 * @returns {void}
 */
export function setBaseUrl(url) {
  baseUrlOverride = url;
}

/**
 * Resolve the effective base URL: explicit per-call value wins, then the
 * {@link setBaseUrl} override, then {@link API_BASE_URL}.
 * @param {string} [explicit] Per-call base URL override.
 * @returns {string} Effective base URL.
 */
export function resolveBaseUrl(explicit) {
  return explicit || baseUrlOverride || API_BASE_URL;
}

/**
 * True unless we are clearly in production. In Node this reads
 * `process.env.NODE_ENV`; in the browser it treats localhost-like hosts as dev.
 * @type {boolean}
 */
export const IS_DEV = (() => {
  try {
    const g = /** @type {any} */ (globalThis);
    if (g.process && g.process.env && typeof g.process.env.NODE_ENV === 'string') {
      return g.process.env.NODE_ENV !== 'production';
    }
  } catch {
    /* storage/env unavailable — fall through to hostname check */
  }
  try {
    const host = (typeof globalThis.location !== 'undefined' && globalThis.location.hostname) || '';
    return host === '' || host === 'localhost' || host === '127.0.0.1';
  } catch {
    /* no location — assume dev */
  }
  return true;
})();
