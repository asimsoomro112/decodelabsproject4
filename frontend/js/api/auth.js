/**
 * Demo role-based auth. Roles persist in localStorage (with an in-memory
 * fallback for non-browser contexts such as Node tests). Editor/Admin get a
 * demo bearer token sent by the API client; guests send no Authorization.
 *
 * @module api/auth
 */

import { IS_DEV } from '../config.js';

const ROLE_KEY = 'synapsebridge.role';

/** @type {'guest'|'editor'|'admin'} In-memory fallback when storage is unavailable. */
let memoryRole = 'guest';

/** @type {Set<(role: 'guest'|'editor'|'admin') => void>} */
const listeners = new Set();

/**
 * Read the persisted role without throwing.
 * @returns {string|null} Stored role or null.
 */
function readStored() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(ROLE_KEY);
  } catch {
    /* storage unavailable (private mode, SSR, tests) */
    return null;
  }
}

/**
 * @param {string|null} v Raw value.
 * @returns {v is 'guest'|'editor'|'admin'} True for a known role.
 */
function isRole(v) {
  return v === 'guest' || v === 'editor' || v === 'admin';
}

/**
 * Current role.
 * @returns {'guest'|'editor'|'admin'} The active role (defaults to 'guest').
 */
export function getRole() {
  const stored = readStored();
  if (isRole(stored)) return stored;
  return memoryRole;
}

/**
 * Set the active role and notify subscribers.
 * @param {'guest'|'editor'|'admin'} r New role.
 * @returns {'guest'|'editor'|'admin'} The role that was set.
 */
export function setRole(r) {
  if (!isRole(r)) throw new TypeError(`Unknown role: ${String(r)}`);
  memoryRole = r;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ROLE_KEY, r);
  } catch {
    /* storage unavailable — in-memory value still applies */
  }
  for (const fn of [...listeners]) {
    try {
      fn(r);
    } catch (err) {
      if (IS_DEV) console.error('[auth] role listener threw:', err);
    }
  }
  return r;
}

/**
 * Demo bearer token for the current role. Demo-only values matching the
 * backend's default demo tokens; guests get null (no Authorization header).
 * @returns {string|null} 'demo-editor', 'demo-admin', or null for guests.
 */
export function getToken() {
  const role = getRole();
  if (role === 'editor') return 'demo-editor'; // demo-only
  if (role === 'admin') return 'demo-admin'; // demo-only
  return null;
}

/**
 * Subscribe to role changes.
 * @param {(role: 'guest'|'editor'|'admin') => void} fn Listener.
 * @returns {() => void} Unsubscribe function.
 */
export function onRoleChange(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
