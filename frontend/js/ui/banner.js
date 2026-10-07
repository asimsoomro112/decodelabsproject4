/**
 * Cold-start banner: when a request takes longer than 2.5 s, show a
 * non-blocking notice that free hosting can take ~50 s to wake up, with a
 * live elapsed timer. Hidden as soon as no requests are pending.
 *
 * @module ui/banner
 */

import { on } from '../core/events.js';
import { h, qs } from '../core/dom.js';

const SHOW_AFTER_MS = 2500;

/**
 * Initialize the cold-start banner. Idempotent.
 * @returns {void}
 */
export function initColdStartBanner() {
  if (typeof document === 'undefined') return;
  let banner = qs('#banner');
  if (!banner) {
    banner = h('div', { id: 'banner', class: 'banner', hidden: '' });
    document.body.appendChild(banner);
  }
  const el = /** @type {HTMLElement} */ (banner);
  const text = h('span', { class: 'banner__text' });
  const elapsed = h('span', { class: 'banner__elapsed mono' });
  el.append(text, elapsed);

  let pending = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let showTimer = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let elapsedTimer = null;
  let startedAt = 0;

  /** Refresh the elapsed counter. */
  function tick() {
    const s = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    elapsed.textContent = `${s}s`;
  }

  /** Show the banner. */
  function show() {
    text.textContent = 'Waking the server… free hosting can take up to ~50 s on first request. ';
    tick();
    el.hidden = false;
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = setInterval(tick, 1000);
  }

  /** Hide the banner and clear timers. */
  function hide() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    el.hidden = true;
  }

  on('request:start', () => {
    pending += 1;
    if (!showTimer && pending > 0) {
      startedAt = Date.now();
      showTimer = setTimeout(show, SHOW_AFTER_MS);
    }
  });

  /** A request settled — hide when nothing is pending. */
  function settle() {
    pending = Math.max(0, pending - 1);
    if (pending === 0) hide();
  }
  on('request:end', settle);
  on('request:error', settle);
}
