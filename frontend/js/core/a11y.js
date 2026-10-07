/**
 * Accessibility helpers: a polite live-region announcer and a focus trap
 * for modal dialogs.
 *
 * @module core/a11y
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Announce a message to screen readers via the polite live region
 * (`#announcer`; created if missing).
 * @param {string} msg Message to announce.
 * @returns {void}
 */
export function announce(msg) {
  if (typeof document === 'undefined') return;
  let region = document.getElementById('announcer');
  if (!region) {
    region = document.createElement('div');
    region.id = 'announcer';
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const target = region;
  target.textContent = '';
  const write = () => {
    target.textContent = msg;
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(write);
  } else {
    setTimeout(write, 0);
  }
}

/**
 * Trap Tab focus inside a container (for modals). Focuses the first
 * focusable element immediately.
 * @param {HTMLElement} container Container to trap focus within.
 * @returns {() => void} Release function: removes the trap and restores focus.
 */
export function trapFocus(container) {
  const prev = /** @type {Element|null} */ (document.activeElement);

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => {
      const h = /** @type {HTMLElement} */ (el);
      return h.offsetParent !== null || el === document.activeElement;
    });
    if (items.length === 0) return;
    const first = /** @type {HTMLElement} */ (items[0]);
    const last = /** @type {HTMLElement} */ (items[items.length - 1]);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKey);
  const first = /** @type {HTMLElement|null} */ (container.querySelector(FOCUSABLE));
  if (first) first.focus();

  return function release() {
    container.removeEventListener('keydown', onKey);
    if (prev && typeof /** @type {any} */ (prev).focus === 'function') {
      /** @type {any} */ (prev).focus();
    }
  };
}
