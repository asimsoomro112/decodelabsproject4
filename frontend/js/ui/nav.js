/**
 * App navigation: theme management, the liquid-glass pill navbar (fixed top
 * center on desktop, bottom tab bar on mobile via CSS), connection chip slot,
 * role switcher, and theme toggle. One markup — CSS decides the layout.
 *
 * @module ui/nav
 */

import { h, qs, qsa } from '../core/dom.js';
import { getRole, setRole, onRoleChange } from '../api/auth.js';
import { announce } from '../core/a11y.js';

const THEME_KEY = 'synapsebridge.theme';

/**
 * @typedef {Object} NavRoute
 * @property {string} path Hash path, e.g. '#/bridge'.
 * @property {string} label Display label.
 * @property {string} icon Inline SVG markup (static, trusted).
 */

/**
 * Read the stored theme preference.
 * @returns {'system'|'light'|'dark'} Stored preference or 'system'.
 */
export function themeSetting() {
  try {
    if (typeof localStorage === 'undefined') return 'system';
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    /* storage unavailable */
    return 'system';
  }
}

/**
 * Resolve a theme setting to a concrete 'light'|'dark'.
 * @param {'system'|'light'|'dark'} setting Theme setting.
 * @returns {'light'|'dark'} Resolved theme.
 */
export function resolveTheme(setting) {
  if (setting !== 'system') return setting;
  try {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {
    /* matchMedia unavailable */
  }
  return 'dark';
}

/**
 * Apply the current theme to <html data-theme>.
 * @returns {'light'|'dark'} The resolved theme.
 */
export function applyTheme() {
  const resolved = resolveTheme(themeSetting());
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

/**
 * Initialize theme handling: apply now and follow OS changes while 'system'.
 * @returns {void}
 */
export function initTheme() {
  applyTheme();
  try {
    if (typeof matchMedia !== 'undefined') {
      matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (themeSetting() === 'system') applyTheme();
      });
    }
  } catch {
    /* matchMedia unavailable */
  }
}

/** Brand mark (static SVG, trusted). @returns {string} SVG markup. */
function brandSvg() {
  return (
    '<svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">' +
    '<rect width="64" height="64" rx="14" fill="none"/>' +
    '<path d="M14 32 C 24 20, 40 20, 50 32" fill="none" stroke="#A0D4E0" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M14 32 C 24 44, 40 44, 50 32" fill="none" stroke="#A5856F" stroke-width="4" stroke-linecap="round" opacity="0.8"/>' +
    '<circle cx="14" cy="32" r="6" fill="#14100d" stroke="#A0D4E0" stroke-width="3"/>' +
    '<circle cx="50" cy="32" r="6" fill="#14100d" stroke="#A5856F" stroke-width="3"/>' +
    '</svg>'
  );
}

/** Theme toggle icon per setting. @param {'system'|'light'|'dark'} s @returns {string} */
function themeIcon(s) {
  if (s === 'light') {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  if (s === 'dark') {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 20h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}

/**
 * Build the app navbar into header#site-header.
 * @param {NavRoute[]} routes The 5 app routes.
 * @returns {void}
 */
export function initNav(routes) {
  const header = qs('#site-header');
  if (!header) return;

  const nav = h('nav', { class: 'nav glass', 'aria-label': 'Primary' });

  const brand = h('a', { class: 'brand', href: '#/bridge' });
  // Static trusted markup for the brand mark.
  brand.innerHTML = `${brandSvg()}<span class="brand__word">SynapseBridge</span>`;

  const linksList = h('ul', { class: 'nav__links' });
  for (const route of routes) {
    const link = h('a', { class: 'nav__link', href: route.path });
    // Route icons are static trusted SVG strings from the route table.
    link.innerHTML = `<span class="nav__icon" aria-hidden="true">${route.icon}</span><span class="nav__label"></span>`;
    const labelEl = link.querySelector('.nav__label');
    if (labelEl) labelEl.textContent = route.label;
    link.setAttribute('aria-label', route.label);
    linksList.append(h('li', {}, link));
  }

  const cluster = h('div', { class: 'nav__cluster' });
  const chip = h('span', {
    id: 'connection-chip',
    class: 'chip chip--connection',
    role: 'status',
    'aria-label': 'Connection status',
  });
  chip.textContent = 'Connecting…';

  const segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Role' });
  /** @type {['guest'|'editor'|'admin', string][]} */
  const roleDefs = [
    ['guest', 'Guest'],
    ['editor', 'Editor'],
    ['admin', 'Admin'],
  ];
  const roleButtons = new Map();
  for (const [value, label] of roleDefs) {
    const btn = h('button', {
      type: 'button',
      class: 'segmented__btn',
      'aria-pressed': value === getRole() ? 'true' : 'false',
    }, label);
    btn.addEventListener('click', () => {
      setRole(value);
      announce(`Role set to ${label}. ${value === 'guest' ? 'Read-only mode.' : 'Demo token active.'}`);
    });
    roleButtons.set(value, btn);
    segmented.append(btn);
  }
  onRoleChange((role) => {
    for (const [value, btn] of roleButtons) {
      btn.setAttribute('aria-pressed', value === role ? 'true' : 'false');
    }
  });

  const themeBtn = h('button', {
    type: 'button',
    class: 'icon-btn',
    id: 'theme-toggle',
    'aria-label': `Theme: ${themeSetting()}`,
    title: 'Toggle theme (system / light / dark)',
  });
  /** Refresh the theme button visuals. */
  function syncThemeBtn() {
    const s = themeSetting();
    themeBtn.innerHTML = themeIcon(s);
    themeBtn.setAttribute('aria-label', `Theme: ${s}`);
    const label = h('span', { class: 'sr-only' });
    label.textContent = s;
    themeBtn.append(label);
  }
  syncThemeBtn();
  themeBtn.addEventListener('click', () => {
    const order = /** @type {const} */ (['system', 'light', 'dark']);
    const next = order[(order.indexOf(themeSetting()) + 1) % order.length];
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable */
    }
    applyTheme();
    syncThemeBtn();
    announce(`Theme: ${next}`);
  });

  cluster.append(chip, segmented, themeBtn);
  nav.append(brand, linksList, cluster);

  // Sentinel for the condense-on-scroll effect.
  const sentinel = h('div', { class: 'nav-sentinel', 'aria-hidden': 'true' });
  header.append(sentinel, nav);

  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          nav.classList.toggle('nav--condensed', !entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );
    io.observe(sentinel);
  }

  /** Highlight the active route link. */
  function syncActive() {
    const hash = window.location.hash || '#/bridge';
    for (const link of qsa('.nav__link', nav)) {
      if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
  window.addEventListener('hashchange', syncActive);
  syncActive();

  // Specular highlight follows the pointer on glass surfaces.
  document.addEventListener('pointermove', (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    const glass =
      target && typeof target.closest === 'function'
        ? /** @type {HTMLElement|null} */ (target.closest('.glass'))
        : null;
    if (!glass) return;
    const rect = glass.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    glass.style.setProperty('--mx', `${mx.toFixed(1)}%`);
    glass.style.setProperty('--my', `${my.toFixed(1)}%`);
  });
}
