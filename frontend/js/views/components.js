/**
 * Shared building blocks for the SynapseBridge SPA views.
 *
 * Every view imports from here for consistent glass-card styling, state
 * blocks (loading / empty / error), chips, and small a11y helpers.
 * DOM is built with the `h()` helper from `../core/dom.js`; API data is
 * only ever injected via text nodes / textContent — never innerHTML.
 *
 * Assumed `h(tag, attrs, ...children)` contract: string children become
 * text nodes, `class` sets the class attribute, `for` sets the label
 * target, and event listeners are attached with addEventListener.
 *
 * @module views/components
 */

import { h, clear } from '../core/dom.js';
import { skeletonCard, skeletonRow } from '../ui/skeleton.js';

let baseInjected = false;

/**
 * Inject a <style> element into <head> exactly once per id.
 *
 * @param {string} id - Unique style element id.
 * @param {string} css - Raw CSS text (static, no API data).
 */
export function injectCss(id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Ensure the shared base stylesheet for all views is present.
 */
export function ensureBaseStyles() {
  if (baseInjected) return;
  baseInjected = true;
  injectCss('sb-views-base', `
    @layer components {
      :root {
        --sb-bg: #0b0e17;
        --sb-glass: rgba(255, 255, 255, 0.045);
        --sb-glass-strong: rgba(255, 255, 255, 0.08);
        --sb-border: rgba(255, 255, 255, 0.1);
        --sb-text: #eef1ff;
        --sb-muted: #9aa3c0;
        --sb-accent: #8b7bff;
        --sb-accent-2: #4fd1c5;
        --sb-emerald: #34d399;
        --sb-amber: #fbbf24;
        --sb-rose: #fb7185;
        --sb-radius: 16px;
        --sb-input-bg: rgba(0, 0, 0, 0.4);
        --sb-pre-bg: rgba(0, 0, 0, 0.45);
        --sb-chip-bg: rgba(255, 255, 255, 0.06);
        --sb-th-bg: rgba(255, 255, 255, 0.03);
        --sb-kbd-bg: rgba(255, 255, 255, 0.08);
      }
      :root[data-theme='light'] {
        --sb-bg: var(--bg);
        --sb-glass: rgba(0, 0, 0, 0.045);
        --sb-glass-strong: rgba(0, 0, 0, 0.08);
        --sb-border: var(--line);
        --sb-text: var(--ink);
        --sb-muted: var(--muted);
        --sb-input-bg: rgba(255, 255, 255, 0.6);
        --sb-pre-bg: rgba(255, 255, 255, 0.65);
        --sb-chip-bg: rgba(0, 0, 0, 0.06);
        --sb-th-bg: rgba(0, 0, 0, 0.03);
        --sb-kbd-bg: rgba(0, 0, 0, 0.05);
      }
      .sb-view { max-width: 1120px; margin: 0 auto; padding: 32px 20px 64px; color: var(--sb-text); }
      .sb-hero { text-align: center; margin: 8px 0 32px; }
      .sb-hero h1 { font-size: clamp(30px, 5vw, 52px); letter-spacing: -0.02em; margin: 0 0 12px; }
      .sb-hero p { color: var(--sb-muted); font-size: 17px; max-width: 640px; margin: 0 auto; line-height: 1.6; }
      .sb-section { margin: 40px 0; }
      .sb-section > h2 { font-size: 24px; margin: 0 0 6px; letter-spacing: -0.01em; }
      .sb-section > p.sb-lede { color: var(--sb-muted); margin: 0 0 20px; line-height: 1.6; max-width: 720px; }
      .glass {
        background: var(--sb-glass);
        border: 1px solid var(--sb-border);
        border-radius: var(--sb-radius);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        padding: 20px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
      }
      .glass > h3 { margin: 0 0 4px; font-size: 17px; }
      .glass .sb-sub { color: var(--sb-muted); font-size: 13px; margin: 0 0 14px; line-height: 1.5; }
      .sb-grid { display: grid; gap: 16px; }
      .sb-grid.cols-2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .sb-grid.cols-3 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
      .sb-grid.cols-4 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
      .sb-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      .sb-muted { color: var(--sb-muted); }
      .sb-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
      pre.sb-pre {
        background: var(--sb-pre-bg); border: 1px solid var(--sb-border);
        border-radius: 12px; padding: 14px; overflow: auto; font-size: 13px; line-height: 1.6;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--sb-text);
        white-space: pre-wrap; word-break: break-word; margin: 12px 0;
      }
      .sb-btn {
        min-height: 44px; padding: 10px 18px; border-radius: 10px; cursor: pointer;
        border: 1px solid var(--sb-border); background: var(--sb-glass-strong);
        color: var(--sb-text); font-size: 15px; font-weight: 600;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
      }
      .sb-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.15); }
      .sb-btn:disabled { opacity: 0.55; cursor: wait; }
      .sb-btn-primary { background: linear-gradient(135deg, #7c6cf5, #4fd1c5); border: none; color: #fff; }
      :root[data-theme='light'] .sb-btn-primary { color: #fff; }
      .sb-btn-danger { background: rgba(251, 113, 133, 0.14); border-color: rgba(251,113,133,.45); color: var(--sb-rose); }
      .sb-btn-ghost { background: transparent; }
      .sb-btn-sm { min-height: 36px; padding: 6px 12px; font-size: 13px; }
      .sb-btn:focus-visible, .sb-input:focus-visible, .sb-select:focus-visible,
      .sb-textarea:focus-visible, a:focus-visible, [tabindex]:focus-visible {
        outline: 2px solid var(--sb-accent-2); outline-offset: 2px;
      }
      .sb-input, .sb-select, .sb-textarea {
        min-height: 44px; padding: 10px 12px; border-radius: 10px; font-size: 15px;
        background: var(--sb-input-bg); border: 1px solid var(--sb-border); color: var(--sb-text);
        width: 100%; box-sizing: border-box;
      }
      .sb-select { width: auto; }
      .sb-textarea { min-height: 120px; resize: vertical; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; }
      .sb-label { display: block; font-size: 13px; font-weight: 600; color: var(--sb-muted); margin: 0 0 6px; }
      .chip {
        display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px;
        font-size: 12.5px; font-weight: 600; border: 1px solid var(--sb-border);
        background: var(--sb-chip-bg); color: var(--sb-text); white-space: nowrap;
      }
      .chip-emerald { background: rgba(52, 211, 153, 0.14); border-color: rgba(52,211,153,.45); color: var(--sb-emerald); }
      .chip-amber { background: rgba(251, 191, 36, 0.14); border-color: rgba(251,191,36,.45); color: var(--sb-amber); }
      .chip-rose { background: rgba(251, 113, 133, 0.14); border-color: rgba(251,113,133,.45); color: var(--sb-rose); }
      .chip-violet { background: rgba(139, 123, 255, 0.16); border-color: rgba(139,123,255,.5); color: var(--sb-accent); }
      .chip-ghost { background: transparent; border-style: dashed; color: var(--sb-muted); }
      .method-pill {
        display: inline-block; padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 700;
        font-family: ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.04em;
        background: rgba(79, 209, 197, 0.15); color: var(--sb-accent-2); border: 1px solid rgba(79,209,197,.4);
      }
      .method-pill.m-POST { background: rgba(139,123,255,.16); color: var(--sb-accent); border-color: rgba(139,123,255,.5); }
      .method-pill.m-PUT, .method-pill.m-PATCH { background: rgba(251,191,36,.14); color: var(--sb-amber); border-color: rgba(251,191,36,.45); }
      .method-pill.m-DELETE { background: rgba(251,113,133,.14); color: var(--sb-rose); border-color: rgba(251,113,133,.45); }
      .sb-state { padding: 28px 20px; text-align: center; color: var(--sb-muted); }
      .sb-state h3 { color: var(--sb-text); margin: 0 0 8px; font-size: 18px; }
      .sb-state p { margin: 0 0 16px; line-height: 1.6; }
      .sb-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--sb-border); }
      table.sb-table { width: 100%; border-collapse: collapse; font-size: 14px; }
      table.sb-table th, table.sb-table td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--sb-border); vertical-align: top; color: var(--sb-text); }
      table.sb-table th { color: var(--sb-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; background: var(--sb-th-bg); }
      table.sb-table tr:last-child td { border-bottom: none; }
      .sb-kbd { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; background: var(--sb-kbd-bg); border: 1px solid var(--sb-border); border-bottom-width: 2px; border-radius: 6px; padding: 2px 7px; color: var(--sb-text); }
      .field-error { color: var(--sb-rose); font-size: 13px; margin: 6px 0 0; }
      .sb-input[aria-invalid="true"] { border-color: rgba(251,113,133,.7); }
      .error-summary { background: rgba(251,113,133,.1); border: 1px solid rgba(251,113,133,.5); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
      .error-summary h4 { margin: 0 0 8px; color: var(--sb-rose); font-size: 15px; }
      .error-summary ul { margin: 0; padding-left: 20px; color: var(--sb-rose); font-size: 14px; }
      @keyframes sb-pulse { 0% { box-shadow: 0 0 0 0 rgba(139,123,255,.55); } 100% { box-shadow: 0 0 0 18px rgba(139,123,255,0); } }
      .sb-pulse { animation: sb-pulse 0.9s ease-out 2; }
      @keyframes sb-spin { to { transform: rotate(360deg); } }
      .sb-spinner { width: 34px; height: 34px; border-radius: 50%; border: 4px solid rgba(255,255,255,.15); border-top-color: var(--sb-accent-2); animation: sb-spin 0.8s linear infinite; }
      :root[data-theme='light'] .sb-spinner { border-color: rgba(0,0,0,.15); border-top-color: var(--sb-accent-2); }
      @media (prefers-reduced-motion: reduce) {
        .sb-pulse, .sb-spinner { animation: none; }
        .sb-btn:hover:not(:disabled) { transform: none; }
      }
    }
  `);
}

/**
 * Page section with a heading and lede paragraph.
 *
 * @param {string} title - Section heading.
 * @param {string} lede - One or two sentence description.
 * @returns {HTMLElement} The <section> element.
 */
export function section(title, lede) {
  const s = h('section', { class: 'sb-section' }, h('h2', {}, title));
  if (lede) s.appendChild(h('p', { class: 'sb-lede' }, lede));
  return s;
}

/**
 * Glassmorphic card with an optional title/subtitle header.
 *
 * @param {string} [title] - Card title.
 * @param {string} [sub] - Subtitle text.
 * @returns {HTMLElement} The <article> element.
 */
export function card(title, sub) {
  const el = h('article', { class: 'glass' });
  if (title) el.appendChild(h('h3', {}, title));
  if (sub) el.appendChild(h('p', { class: 'sb-sub' }, sub));
  return el;
}

/**
 * Small status chip.
 *
 * @param {string} text - Chip label (plain text).
 * @param {string} [tone] - One of neutral|emerald|amber|rose|violet|ghost.
 * @returns {HTMLElement} The chip <span>.
 */
export function chip(text, tone = 'neutral') {
  return h('span', { class: `chip chip-${tone}` }, String(text));
}

/**
 * HTTP method pill (GET/POST/PUT/PATCH/DELETE/OPTIONS).
 *
 * @param {string} method - HTTP method.
 * @returns {HTMLElement} The pill <span>.
 */
export function methodPill(method) {
  const m = String(method || '?').toUpperCase();
  return h('span', { class: `method-pill m-${m}` }, m);
}

/**
 * Status chip with color AND a text label (never color alone).
 *
 * @param {number|string|null|undefined} status - HTTP status code.
 * @returns {HTMLElement} The chip <span>.
 */
export function statusChip(status) {
  const n = Number(status);
  if (!Number.isFinite(n) || n <= 0) {
    return chip('network error', 'rose');
  }
  const cls = n < 300 ? 'emerald' : n < 500 ? 'amber' : 'rose';
  const label = n < 300 ? 'success' : n < 400 ? 'redirect' : n < 500 ? 'client error' : 'server error';
  const el = chip(`${n} ${label}`, cls);
  el.setAttribute('aria-label', `HTTP status ${n}, ${label}`);
  return el;
}

/**
 * Render skeleton placeholders into a container (loading state).
 *
 * @param {HTMLElement} el - Container to fill.
 * @param {{rows?: number, cards?: boolean}} [opts] - How many placeholders.
 */
export function loadingInto(el, opts = {}) {
  const { rows = 3, cards = false } = opts;
  clear(el);
  for (let i = 0; i < rows; i++) {
    el.appendChild(cards ? skeletonCard() : skeletonRow());
  }
}

/**
 * Empty state block with an optional action button.
 *
 * @param {{title: string, body?: string, actionLabel?: string, onAction?: () => void}} opts
 * @returns {HTMLElement}
 */
export function emptyState({ title, body, actionLabel, onAction }) {
  const el = h('div', { class: 'sb-state', role: 'status' }, h('h3', {}, title));
  if (body) el.appendChild(h('p', {}, body));
  if (actionLabel && onAction) {
    const btn = h('button', { class: 'sb-btn', type: 'button' }, actionLabel);
    btn.addEventListener('click', onAction);
    el.appendChild(btn);
  }
  return el;
}

/**
 * Error state block with a Retry button.
 *
 * @param {{message: string, onRetry: () => void}} opts
 * @returns {HTMLElement}
 */
export function errorState({ message, onRetry }) {
  const el = h('div', { class: 'sb-state', role: 'alert' }, h('h3', {}, 'Something broke on the wire'));
  el.appendChild(h('p', {}, message));
  const btn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, 'Retry');
  btn.addEventListener('click', onRetry);
  el.appendChild(btn);
  return el;
}

/**
 * Labeled form field wrapper.
 *
 * @param {{label: string, id: string, input: HTMLElement, hint?: string}} opts
 * @returns {HTMLElement} Wrapper div containing label + input + hint/error slots.
 */
export function formField({ label, id, input, hint }) {
  const wrap = h('div', { class: 'sb-field', style: 'margin-bottom:14px;' });
  const lab = h('label', { class: 'sb-label', for: id }, label);
  wrap.appendChild(lab);
  wrap.appendChild(input);
  if (hint) wrap.appendChild(h('p', { class: 'sb-muted', style: 'font-size:12.5px;margin:6px 0 0;' }, hint));
  const errSlot = h('p', { class: 'field-error', id: `${id}-error`, hidden: 'true' });
  wrap.appendChild(errSlot);
  return wrap;
}

/**
 * Show a validation message under a field.
 *
 * @param {HTMLElement} input - The input element.
 * @param {string} message - Plain-text message.
 */
export function setFieldError(input, message) {
  const wrap = input.closest('.sb-field');
  input.setAttribute('aria-invalid', 'true');
  const slot = /** @type {HTMLElement|null} */ (wrap ? wrap.querySelector('.field-error') : null);
  if (slot) {
    slot.textContent = message;
    slot.hidden = false;
    input.setAttribute('aria-describedby', slot.id);
  }
}

/**
 * Clear a field's validation message.
 *
 * @param {HTMLElement} input - The input element.
 */
export function clearFieldError(input) {
  const wrap = input.closest('.sb-field');
  input.removeAttribute('aria-invalid');
  const slot = /** @type {HTMLElement|null} */ (wrap ? wrap.querySelector('.field-error') : null);
  if (slot) {
    slot.textContent = '';
    slot.hidden = true;
  }
  input.removeAttribute('aria-describedby');
}
