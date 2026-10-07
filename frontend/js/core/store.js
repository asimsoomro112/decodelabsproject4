/**
 * Minimal observable store: immutable-ish state with shallow-merge `set`
 * and subscriber notifications.
 *
 * @module core/store
 */

import { IS_DEV } from '../config.js';

/**
 * Create a store.
 * @template {Record<string, any>} T
 * @param {T} initial Initial state.
 * @returns {{ get: () => T, set: (patch: Partial<T> | ((s: T) => T)) => T, subscribe: (fn: (state: T, prev: T) => void) => () => void }}
 *   `{ get, set, subscribe }`. `set` accepts a partial patch (shallow-merged)
 *   or an updater function; `subscribe` returns an unsubscribe function.
 */
export function createStore(initial = /** @type {T} */ ({})) {
  /** @type {T} */
  let state = { ...initial };
  /** @type {Set<(state: T, prev: T) => void>} */
  const listeners = new Set();

  return {
    /** @returns {T} Current state. */
    get() {
      return state;
    },
    /**
     * @param {Partial<T> | ((s: T) => T)} patch Partial patch or updater.
     * @returns {T} New state.
     */
    set(patch) {
      const prev = state;
      state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
      for (const fn of [...listeners]) {
        try {
          fn(state, prev);
        } catch (err) {
          if (IS_DEV) console.error('[store] subscriber threw:', err);
        }
      }
      return state;
    },
    /**
     * @param {(state: T, prev: T) => void} fn Subscriber.
     * @returns {() => void} Unsubscribe function.
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
