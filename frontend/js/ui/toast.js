/**
 * Toast notifications. Container is aria-live polite. All markup is built
 * with textContent — never innerHTML.
 *
 * @module ui/toast
 */

import { h, qs } from '../core/dom.js';

/**
 * @typedef {Object} ToastAction
 * @property {string} label Button label.
 * @property {() => void} onClick Click handler (toast dismisses afterwards).
 */

/**
 * @typedef {Object} ToastOptions
 * @property {ToastAction} [action] Optional action button.
 * @property {number} [durationMs] Auto-dismiss delay; 0 disables. Default 4500.
 */

/**
 * @typedef {Object} ToastHandle
 * @property {() => void} dismiss Dismiss the toast.
 */

/**
 * Get (or create) the toast container.
 * @returns {HTMLElement} The #toasts container.
 */
function ensureContainer() {
  let container = qs('#toasts');
  if (!container) {
    container = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(container);
  }
  return /** @type {HTMLElement} */ (container);
}

/**
 * Show a toast.
 * @param {string} message Message text.
 * @param {'info'|'success'|'error'} [type] Toast type. Default 'info'.
 * @param {ToastOptions} [opts] Options.
 * @returns {ToastHandle} Handle with dismiss().
 */
function showToast(message, type = 'info', opts = {}) {
  const { action, durationMs = 4500 } = opts;
  const container = ensureContainer();
  const el = h('div', { class: `toast toast--${type}`, role: 'status' });
  el.append(h('span', { class: 'toast__msg' }, message));

  /** Dismiss with a leave animation. */
  function dismiss() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    el.classList.add('toast--leaving');
    setTimeout(() => el.remove(), 260);
  }

  if (action) {
    const btn = h('button', { class: 'toast__action', type: 'button' }, action.label);
    btn.addEventListener('click', () => {
      try {
        action.onClick();
      } finally {
        dismiss();
      }
    });
    el.append(btn);
  }
  const close = h('button', { class: 'toast__close', type: 'button', 'aria-label': 'Dismiss notification' }, '×');
  close.addEventListener('click', dismiss);
  el.append(close);

  container.appendChild(el);
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  if (durationMs > 0) timer = setTimeout(dismiss, durationMs);
  return { dismiss };
}

/**
 * Show a success toast.
 * @param {string} message Message text.
 * @param {ToastOptions} [opts] Options.
 * @returns {ToastHandle} Handle with dismiss().
 */
export function success(message, opts = {}) {
  return showToast(message, 'success', opts);
}

/**
 * Show an info toast.
 * @param {string} message Message text.
 * @param {ToastOptions} [opts] Options.
 * @returns {ToastHandle} Handle with dismiss().
 */
export function info(message, opts = {}) {
  return showToast(message, 'info', opts);
}

/**
 * Show an error toast.
 * @param {string} message Message text.
 * @param {ToastOptions} [opts] Options.
 * @returns {ToastHandle} Handle with dismiss().
 */
export function error(message, opts = {}) {
  return showToast(message, 'error', opts);
}

/**
 * Primary toast entry point: `toast(message, type, opts)`.
 * Also exposes `.success/.error/.info` so the `toast.error('msg')` call
 * style works too.
 * @type {((message: string, type?: 'info'|'success'|'error', opts?: ToastOptions) => ToastHandle) & { success: (message: string, opts?: ToastOptions) => ToastHandle, error: (message: string, opts?: ToastOptions) => ToastHandle, info: (message: string, opts?: ToastOptions) => ToastHandle }}
 */
export const toast = Object.assign(showToast, { success, error, info });
