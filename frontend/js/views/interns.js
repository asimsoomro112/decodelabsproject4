/**
 * Interns view (#/interns) — the full REST demo.
 *
 * Search (debounced + abortable + sequence-guarded), filters, sorting,
 * server pagination synced to the location.hash query string, plus
 * POST / PUT / PATCH / DELETE with dialogs, optimistic UI, undoable
 * deletes and real 401/403 surfacing for guest/editor roles.
 *
 * Endpoint call shapes used (see report — core contract gap):
 *   listInterns(query, opts) · getIntern(id, opts) · createIntern(body, opts)
 *   replaceIntern(id, body, opts) · patchIntern(id, patch, opts)
 *   deleteIntern(id, opts) · listTracks({}, opts)
 * Idempotency-Key on POST is attached automatically by the API client.
 *
 * @module views/interns
 */

import {
  listInterns, createIntern, replaceIntern, patchIntern, deleteIntern, listTracks,
} from '../api/endpoints.js';
import { getRole, setRole, onRoleChange } from '../api/auth.js';
import { isApiError } from '../api/errors.js';
import { h, qsButton, clear, renderList } from '../core/dom.js';
import { timeAgo } from '../core/format.js';
import { announce } from '../core/a11y.js';
import { complete as traceComplete } from '../trace/tracer.js';
import { toast } from '../ui/toast.js';
import { openDialog, confirmDialog } from '../ui/dialog.js';
import {
  ensureBaseStyles, injectCss, card, chip,
  loadingInto, emptyState, errorState, formField, setFieldError, clearFieldError,
} from './components.js';

const STYLE_ID = 'sb-view-interns';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Assumed openDialog contract: openDialog({title, body, submitLabel, onSubmit}) — return false from onSubmit to keep open. @see report */
async function dialogForm({ title, submitLabel, form, onSubmit }) {
  return openDialog({ title, body: form, submitLabel, onSubmit });
}

/** Assumed confirmDialog contract: confirmDialog({title, message, confirmLabel, danger}) -> Promise<boolean>. @see report */
async function askConfirm(opts) {
  return confirmDialog(opts);
}

function styles() {
  injectCss(STYLE_ID, `
    .sb-filters { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto; gap: 12px; margin: 20px 0; align-items: end; }
    @media (max-width: 900px) { .sb-filters { grid-template-columns: 1fr 1fr; } }
    .sb-intern-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .intern-card { display: flex; flex-direction: column; gap: 10px; position: relative; }
    .intern-top { display: flex; gap: 12px; align-items: center; }
    .avatar { width: 48px; height: 48px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: #0b0e17; background: linear-gradient(135deg, #8b7bff, #4fd1c5); }
    .intern-name { margin: 0; font-size: 16px; }
    .intern-email { color: var(--sb-muted); font-size: 13px; word-break: break-all; }
    .intern-meta { display: flex; gap: 8px; flex-wrap: wrap; }
    .intern-phone { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .icon-btn { min-width: 44px; min-height: 44px; border-radius: 10px; border: 1px solid var(--sb-border); background: rgba(255,255,255,.06); color: var(--sb-text); cursor: pointer; font-size: 16px; display: inline-flex; align-items: center; justify-content: center; }
    .intern-foot { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 6px; }
    .menu-wrap { position: relative; }
    .menu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 170px; background: var(--surface); border: 1px solid var(--sb-border); border-radius: 12px; padding: 6px; z-index: 30; box-shadow: 0 16px 40px rgba(0,0,0,.15); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
    .menu button { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--sb-text); padding: 12px; border-radius: 8px; font-size: 14px; cursor: pointer; min-height: 44px; }
    .menu button:hover { background: var(--line); }
    .menu button.danger { color: #fecdd3; }
    .sb-pager { display: flex; gap: 8px; align-items: center; justify-content: center; margin: 28px 0 8px; flex-wrap: wrap; }
    .sb-page-btn { min-width: 44px; min-height: 44px; border-radius: 10px; border: 1px solid var(--sb-border); background: rgba(255,255,255,.05); color: var(--sb-text); cursor: pointer; font-size: 14px; font-weight: 600; }
    .sb-page-btn[aria-current="page"] { background: linear-gradient(135deg, #7c6cf5, #4fd1c5); color: #0b0e17; border: none; }
    .sb-page-btn:disabled { opacity: 0.4; cursor: default; }
    .sb-rolebar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 16px 0; font-size: 14px; }
    .sb-inline-note { background: rgba(251,191,36,.1); border: 1px solid rgba(251,191,36,.45); color: #fde68a; border-radius: 12px; padding: 12px 16px; margin: 16px 0; font-size: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .intern-card.enter { animation: sb-card-in .45s ease; }
    @keyframes sb-card-in { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
    .intern-card.leaving { opacity: 0; transform: translateX(24px); transition: all .3s ease; }
    @media (prefers-reduced-motion: reduce) { .intern-card.enter { animation: none; } }
  `);
}

/**
 * Mount the Interns view.
 *
 * @param {HTMLElement} root - The <main> element (already cleared).
 * @returns {Promise<(() => void)|undefined>} Cleanup: aborts in-flight requests, timers, listeners.
 */
export async function mount(root) {
  ensureBaseStyles();
  styles();

  const state = {
    search: '', track: '', status: '', sort: 'createdAt', order: 'desc',
    page: 1, pageSize: 12, seq: 0, total: 0, totalPages: 1, items: [], tracks: [],
  };
  let aborter = null;
  let searchTimer = null;
  let lastNoteTimer = null;

  const view = h('div', { class: 'sb-view' });
  const hero = h('div', { class: 'sb-hero' });
  hero.appendChild(h('h1', {}, 'Interns'));
  hero.appendChild(h('p', {}, 'The full REST lifecycle against the live API — every write goes through the real client, errors included. Nothing is hidden from you.'));
  view.appendChild(hero);

  // Role bar
  const rolebar = h('div', { class: 'sb-rolebar', role: 'status' });
  const roleLabel = h('span', { class: 'sb-muted' }, 'Acting as:');
  const roleChipEl = chip(getRole(), getRole() === 'admin' ? 'emerald' : getRole() === 'editor' ? 'amber' : 'ghost');
  const roleSelect = h('select', { class: 'sb-select', 'aria-label': 'Switch role', style: 'width:auto;' });
  for (const r of ['guest', 'editor', 'admin']) {
    const opt = h('option', { value: r }, r[0].toUpperCase() + r.slice(1));
    if (r === getRole()) opt.selected = true;
    roleSelect.appendChild(opt);
  }
  roleSelect.addEventListener('change', () => {
    setRole(/** @type {'guest'|'editor'|'admin'} */ (roleSelect.value));
    toast.info(`Role switched to ${roleSelect.value}`);
  });
  rolebar.appendChild(roleLabel);
  rolebar.appendChild(roleChipEl);
  rolebar.appendChild(roleSelect);
  rolebar.appendChild(h('span', { class: 'sb-muted', style: 'font-size:13px;' }, 'Writes need editor/admin — as guest the real 401/403 is shown, buttons stay visible.'));
  view.appendChild(rolebar);

  const noteSlot = h('div', {});
  view.appendChild(noteSlot);

  // Filters
  const filters = h('div', { class: 'sb-filters' });
  const searchWrap = h('div', {});
  searchWrap.appendChild(h('label', { class: 'sb-label', for: 'sb-search' }, 'Search'));
  const searchInput = h('input', { class: 'sb-input', id: 'sb-search', type: 'search', placeholder: 'Name or email…', autocomplete: 'off' });
  searchWrap.appendChild(searchInput);
  filters.appendChild(searchWrap);

  const mkSelect = (id, label, options) => {
    const wrap = h('div', {});
    wrap.appendChild(h('label', { class: 'sb-label', for: id }, label));
    const sel = h('select', { class: 'sb-select', id });
    for (const [v, t] of options) {
      sel.appendChild(h('option', { value: v }, t));
    }
    wrap.appendChild(sel);
    filters.appendChild(wrap);
    return sel;
  };
  const trackSelect = mkSelect('sb-track', 'Track', [['', 'All tracks']]);
  const statusSelect = mkSelect('sb-status', 'Status', [['', 'All'], ['active', 'Active'], ['completed', 'Completed']]);
  const sortSelect = mkSelect('sb-sort', 'Sort by', [['createdAt', 'Created'], ['name', 'Name'], ['email', 'Email']]);
  const orderSelect = mkSelect('sb-order', 'Order', [['desc', 'Desc'], ['asc', 'Asc']]);
  const pageSizeSelect = mkSelect('sb-pagesize', 'Per page', [['6', '6'], ['12', '12'], ['24', '24']]);
  view.appendChild(filters);

  const headRow = h('div', { class: 'sb-row', style: 'justify-content:space-between;margin:8px 0 16px;' });
  const countLabel = h('p', { class: 'sb-muted', style: 'margin:0;', role: 'status' }, '');
  const registerBtn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, '+ Register intern');
  headRow.appendChild(countLabel);
  headRow.appendChild(registerBtn);
  view.appendChild(headRow);

  const list = h('div', { class: 'sb-intern-grid', 'aria-live': 'polite' });
  view.appendChild(list);
  const pager = h('nav', { class: 'sb-pager', 'aria-label': 'Pagination' });
  view.appendChild(pager);
  root.appendChild(view);

  // ---- Hash sync ----
  function readHash() {
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    for (const key of ['search', 'track', 'status', 'sort', 'order']) {
      const v = params.get(key);
      if (v != null) state[key] = v;
    }
    const page = parseInt(params.get('page') || '', 10);
    if (Number.isFinite(page) && page > 0) state.page = page;
    const ps = parseInt(params.get('pageSize') || '', 10);
    if ([6, 12, 24].includes(ps)) state.pageSize = ps;
  }

  function writeHash() {
    const params = new URLSearchParams();
    for (const key of ['search', 'track', 'status', 'sort', 'order', 'page', 'pageSize']) {
      params.set(key, String(state[key]));
    }
    history.replaceState(null, '', `#/interns?${params.toString()}`);
  }

  function syncControls() {
    searchInput.value = state.search;
    trackSelect.value = state.track;
    statusSelect.value = state.status;
    sortSelect.value = state.sort;
    orderSelect.value = state.order;
    pageSizeSelect.value = String(state.pageSize);
  }

  /** Inline note under the role bar (e.g. last 401/403). */
  function showNote(message, withSwitch) {
    clear(noteSlot);
    const note = h('div', { class: 'sb-inline-note', role: 'status' });
    note.appendChild(h('span', {}, message));
    if (withSwitch) {
      const btn = h('button', { class: 'sb-btn sb-btn-sm', type: 'button' }, 'Switch to Admin');
      btn.addEventListener('click', () => { setRole('admin'); roleSelect.value = 'admin'; });
      note.appendChild(btn);
    }
    noteSlot.appendChild(note);
    clearTimeout(lastNoteTimer);
    lastNoteTimer = setTimeout(() => clear(noteSlot), 12000);
  }

  /** Toast for 401/403 with a "Switch to Admin" action. */
  function authToast(message) {
    showNote(message, true);
    toast.error(message, { action: { label: 'Switch to Admin', onClick: () => { setRole('admin'); roleSelect.value = 'admin'; } }, durationMs: 8000 });
    announce(message);
  }

  // ---- Data ----
  function parseList(data) {
    const d = data || {};
    const items = d.items ?? d.data ?? d.interns ?? (Array.isArray(d) ? d : []);
    const pag = d.pagination ?? d.meta ?? {};
    const total = pag.total ?? d.total ?? (Array.isArray(items) ? items.length : 0);
    const totalPages = pag.totalPages ?? Math.max(1, Math.ceil(total / state.pageSize));
    return { items: Array.isArray(items) ? items : [], total, totalPages };
  }

  async function loadTracks() {
    try {
      const res = await listTracks({}, { traceLabel: 'Interns tracks load' });
      const d = res.data;
      const arr = Array.isArray(d) ? d : (d.tracks ?? d.data ?? []);
      state.tracks = Array.isArray(arr) ? arr : [];
      // Rebuild track options, preserving selection.
      const current = trackSelect.value;
      clear(trackSelect);
      trackSelect.appendChild(h('option', { value: '' }, 'All tracks'));
      for (const t of state.tracks) {
        const val = String(t.id ?? t.name ?? t);
        const opt = h('option', { value: val }, String(t.name ?? t.label ?? val));
        trackSelect.appendChild(opt);
      }
      trackSelect.value = current;
      traceComplete(res.traceId, { renderMs: 0 });
    } catch (err) {
      if (!(err && (err.name === 'AbortError' || err.kind === 'abort'))) {
        // Non-fatal: filter just stays "All tracks".
      }
    }
  }

  function renderPager() {
    clear(pager);
    const { page, totalPages } = state;
    if (totalPages <= 1) return;
    const btn = (label, target, opts = {}) => {
      const b = h('button', { class: 'sb-page-btn', type: 'button' }, label);
      if (opts.current) b.setAttribute('aria-current', 'page');
      if (opts.disabled) b.disabled = true;
      if (opts.aria) b.setAttribute('aria-label', opts.aria);
      b.addEventListener('click', () => { state.page = target; writeHash(); load(); });
      pager.appendChild(b);
      return b;
    };
    btn('‹', Math.max(1, page - 1), { disabled: page <= 1, aria: 'Previous page' });
    const win = 2;
    const start = Math.max(1, page - win);
    const end = Math.min(totalPages, page + win);
    for (let p = start; p <= end; p++) {
      btn(String(p), p, { current: p === page, aria: `Page ${p}` });
    }
    btn('›', Math.min(totalPages, page + 1), { disabled: page >= totalPages, aria: 'Next page' });
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  }

  /** Render one intern card. All API data via textContent. */
  function renderItem(intern) {
    const c = card();
    c.classList.add('intern-card');
    c.dataset.id = String(intern.id ?? '');

    const top = h('div', { class: 'intern-top' });
    const av = h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(intern.name).toUpperCase());
    const nameWrap = h('div', {});
    nameWrap.appendChild(h('h3', { class: 'intern-name' }, String(intern.name ?? 'Unnamed')));
    nameWrap.appendChild(h('div', { class: 'intern-email' }, String(intern.email ?? '')));
    top.appendChild(av);
    top.appendChild(nameWrap);
    c.appendChild(top);

    const meta = h('div', { class: 'intern-meta' });
    if (intern.track) meta.appendChild(chip(String(intern.track), 'violet'));
    if (intern.status) meta.appendChild(chip(String(intern.status), intern.status === 'active' ? 'emerald' : 'neutral'));
    c.appendChild(meta);

    // Phone with inline edit
    const phoneRow = h('div', { class: 'intern-phone' });
    const phoneText = h('span', {}, String(intern.phone ?? '—'));
    const editBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit phone for ${intern.name}` }, '✎');
    phoneRow.appendChild(phoneText);
    phoneRow.appendChild(editBtn);
    c.appendChild(phoneRow);

    editBtn.addEventListener('click', () => startPhoneEdit(intern, phoneRow, phoneText));

    const foot = h('div', { class: 'intern-foot' });
    const updated = intern.updatedAt || intern.createdAt;
    foot.appendChild(h('span', { class: 'sb-muted', style: 'font-size:12.5px;' },
      updated ? `updated ${timeAgo(updated)}` : ''));
    // Actions menu
    const menuWrap = h('div', { class: 'menu-wrap' });
    const menuBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': `Actions for ${intern.name}` }, '⋯');
    const menu = h('div', { class: 'menu', role: 'menu', hidden: 'true' });
    const replaceItem = h('button', { type: 'button', role: 'menuitem' }, 'Replace (PUT)');
    const deleteItem = h('button', { type: 'button', role: 'menuitem', class: 'danger' }, 'Delete');
    menu.appendChild(replaceItem);
    menu.appendChild(deleteItem);
    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(menu);
    foot.appendChild(menuWrap);
    c.appendChild(foot);

    const closeMenu = () => { 
      menu.hidden = true; 
      menuBtn.setAttribute('aria-expanded', 'false');
      c.style.zIndex = '';
    };
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      closeMenu();
      if (open) {
        c.style.zIndex = '99';
        menu.hidden = false;
        menuBtn.setAttribute('aria-expanded', 'true');
        replaceItem.focus();
      }
    });
    document.addEventListener('click', closeMenu, { once: true });
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); menuBtn.focus(); } });
    replaceItem.addEventListener('click', () => { closeMenu(); openReplaceDialog(intern); });
    deleteItem.addEventListener('click', () => { closeMenu(); deleteFlow(intern, c); });

    return c;
  }

  function renderItems(items, { animateNewId = null } = {}) {
    const render = () => {
      renderList(list, items, (item) => {
        const el = renderItem(item);
        if (animateNewId != null && String(item.id) === String(animateNewId)) {
          el.classList.add('enter');
          el.setAttribute('tabindex', '-1');
          setTimeout(() => el.focus({ preventScroll: false }), 60);
        }
        return el;
      });
    };
    if (document.startViewTransition) {
      const transition = document.startViewTransition(() => render());
      if (transition) {
        if (transition.finished) transition.finished.catch(() => {});
        if (transition.ready) transition.ready.catch(() => {});
        if (transition.updateCallbackDone) transition.updateCallbackDone.catch(() => {});
      }
    } else {
      render();
    }
  }

  async function load() {
    const mySeq = ++state.seq;
    if (aborter) aborter.abort();
    aborter = new AbortController();
    loadingInto(list, { rows: Math.min(state.pageSize, 6), cards: true });
    clear(pager);
    countLabel.textContent = 'Loading…';
    const r0 = performance.now();
    try {
      const res = await listInterns(
        {
          search: state.search || undefined,
          track: state.track || undefined,
          status: state.status || undefined,
          sort: state.sort,
          order: state.order,
          page: state.page,
          pageSize: state.pageSize,
        },
        { signal: aborter.signal, traceLabel: 'Interns list load' },
      );
      if (mySeq !== state.seq) return; // stale response guard
      const { items, total, totalPages } = parseList(res.data);
      state.items = items;
      state.total = total;
      state.totalPages = totalPages;
      if (items.length === 0) {
        clear(list);
        list.appendChild(emptyState({
          title: 'No interns match',
          body: 'Try clearing the search or filters — or register the first intern.',
          actionLabel: 'Clear filters',
          onAction: () => {
            state.search = ''; state.track = ''; state.status = ''; state.page = 1;
            syncControls(); writeHash(); load();
          },
        }));
      } else {
        renderItems(items);
      }
      countLabel.textContent = `${total} intern${total === 1 ? '' : 's'} · page ${state.page} of ${totalPages}`;
      renderPager();
      traceComplete(res.traceId, { renderMs: performance.now() - r0 });
      announce(`Interns loaded: ${total} result${total === 1 ? '' : 's'}.`);
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.kind === 'abort')) return; // superseded
      if (mySeq !== state.seq) return;
      const msg = isApiError(err) && err.userMessage ? err.userMessage() : (err && err.message) || 'Could not load interns';
      clear(list);
      list.appendChild(errorState({ message: String(msg), onRetry: load }));
      countLabel.textContent = 'Load failed';
      announce(`Failed to load interns: ${msg}`);
    }
  }

  // ---- Filter wiring ----
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      writeHash();
      load();
    }, 250);
  });
  const filterChanged = (key, sel) => {
    sel.addEventListener('change', () => {
      state[key] = sel.value;
      if (key === 'pageSize') state.pageSize = parseInt(sel.value, 10);
      state.page = 1;
      writeHash();
      load();
    });
  };
  filterChanged('track', trackSelect);
  filterChanged('status', statusSelect);
  filterChanged('sort', sortSelect);
  filterChanged('order', orderSelect);
  filterChanged('pageSize', pageSizeSelect);

  // ---- Create ----
  function internForm(existing) {
    const form = h('form', { novalidate: 'true', style: 'display:grid;gap:4px;min-width:min(420px,80vw);' });
    const summary = h('div', { class: 'error-summary', tabindex: '-1', hidden: 'true' });
    form.appendChild(summary);
    const name = h('input', { class: 'sb-input', id: 'f-name', autocomplete: 'name' });
    const email = h('input', { class: 'sb-input', id: 'f-email', type: 'email', autocomplete: 'email' });
    const phone = h('input', { class: 'sb-input', id: 'f-phone', type: 'tel', autocomplete: 'tel' });
    const track = h('select', { class: 'sb-select', id: 'f-track', style: 'width:100%;' });
    track.appendChild(h('option', { value: '' }, 'Select a track…'));
    for (const t of state.tracks) {
      const v = String(t.id ?? t.name ?? t);
      track.appendChild(h('option', { value: v }, String(t.name ?? t.label ?? v)));
    }
    const status = h('select', { class: 'sb-select', id: 'f-status', style: 'width:100%;' });
    for (const s of ['active', 'completed']) status.appendChild(h('option', { value: s }, s[0].toUpperCase() + s.slice(1)));
    if (existing) {
      name.value = existing.name ?? '';
      email.value = existing.email ?? '';
      phone.value = existing.phone ?? '';
      track.value = String(existing.track ?? '');
      status.value = existing.status ?? 'active';
    }
    form.appendChild(formField({ label: 'Full name *', id: 'f-name', input: name }));
    form.appendChild(formField({ label: 'Email *', id: 'f-email', input: email }));
    form.appendChild(formField({ label: 'Phone', id: 'f-phone', input: phone }));
    form.appendChild(formField({ label: 'Track *', id: 'f-track', input: track }));
    form.appendChild(formField({ label: 'Status', id: 'f-status', input: status }));
    return { form, summary, fields: { name, email, phone, track, status } };
  }

  function validateClient(fields) {
    const errors = {};
    if (!fields.name.value.trim()) errors.name = 'Name is required.';
    if (!fields.email.value.trim()) errors.email = 'Email is required.';
    else if (!EMAIL_RE.test(fields.email.value.trim())) errors.email = 'Enter a valid email address.';
    if (!fields.track.value) errors.track = 'Pick a track.';
    return errors;
  }

  function showFormErrors(summary, fields, errors) {
    for (const f of Object.values(fields)) clearFieldError(f);
    clear(summary);
    summary.hidden = true;
    const keys = Object.keys(errors);
    if (!keys.length) return false;
    summary.hidden = false;
    summary.appendChild(h('h4', {}, 'Please fix the following:'));
    const ul = h('ul', {});
    for (const key of keys) {
      const input = fields[key];
      if (input) setFieldError(input, errors[key]);
      const li = h('li', {});
      const jump = h('button', { type: 'button', class: 'sb-btn sb-btn-sm sb-btn-ghost', style: 'color:#fecdd3;' }, `${key}: ${errors[key]}`);
      jump.addEventListener('click', () => input && input.focus());
      li.appendChild(jump);
      ul.appendChild(li);
    }
    summary.appendChild(ul);
    summary.focus();
    return true;
  }

  /** Map a 422 problem payload onto the form. */
  function applyServerErrors(summary, fields, err) {
    const errors = {};
    const list = err.problem?.errors ?? err.errors ?? [];
    for (const e of list) {
      const field = e.field || e.path || 'form';
      errors[field] = e.message || e.detail || 'Invalid value.';
    }
    if (!Object.keys(errors).length) {
      errors.form = (err.problem && err.problem.title) || err.message || 'Validation failed.';
    }
    return showFormErrors(summary, fields, errors);
  }

  registerBtn.addEventListener('click', async () => {
    const { form, summary, fields } = internForm(null);
    let pending = false;
    await dialogForm({
      title: 'Register intern',
      submitLabel: 'Register',
      form,
      onSubmit: async () => {
        if (pending) return false;
        if (showFormErrors(summary, fields, validateClient(fields))) return false;
        pending = true;
        const submitBtn = qsButton('button[type="submit"]', form.closest('[role="dialog"]') || document);
        try {
          const body = {
            name: fields.name.value.trim(),
            email: fields.email.value.trim(),
            phone: fields.phone.value.trim() || undefined,
            track: fields.track.value,
            status: fields.status.value,
          };
          const res = await createIntern(body, { traceLabel: 'Intern create' });
          const created = res.data?.intern ?? res.data?.data ?? res.data ?? {};
          traceComplete(res.traceId, { renderMs: 0 });
          toast.success('Registered', { durationMs: 5000 });
          const location = res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null;
          if (location) toast.info(`Location: ${location}`, { durationMs: 6000 });
          state.page = 1;
          writeHash();
          await load();
          // Animate the new card in.
          if (created && created.id != null) {
            renderItems(state.items, { animateNewId: created.id });
          }
          announce(`Intern ${body.name} registered.`);
        } catch (err) {
          if (isApiError(err) && (err.status === 401 || err.status === 403)) {
            authToast(`Not allowed as ${getRole()}: ${err.userMessage ? err.userMessage() : err.message}`);
            return false;
          }
          if (isApiError(err) && err.status === 422) {
            applyServerErrors(summary, fields, err);
            announce('Validation failed. Review the highlighted fields.');
            return false;
          }
          if (isApiError(err) && err.status === 409) {
            showFormErrors(summary, fields, { email: 'This email is already registered.' });
            announce('Conflict: email already registered.');
            return false;
          }
          const msg = (isApiError(err) && err.userMessage ? err.userMessage() : err.message) || 'Registration failed';
          toast.error(String(msg));
          announce(`Registration failed: ${msg}`);
          return false;
        } finally {
          pending = false;
          if (submitBtn) submitBtn.disabled = false;
        }
        return true;
      },
    });
  });

  // ---- Replace (PUT) ----
  async function openReplaceDialog(intern) {
    const { form, summary, fields } = internForm(intern);
    let pending = false;
    await dialogForm({
      title: `Replace intern — ${intern.name}`,
      submitLabel: 'Replace (PUT)',
      form,
      onSubmit: async () => {
        if (pending) return false;
        if (showFormErrors(summary, fields, validateClient(fields))) return false;
        pending = true;
        try {
          const body = {
            name: fields.name.value.trim(),
            email: fields.email.value.trim(),
            phone: fields.phone.value.trim() || undefined,
            track: fields.track.value,
            status: fields.status.value,
          };
          const res = await replaceIntern(intern.id, body, { traceLabel: 'Intern replace (PUT)' });
          traceComplete(res.traceId, { renderMs: 0 });
          toast.success('Intern replaced');
          announce(`Intern ${body.name} replaced.`);
          await load();
        } catch (err) {
          if (isApiError(err) && (err.status === 401 || err.status === 403)) {
            authToast(`Replace needs editor/admin — you are ${getRole()}. The request was sent and rejected: ${err.status}.`);
            return false;
          }
          if (isApiError(err) && err.status === 422) {
            applyServerErrors(summary, fields, err);
            return false;
          }
          const msg = (isApiError(err) && err.userMessage ? err.userMessage() : err.message) || 'Replace failed';
          toast.error(String(msg));
          announce(`Replace failed: ${msg}`);
          return false;
        } finally {
          pending = false;
        }
        return true;
      },
    });
  }

  // ---- Inline phone PATCH (optimistic) ----
  function startPhoneEdit(intern, phoneRow, phoneText) {
    const original = String(intern.phone ?? '');
    clear(phoneRow);
    const input = h('input', {
      class: 'sb-input', type: 'tel', value: original,
      'aria-label': `Phone for ${intern.name}`, style: 'max-width:170px;min-height:44px;',
    });
    const save = h('button', { class: 'sb-btn sb-btn-sm sb-btn-primary', type: 'button' }, 'Save');
    const cancel = h('button', { class: 'sb-btn sb-btn-sm sb-btn-ghost', type: 'button' }, 'Cancel');
    phoneRow.appendChild(input);
    phoneRow.appendChild(save);
    phoneRow.appendChild(cancel);
    input.focus();
    input.select();

    const restore = () => {
      clear(phoneRow);
      phoneRow.appendChild(phoneText);
      const editBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit phone for ${intern.name}` }, '✎');
      editBtn.addEventListener('click', () => startPhoneEdit(intern, phoneRow, phoneText));
      phoneRow.appendChild(editBtn);
    };

    cancel.addEventListener('click', restore);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') restore();
      if (e.key === 'Enter') save.click();
    });

    save.addEventListener('click', async () => {
      const next = input.value.trim();
      save.disabled = true;
      // Optimistic: update DOM + local state immediately.
      phoneText.textContent = next || '—';
      intern.phone = next;
      restore();
      announce(`Phone updated to ${next || 'empty'} (saving…)`);
      try {
        const res = await patchIntern(intern.id, { phone: next }, { traceLabel: 'Intern phone patch' });
        traceComplete(res.traceId, { renderMs: 0 });
        toast.success('Phone updated');
        announce('Phone saved.');
      } catch (err) {
        // Roll back.
        intern.phone = original;
        phoneText.textContent = original || '—';
        if (isApiError(err) && (err.status === 401 || err.status === 403)) {
          authToast(`Phone update rejected (${err.status}) as ${getRole()}. Change rolled back.`);
          return;
        }
        const msg = (isApiError(err) && err.userMessage ? err.userMessage() : err.message) || 'Phone update failed';
        toast.error(`Rolled back: ${msg}`, {
          durationMs: 9000,
          action: {
            label: 'Retry',
            onClick: () => startPhoneEdit({ ...intern, phone: next }, phoneRow, phoneText),
          },
        });
        announce(`Phone update failed and was rolled back: ${msg}`);
      }
    });
  }

  // ---- Delete (optimistic + undo) ----
  async function deleteFlow(intern, cardEl) {
    const ok = await askConfirm({
      title: 'Delete intern?',
      message: `${intern.name} (${intern.email}) will be removed. You have 5 seconds to undo.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const savedData = {
      name: intern.name, email: intern.email, phone: intern.phone,
      track: intern.track, status: intern.status,
    };
    // Optimistic removal.
    cardEl.classList.add('leaving');
    const removeTimer = setTimeout(() => cardEl.remove(), 320);
    announce(`Intern ${intern.name} removed. Undo available for 5 seconds.`);

    let undone = false;
    let fired = false;
    const fireDelete = async () => {
      if (fired || undone) return;
      fired = true;
      try {
        const res = await deleteIntern(intern.id, { traceLabel: 'Intern delete' });
        traceComplete(res.traceId, { renderMs: 0 });
        if (res.data && res.data.alreadyGone) toast.info('Already gone on the server (404 treated as success).');
        await load();
      } catch (err) {
        if (isApiError(err) && (err.status === 401 || err.status === 403)) {
          authToast(`Delete rejected (${err.status}) as ${getRole()} — list reloaded.`);
        } else {
          const msg = (isApiError(err) && err.userMessage ? err.userMessage() : err.message) || 'Delete failed';
          toast.error(String(msg));
          announce(`Delete failed: ${msg}`);
        }
        await load(); // restore the card
      }
    };

    const undoTimer = setTimeout(fireDelete, 5000);
    toast.info(`Deleted ${intern.name}`, {
      durationMs: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          undone = true;
          clearTimeout(undoTimer);
          clearTimeout(removeTimer);
          try {
            const res = await createIntern(savedData, { traceLabel: 'Intern delete undo (re-create)' });
            traceComplete(res.traceId, { renderMs: 0 });
            toast.success('Restored');
            announce(`Intern ${intern.name} restored.`);
          } catch (err) {
            const msg = (isApiError(err) && err.userMessage ? err.userMessage() : err.message) || 'Restore failed';
            toast.error(`Restore failed: ${msg}`);
            announce(`Restore failed: ${msg}`);
          }
          await load();
        },
      },
    });
  }

  // ---- Role changes re-render the badge; writes stay visible and honest ----
  const unsubRole = onRoleChange((role) => {
    clear(roleChipEl);
    roleChipEl.textContent = role;
    roleChipEl.className = `chip chip-${role === 'admin' ? 'emerald' : role === 'editor' ? 'amber' : 'ghost'}`;
    roleSelect.value = role;
    announce(`Role changed to ${role}.`);
  });

  // ---- Boot ----
  readHash();
  await loadTracks();
  syncControls();
  await load();

  return () => {
    if (aborter) aborter.abort();
    clearTimeout(searchTimer);
    clearTimeout(lastNoteTimer);
    if (typeof unsubRole === 'function') unsubRole();
  };
}
