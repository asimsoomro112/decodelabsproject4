/**
 * Hash-based router. Routes lazy-load their view module
 * (`module.mount(appEl)` → optional cleanup), wrapped in a view transition
 * unless the user prefers reduced motion.
 *
 * @module router
 */

import { clear, h, qs } from './core/dom.js';
import { emit } from './core/events.js';
import { reportError } from './api/errors.js';

/**
 * @typedef {Object} Route
 * @property {string} path Hash path, e.g. '#/bridge'.
 * @property {string} label Nav label.
 * @property {string} icon Inline SVG markup (static).
 * @property {string} title Document title segment.
 * @property {() => Promise<{ mount: (el: HTMLElement) => (unknown|Promise<unknown>) }>} load
 *   Lazy view-module loader. mount may be sync or async and may return a
 *   cleanup function (or a promise of one).
 */

const DEFAULT_PATH = '#/bridge';

/**
 * Whether the user prefers reduced motion.
 * @returns {boolean} True when reduced motion is preferred.
 */
function prefersReducedMotion() {
  try {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/**
 * Initialize the router.
 * @param {Route[]} routes Route table.
 * @returns {void}
 */
export function initRouter(routes) {
  /** @type {(() => void)|null} */
  let currentCleanup = null;
  let navToken = 0;

  /** Render the 404 view. @param {string} path */
  function renderNotFound(path) {
    const app = qs('#app');
    if (!app) return;
    if (currentCleanup) {
      try {
        currentCleanup();
      } catch {
        /* cleanup errors are non-fatal */
      }
      currentCleanup = null;
    }
    clear(app);
    document.title = 'Not found · SynapseBridge';
    const card = h('div', { class: 'card not-found' });
    card.append(
      h('h1', {}, 'Not found'),
      h('p', { class: 'muted' }, `There's nothing at "${path}".`),
      h('a', { class: 'btn btn--primary', href: '#/bridge' }, 'Back to Bridge'),
    );
    app.append(card);
    window.scrollTo(0, 0);
    emit('route:change', { path: '#/404', label: 'Not found' });
  }

  /** Render a load-failure view with retry. @param {Route} route */
  function renderLoadError(route) {
    const app = qs('#app');
    if (!app) return;
    clear(app);
    document.title = `${route.title} · SynapseBridge`;
    const card = h('div', { class: 'card not-found' });
    const retryBtn = h('button', { class: 'btn btn--primary', type: 'button' }, 'Retry');
    retryBtn.addEventListener('click', () => {
      void navigate();
    });
    card.append(
      h('h1', {}, 'Could not load this view'),
      h('p', { class: 'muted' }, 'The view module failed to load. Check your connection and try again.'),
      retryBtn,
    );
    app.append(card);
    window.scrollTo(0, 0);
  }

  /**
   * Render a route: clear #app, load the module, mount it.
   * @param {Route} route Route to render.
   * @param {number} token Navigation token (stale navigations are ignored).
   */
  async function render(route, token) {
    const app = qs('#app');
    if (!app) return;
    const appEl = /** @type {HTMLElement} */ (app);
    if (currentCleanup) {
      try {
        currentCleanup();
      } catch {
        /* cleanup errors are non-fatal */
      }
      currentCleanup = null;
    }
    clear(appEl);
    document.title = `${route.title} · SynapseBridge`;

    /**
     * Mount the loaded module into #app (supports sync or async mount).
     * @param {{ mount: (el: HTMLElement) => (unknown|Promise<unknown>) }} mod
     */
    async function doMount(mod) {
      const maybeCleanup = await mod.mount(appEl);
      if (token !== navToken) {
        // Superseded while mounting: clean up immediately, don't publish.
        if (typeof maybeCleanup === 'function') {
          try {
            /** @type {() => void} */ (maybeCleanup)();
          } catch {
            /* cleanup errors are non-fatal */
          }
        }
        return;
      }
      if (typeof maybeCleanup === 'function') {
        currentCleanup = /** @type {() => void} */ (maybeCleanup);
      }
      window.scrollTo(0, 0);
      emit('route:change', { path: route.path, label: route.label });
    }

    try {
      const mod = await route.load();
      if (token !== navToken) return; // superseded
      const doc = /** @type {any} */ (document);
      if (typeof doc.startViewTransition === 'function' && !prefersReducedMotion()) {
        const transition = doc.startViewTransition(() => doMount(mod));
        if (transition) {
          if (transition.ready) transition.ready.catch(() => {});
          if (transition.updateCallbackDone) transition.updateCallbackDone.catch(() => {});
          if (transition.finished) {
            try {
              await transition.finished;
            } catch {
              /* transition skipped (e.g. superseded) — non-fatal */
            }
          }
        }
      } else {
        await doMount(mod);
      }
    } catch (err) {
      if (token !== navToken) return;
      reportError(err);
      renderLoadError(route);
    }
  }

  /** Route the current hash. */
  async function navigate() {
    const token = (navToken += 1);
    let hash = window.location.hash;
    if (!hash || hash === '#') {
      window.history.replaceState(null, '', DEFAULT_PATH);
      hash = DEFAULT_PATH;
    }
    const route = routes.find((r) => r.path === hash);
    if (!route) {
      renderNotFound(hash);
      return;
    }
    await render(route, token);
  }

  window.addEventListener('hashchange', () => {
    void navigate();
  });
  void navigate();
}
