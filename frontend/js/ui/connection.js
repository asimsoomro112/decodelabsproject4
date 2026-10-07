/**
 * Connection chip: pings GET /health every 20 s while the tab is visible
 * (first ping gets a 60 s timeout for cold starts). Chip states:
 * `Connected · N ms` / `Waking server…` / `Offline`.
 *
 * @module ui/connection
 */

import { health } from '../api/endpoints.js';
import { isApiError } from '../api/errors.js';

const PING_INTERVAL_MS = 20000;
const FIRST_PING_TIMEOUT_MS = 60000;
const PING_TIMEOUT_MS = 8000;

/**
 * Start the connection monitor.
 * @param {HTMLElement|null} chipEl Element to render the chip state into.
 * @returns {() => void} Stop function.
 */
export function initConnection(chipEl) {
  if (!chipEl) return () => {};
  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null;
  let first = true;
  let stopped = false;

  /**
   * @param {'ok'|'waking'|'offline'} state Chip state.
   * @param {string} text Chip text.
   */
  function set(state, text) {
    chipEl.dataset.state = state;
    chipEl.textContent = text;
  }

  /** One health ping. */
  async function ping() {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await health({
        timeoutMs: first ? FIRST_PING_TIMEOUT_MS : PING_TIMEOUT_MS,
        retry: false,
        traceLabel: 'health ping',
      });
      set('ok', `Connected · ${Math.round(res.durationMs)} ms`);
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!offline && isApiError(err) && err.kind === 'abort') {
        set('offline', 'Offline');
      } else {
        set(offline ? 'offline' : 'waking', offline ? 'Offline' : 'Waking server…');
      }
    } finally {
      first = false;
    }
  }

  /** Start pinging. */
  function start() {
    stop();
    if (stopped) return;
    void ping();
    timer = setInterval(() => {
      void ping();
    }, PING_INTERVAL_MS);
  }

  /** Stop pinging. */
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      set('waking', 'Waking server…');
      first = true;
      start();
    });
    window.addEventListener('offline', () => {
      set('offline', 'Offline');
      stop();
    });
  }

  start();
  return () => {
    stopped = true;
    stop();
  };
}
