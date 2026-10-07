/**
 * Tiny synchronous event bus. DOM-free so it can be imported anywhere,
 * including Node tests. Listener exceptions are contained and reported in dev.
 *
 * @module core/events
 */

import { IS_DEV } from '../config.js';

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Subscribe to an event.
 * @param {string} name Event name, e.g. 'request:start'.
 * @param {(detail: any) => void} fn Listener called with the event detail.
 * @returns {() => void} Unsubscribe function.
 */
export function on(name, fn) {
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(fn);
  return function unsubscribe() {
    const s = listeners.get(name);
    if (s) {
      s.delete(fn);
      if (s.size === 0) listeners.delete(name);
    }
  };
}

/**
 * Subscribe to an event exactly once.
 * @param {string} name Event name.
 * @param {(detail: any) => void} fn Listener.
 * @returns {() => void} Unsubscribe function.
 */
export function once(name, fn) {
  const off = on(name, (detail) => {
    off();
    fn(detail);
  });
  return off;
}

/**
 * Emit an event to all current listeners, in subscription order.
 * @param {string} name Event name.
 * @param {any} [detail] Payload passed to listeners.
 * @returns {void}
 */
export function emit(name, detail) {
  const set = listeners.get(name);
  if (!set || set.size === 0) return;
  for (const fn of [...set]) {
    try {
      fn(detail);
    } catch (err) {
      if (IS_DEV) {
        console.error(`[events] listener for "${name}" threw:`, err);
      }
    }
  }
}
