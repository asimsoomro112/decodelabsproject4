/**
 * Modal dialogs built on the native <dialog> element: Esc closes, focus is
 * trapped and moved into the first field, @starting-style animates entry.
 *
 * @module ui/dialog
 */

import { h } from '../core/dom.js';
import { trapFocus } from '../core/a11y.js';

/**
 * @typedef {Object} OpenDialogOptions
 * @property {string} title Dialog title.
 * @property {HTMLElement|((form: HTMLFormElement) => HTMLElement)} body
 *   Body content, or a builder receiving the form element.
 * @property {string} [submitLabel] Submit button label. Default 'Save'.
 * @property {boolean} [danger] Danger styling for the submit button.
 * @property {(form: HTMLFormElement) => (unknown|Promise<unknown>)} [onSubmit]
 *   Called on submit; the promise resolves with its return value.
 */

/**
 * Open a modal dialog.
 * @param {OpenDialogOptions} opts Dialog options.
 * @returns {Promise<unknown|null>} Resolves with the submitted value, or null on cancel.
 */
export function openDialog(opts) {
  const { title, body, submitLabel = 'Save', danger = false, onSubmit } = opts;
  return new Promise((resolve) => {
    let settled = false;
    /** @type {(() => void)|null} */
    let release = null;

    /** @param {unknown|null} value */
    function done(value) {
      if (settled) return;
      settled = true;
      if (release) release();
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    }

    const dialog = /** @type {HTMLDialogElement} */ (h('dialog', {
      class: `dialog${danger ? ' dialog--danger' : ''}`,
    }));
    const form = /** @type {HTMLFormElement} */ (h('form', { class: 'dialog__form', novalidate: '' }));
    form.append(h('h2', { class: 'dialog__title', id: 'dialog-title' }, title));
    dialog.setAttribute('aria-labelledby', 'dialog-title');

    const bodyWrap = h('div', { class: 'dialog__body' });
    const bodyEl = typeof body === 'function' ? body(form) : body;
    if (bodyEl) bodyWrap.append(bodyEl);

    const errEl = h('p', { class: 'dialog__error', role: 'alert', hidden: '' });
    const footer = h('div', { class: 'dialog__footer' });
    const cancelBtn = /** @type {HTMLButtonElement} */ (h('button', {
      type: 'button',
      class: 'btn btn--ghost',
    }, 'Cancel'));
    const submitBtn = /** @type {HTMLButtonElement} */ (h('button', {
      type: 'submit',
      class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
    }, submitLabel));
    footer.append(cancelBtn, submitBtn);
    form.append(bodyWrap, errEl, footer);
    dialog.append(form);
    document.body.append(dialog);

    release = trapFocus(dialog);

    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    dialog.addEventListener('close', () => done(null));
    cancelBtn.addEventListener('click', () => done(null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      submitBtn.disabled = true;
      try {
        const value = onSubmit ? await onSubmit(form) : null;
        done(value);
      } catch (err) {
        errEl.textContent = err instanceof Error ? err.message : 'Something went wrong.';
        errEl.hidden = false;
        submitBtn.disabled = false;
      }
    });

    dialog.showModal();
  });
}

/**
 * Open a confirmation dialog.
 * @param {{ title: string, message: string, confirmLabel?: string, danger?: boolean }} opts Options.
 * @returns {Promise<boolean>} True when confirmed, false on cancel.
 */
export async function confirmDialog(opts) {
  const { title, message, confirmLabel = 'Delete', danger = true } = opts;
  const value = await openDialog({
    title,
    danger,
    submitLabel: confirmLabel,
    body: () => h('p', { class: 'dialog__message' }, message),
    onSubmit: () => true,
  });
  return value === true;
}
