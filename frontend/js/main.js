/**
 * SynapseBridge frontend entry point. Initialization order:
 * theme → nav → router → connection chip → background → cold-start banner
 * → tracer → global error handlers.
 *
 * @module main
 */

import { initTheme, initNav } from './ui/nav.js';
import { initRouter } from './router.js';
import { initConnection } from './ui/connection.js';
import { initBackground } from './bg/bridge-canvas.js';
import { initColdStartBanner } from './ui/banner.js';
import { initTracer } from './trace/tracer.js';
import { reportError } from './api/errors.js';
import { error as toastError } from './ui/toast.js';
import { announce } from './core/a11y.js';
import { qs } from './core/dom.js';

/** Inline SVG icons (static, trusted). */
const ICONS = {
  bridge:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 17c3-6 13-6 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  interns:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 14.7c2.3.2 4 1.6 4.5 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  lab:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 3h6M10 3v5.5L4.8 17a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 8.5V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 14h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  trace:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12h4l2.5-6 4 12 2.5-6h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  docs:
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3H6.5A1.5 1.5 0 0 1 5 19.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

const ROUTES = [
  {
    path: '#/bridge',
    label: 'Bridge',
    icon: ICONS.bridge,
    title: 'Bridge',
    load: () => import('./views/bridge.js'),
  },
  {
    path: '#/interns',
    label: 'Interns',
    icon: ICONS.interns,
    title: 'Interns',
    load: () => import('./views/interns.js'),
  },
  {
    path: '#/lab',
    label: 'Lab',
    icon: ICONS.lab,
    title: 'Lab',
    load: () => import('./views/lab.js'),
  },
  {
    path: '#/trace',
    label: 'Trace',
    icon: ICONS.trace,
    title: 'Trace',
    load: () => import('./views/trace.js'),
  },
  {
    path: '#/docs',
    label: 'Docs',
    icon: ICONS.docs,
    title: 'Docs',
    load: () => import('./views/docs.js'),
  },
];

/** Wire the footer background on/off toggle (persisted). */
function initBgToggle() {
  const btn = qs('#bg-toggle');
  if (!btn) return;
  const KEY = 'synapsebridge.bg';
  /** @returns {boolean} */
  function isOff() {
    try {
      return localStorage.getItem(KEY) === 'off';
    } catch {
      return false;
    }
  }
  /** @param {boolean} off */
  function apply(off) {
    document.body.dataset.bg = off ? 'off' : '';
    btn.setAttribute('aria-pressed', off ? 'false' : 'true');
    btn.textContent = off ? 'Background: off' : 'Background: on';
    announce(off ? 'Background animation off.' : 'Background animation on.');
  }
  apply(isOff());
  btn.addEventListener('click', () => {
    const off = document.body.dataset.bg !== 'off';
    try {
      localStorage.setItem(KEY, off ? 'off' : 'on');
    } catch {
      /* storage unavailable */
    }
    apply(off);
  });
}

/** Global error handlers: report + friendly toast. */
function initGlobalErrors() {
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message ?? 'Unknown error');
    toastError('Something went wrong. Please try again.');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason ?? 'Unhandled rejection');
    toastError('Something went wrong. Please try again.');
  });
}

// --- init order ---
initTheme();
initNav(ROUTES);
initRouter(ROUTES);
initConnection(/** @type {HTMLElement|null} */ (qs('#connection-chip')));
initBackground();
initColdStartBanner();
initTracer();
initBgToggle();
initGlobalErrors();
