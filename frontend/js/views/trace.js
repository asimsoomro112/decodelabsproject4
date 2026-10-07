/**
 * Trace view (#/trace) — both ends of the wire.
 *
 * Top: the 8-step request lifecycle strip; selecting a request replays its
 * lifecycle with real per-step timestamps (failed requests branch to an
 * "Error Containment" box at step 5). Left: the client timeline (newest
 * first, live via onTraceChange) with a detail drawer. Right: the server
 * request log polled every 3 s, joined to client rows by requestId.
 *
 * @module views/trace
 */

import { demoRequests } from '../api/endpoints.js';
import { h, clear, renderList } from '../core/dom.js';
import { fmtMs } from '../core/format.js';
import { announce } from '../core/a11y.js';
import {
  getEntries, onTraceChange, clearTrace, complete as traceComplete, exportTraceJson,
} from '../trace/tracer.js';
import { LIFECYCLE_STEPS } from '../trace/lifecycle.js';
import { toast } from '../ui/toast.js';
import {
  ensureBaseStyles, injectCss, section, card, chip, methodPill, statusChip,
  emptyState,
} from './components.js';

const STYLE_ID = 'sb-view-trace';

const FALLBACK_STEPS = ['click', 'try', 'fetch + CORS', 'await', 'check', 'json', 'DOM', 'finally'];

function styles() {
  injectCss(STYLE_ID, `
    .sb-lifecycle { display: flex; gap: 6px; align-items: stretch; margin: 16px 0; flex-wrap: wrap; }
    .sb-step { flex: 1 1 100px; min-width: 96px; text-align: center; padding: 10px 6px; border-radius: 12px; border: 1px solid var(--sb-border); background: rgba(255,255,255,.03); font-size: 12.5px; color: var(--sb-muted); position: relative; }
    .sb-step .n { display: block; font-size: 16px; margin-bottom: 4px; }
    .sb-step.lit { border-color: var(--sb-accent-2); background: rgba(79,209,197,.12); color: var(--sb-text); }
    .sb-step .t { display: block; font-size: 11px; color: var(--sb-accent-2); font-family: ui-monospace, Menlo, Consolas, monospace; margin-top: 4px; }
    .sb-step.err { border-color: var(--sb-rose); background: rgba(251,113,133,.12); color: #fecdd3; }
    .sb-errbox { margin: 12px 0; padding: 14px 16px; border-radius: 12px; border: 1px dashed rgba(251,113,133,.6); background: rgba(251,113,133,.07); font-size: 14px; }
    .sb-trace-cols { display: grid; grid-template-columns: 1.25fr 1fr; gap: 16px; align-items: start; }
    @media (max-width: 960px) { .sb-trace-cols { grid-template-columns: 1fr; } }
    .sb-trow { display: grid; grid-template-columns: 64px 1fr auto; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 12px; border: 1px solid transparent; cursor: pointer; font-size: 13px; width: 100%; background: none; color: var(--sb-text); text-align: left; min-height: 44px; }
    .sb-trow:hover { background: rgba(255,255,255,.04); }
    .sb-trow[aria-selected="true"] { border-color: var(--sb-accent); background: rgba(139,123,255,.1); }
    .sb-trow .path { font-family: ui-monospace, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sb-trow .meta { color: var(--sb-muted); font-size: 12px; display: flex; gap: 8px; align-items: center; }
    .sb-srow { display: grid; grid-template-columns: 64px 1fr auto; gap: 8px; align-items: center; padding: 8px 12px; border-radius: 10px; font-size: 13px; }
    .sb-srow.dashed { border: 1px dashed var(--sb-border); color: var(--sb-muted); }
    .sb-srow .path { font-family: ui-monospace, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sb-join { border-color: var(--sb-accent-2) !important; background: rgba(79,209,197,.08) !important; }
    .sb-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 94vw); background: #101423; border-left: 1px solid var(--sb-border); z-index: 80; padding: 20px; overflow-y: auto; box-shadow: -24px 0 60px rgba(0,0,0,.5); }
    .sb-drawer h3 { margin: 0 0 4px; font-size: 18px; word-break: break-all; }
    .sb-filters { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 10px; margin: 14px 0; }
    @media (max-width: 700px) { .sb-filters { grid-template-columns: 1fr; } }
    .sb-outcome-ok { color: var(--sb-emerald); } .sb-outcome-err { color: var(--sb-rose); } .sb-outcome-warn { color: var(--sb-amber); }
  `);
}

/** Normalize the lifecycle step descriptors from the contract. */
function steps() {
  const raw = Array.isArray(LIFECYCLE_STEPS) ? LIFECYCLE_STEPS : [];
  return Array.from({ length: 8 }, (_, i) => {
    const s = raw[i];
    if (typeof s === 'string') return { id: i, label: s };
    if (s && typeof s === 'object') {
      const so = /** @type {any} */ (s);
      return { id: so.id ?? i, label: so.label ?? so.title ?? so.name ?? FALLBACK_STEPS[i] };
    }
    return { id: i, label: FALLBACK_STEPS[i] };
  });
}

/** Tolerant normalization of a tracer entry. */
function norm(e) {
  const t = e.time ?? e.timestamp ?? e.startedAt ?? e.at ?? Date.now();
  const status = Number.isFinite(Number(e.status)) ? Number(e.status) : null;
  return {
    raw: e,
    traceId: e.traceId ?? e.id ?? null,
    requestId: e.requestId ?? e.reqId ?? null,
    time: new Date(t).getTime() || Date.now(),
    method: String(e.method || e.request?.method || '?').toUpperCase(),
    path: String(e.path || e.url || e.request?.url || '(unknown)'),
    label: e.traceLabel || e.label || '',
    status,
    ok: e.ok ?? (status != null ? status < 400 : null),
    durationMs: Number.isFinite(Number(e.durationMs)) ? Number(e.durationMs) : null,
    serverMs: Number.isFinite(Number(e.serverMs ?? e.timing?.serverMs)) ? Number(e.serverMs ?? e.timing?.serverMs) : null,
    networkMs: Number.isFinite(Number(e.networkMs ?? e.timing?.networkMs)) ? Number(e.networkMs ?? e.timing?.networkMs) : null,
    attempts: e.attempts ?? 1,
    outcome: e.outcome || (status == null ? 'network-error' : status < 400 ? 'success' : 'error'),
    lifecycle: e.lifecycle || e.steps || null,
    reqHeaders: e.requestHeaders || e.reqHeaders || null,
    resHeaders: e.responseHeaders || e.resHeaders || null,
    body: e.body ?? e.data ?? e.responseBody ?? null,
    error: e.error || null,
  };
}

/** Tolerant normalization of a server-log row from demoRequests(). */
function normServer(e) {
  const t = e.time ?? e.timestamp ?? e.at ?? Date.now();
  return {
    raw: e,
    requestId: e.requestId ?? e.reqId ?? e.id ?? null,
    time: new Date(t).getTime() || Date.now(),
    method: String(e.method || '?').toUpperCase(),
    path: String(e.path || e.url || '(unknown)'),
    status: Number.isFinite(Number(e.status)) ? Number(e.status) : null,
    durationMs: Number.isFinite(Number(e.durationMs)) ? Number(e.durationMs) : null,
  };
}

function statusClassOf(n) {
  if (n == null) return 'network';
  if (n < 300) return '2xx';
  if (n < 500) return '4xx';
  return '5xx';
}

/**
 * Mount the Trace view.
 *
 * @param {HTMLElement} root - The <main> element (already cleared).
 * @returns {Promise<(() => void)|undefined>} Cleanup: stops polling, unsubscribes, aborts.
 */
export async function mount(root) {
  ensureBaseStyles();
  styles();

  const view = h('div', { class: 'sb-view' });
  const hero = h('div', { class: 'sb-hero' });
  hero.appendChild(h('h1', {}, 'Trace'));
  hero.appendChild(h('p', {}, 'Both ends of the wire: the client timeline on the left, the server request log on the right — joined by request id.'));
  view.appendChild(hero);

  const filters = { statusClass: 'all', method: 'all', search: '' };
  let selectedId = null;
  let pollTimer = null;
  let serverRows = [];
  const aborters = [];

  // ---- Lifecycle strip ----
  const lcSec = section('Request lifecycle', 'Select any request below to replay its 8 steps with real timestamps. Failures branch to Error Containment at step 5.');
  const lcStrip = h('div', { class: 'sb-lifecycle', role: 'list', 'aria-label': 'Request lifecycle steps' });
  /** @type {HTMLSpanElement[]} Timestamp slots, parallel to stepEls. */
  const timeEls = [];
  const stepEls = steps().map((s, i) => {
    const el = h('div', { class: 'sb-step', role: 'listitem' });
    el.appendChild(h('span', { class: 'n', 'aria-hidden': 'true' }, ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][i]));
    el.appendChild(h('span', {}, s.label));
    const t = h('span', { class: 't' });
    el.appendChild(t);
    timeEls.push(t);
    lcStrip.appendChild(el);
    return el;
  });
  lcSec.appendChild(lcStrip);
  const errBox = h('div', { class: 'sb-errbox', hidden: 'true', role: 'alert' });
  lcSec.appendChild(errBox);
  view.appendChild(lcSec);

  function replayLifecycle(entry) {
    const failed = entry && (entry.ok === false || entry.outcome === 'error' || entry.error);
    stepEls.forEach((el, i) => {
      el.classList.remove('lit', 'err');
      timeEls[i].textContent = '';
      if (!entry) return;
      const lc = entry.lifecycle;
      let ts = null;
      if (lc) {
        if (Array.isArray(lc)) ts = lc[i]?.at ?? lc[i]?.time ?? lc[i]?.timestamp ?? null;
        else if (typeof lc === 'object') {
          const key = steps()[i].id;
          ts = lc[key]?.at ?? lc[i]?.at ?? lc[key] ?? null;
          if (typeof ts === 'object') ts = ts.at ?? ts.time ?? null;
        }
      }
      const reached = ts != null || (entry.durationMs != null && i <= 4);
      if (reached) {
        el.classList.add('lit');
        if (ts != null) {
          const d = new Date(ts);
          timeEls[i].textContent = Number.isFinite(d.getTime()) ? d.toISOString().slice(17, 23) + 's' : '';
        }
      }
      if (failed && i === 4) {
        el.classList.add('err');
        timeEls[i].textContent = 'thrown';
      }
    });
    if (failed && entry) {
      errBox.hidden = false;
      clear(errBox);
      errBox.appendChild(h('strong', {}, 'Error Containment — step ⑤ threw. '));
      const msg = entry.error?.message || entry.error?.kind || `HTTP ${entry.status}`;
      errBox.appendChild(h('span', {}, `The client caught it here so the app survives: ${String(msg).slice(0, 200)}`));
    } else {
      errBox.hidden = true;
    }
  }

  // ---- Toolbar: filters + export/clear ----
  const toolbar = h('div', { class: 'sb-row', style: 'justify-content:space-between;margin:8px 0;' });
  const filterWrap = h('div', { class: 'sb-filters', style: 'margin:0;flex:1;' });
  const statusFilter = h('select', { class: 'sb-select', 'aria-label': 'Filter by status class' });
  for (const [v, t] of [['all', 'All statuses'], ['2xx', '2xx'], ['4xx', '4xx'], ['5xx', '5xx'], ['network', 'Network errors']]) {
    statusFilter.appendChild(h('option', { value: v }, t));
  }
  const methodFilter = h('select', { class: 'sb-select', 'aria-label': 'Filter by method' });
  methodFilter.appendChild(h('option', { value: 'all' }, 'All methods'));
  const searchBox = h('input', { class: 'sb-input', type: 'search', placeholder: 'Search path or label…', 'aria-label': 'Search requests' });
  filterWrap.appendChild(statusFilter);
  filterWrap.appendChild(methodFilter);
  filterWrap.appendChild(searchBox);
  const actions = h('div', { class: 'sb-row' });
  const exportBtn = h('button', { class: 'sb-btn', type: 'button' }, 'Export JSON');
  const clearBtn = h('button', { class: 'sb-btn sb-btn-ghost', type: 'button' }, 'Clear');
  actions.appendChild(exportBtn);
  actions.appendChild(clearBtn);
  toolbar.appendChild(filterWrap);
  toolbar.appendChild(actions);
  view.appendChild(toolbar);

  // ---- Columns ----
  const cols = h('div', { class: 'sb-trace-cols' });
  const clientCard = card('Client timeline', 'Newest first. Click a row for the full detail drawer.');
  const clientList = h('div', { role: 'listbox', 'aria-label': 'Client requests', style: 'display:grid;gap:6px;' });
  clientCard.appendChild(clientList);
  const serverCard = card('Server log', 'Polled every 3 s from demoRequests(). Dashed rows are unmatched (e.g. OPTIONS preflights).');
  const serverList = h('div', { style: 'display:grid;gap:6px;' });
  serverCard.appendChild(serverList);
  cols.appendChild(clientCard);
  cols.appendChild(serverCard);
  view.appendChild(cols);
  root.appendChild(view);

  // ---- Detail drawer ----
  let drawer = null;
  function closeDrawer() {
    if (drawer) { drawer.remove(); drawer = null; }
  }
  function openDrawer(entry) {
    closeDrawer();
    drawer = h('aside', { class: 'sb-drawer', role: 'dialog', 'aria-label': `Request detail ${entry.method} ${entry.path}`, tabindex: '-1' });
    const head = h('div', { class: 'sb-row', style: 'justify-content:space-between;' });
    head.appendChild(h('h3', {}, `${entry.method} ${entry.path}`));
    const x = h('button', { class: 'sb-btn sb-btn-sm sb-btn-ghost', type: 'button', 'aria-label': 'Close detail' }, '✕');
    x.addEventListener('click', closeDrawer);
    head.appendChild(x);
    drawer.appendChild(head);
    const meta = h('div', { class: 'sb-row', style: 'margin:10px 0;' });
    meta.appendChild(methodPill(entry.method));
    meta.appendChild(statusChip(entry.status));
    meta.appendChild(chip(`attempts: ${entry.attempts}`, entry.attempts > 1 ? 'amber' : 'ghost'));
    if (entry.requestId) meta.appendChild(chip(`id ${String(entry.requestId).slice(0, 8)}…`, 'ghost'));
    drawer.appendChild(meta);

    const kv = (title, obj) => {
      const c = card(title, '');
      if (!obj || typeof obj !== 'object' || !Object.keys(obj).length) {
        c.appendChild(h('p', { class: 'sb-muted', style: 'font-size:13px;margin:0;' }, '—'));
      } else {
        const dl = h('dl', { class: 'sb-kv' });
        for (const [k, v] of Object.entries(obj)) {
          dl.appendChild(h('dt', { class: 'sb-mono' }, k));
          const dd = h('dd', { class: 'sb-mono' });
          dd.textContent = String(v);
          dl.appendChild(dd);
        }
        c.appendChild(dl);
      }
      drawer.appendChild(c);
    };

    const timing = {
      'network transit': entry.networkMs != null ? fmtMs(entry.networkMs) : '—',
      'server work': entry.serverMs != null ? fmtMs(entry.serverMs) : '—',
      'parse + render': entry.durationMs != null && entry.networkMs != null && entry.serverMs != null
        ? fmtMs(Math.max(0, entry.durationMs - entry.networkMs - entry.serverMs)) : '—',
      total: entry.durationMs != null ? fmtMs(entry.durationMs) : '—',
    };
    kv('Timing split', timing);
    kv('Request headers sent', entry.reqHeaders);
    kv('Response headers (visible to JS)', entry.resHeaders);

    const bodyCard = card('Body', '');
    const pre = h('pre', { class: 'sb-pre' });
    try {
      pre.textContent = entry.body == null ? '(no body)' : typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body, null, 2);
    } catch {
      pre.textContent = '(unserializable body)';
    }
    bodyCard.appendChild(pre);
    drawer.appendChild(bodyCard);

    if (entry.error) {
      const ec = card('Error object', '');
      const epre = h('pre', { class: 'sb-pre' });
      try {
        epre.textContent = JSON.stringify(entry.error, Object.getOwnPropertyNames(entry.error), 2);
      } catch {
        epre.textContent = String(entry.error && entry.error.message ? entry.error.message : entry.error);
      }
      ec.appendChild(epre);
      drawer.appendChild(ec);
    }
    document.body.appendChild(drawer);
    drawer.focus();
    drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  }

  // ---- Rendering ----
  function matchesFilters(e) {
    if (filters.statusClass !== 'all' && statusClassOf(e.status) !== filters.statusClass) return false;
    if (filters.method !== 'all' && e.method !== filters.method) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!(e.path.toLowerCase().includes(q) || e.label.toLowerCase().includes(q))) return false;
    }
    return true;
  }

  function outcomeIcon(outcome) {
    if (outcome === 'success') return h('span', { class: 'sb-outcome-ok', 'aria-label': 'success', title: 'success' }, '●');
    if (outcome === 'error') return h('span', { class: 'sb-outcome-err', 'aria-label': 'error', title: 'error' }, '●');
    return h('span', { class: 'sb-outcome-warn', 'aria-label': 'network issue', title: 'network issue' }, '●');
  }

  function renderClient() {
    const entries = getEntries().map(norm).sort((a, b) => b.time - a.time).filter(matchesFilters);
    // Refresh method filter options from live data.
    const methods = [...new Set(getEntries().map((e) => String(e.method || '?').toUpperCase()))].sort();
    const cur = methodFilter.value;
    clear(methodFilter);
    methodFilter.appendChild(h('option', { value: 'all' }, 'All methods'));
    for (const m of methods) methodFilter.appendChild(h('option', { value: m }, m));
    if ([...methodFilter.options].some((o) => o.value === cur)) methodFilter.value = cur;

    if (!entries.length) {
      clear(clientList);
      clientList.appendChild(emptyState({ title: 'No requests traced yet', body: 'Fire a request from the Bridge, Interns or Lab views and it will appear here.' }));
      return;
    }
    renderList(clientList, entries, (e) => {
      const row = h('button', {
        class: 'sb-trow', type: 'button', role: 'option',
        'aria-selected': String(e.traceId) === String(selectedId),
      });
      const time = h('span', { class: 'sb-muted sb-mono', style: 'font-size:11.5px;' }, new Date(e.time).toLocaleTimeString());
      const mid = h('div', { style: 'min-width:0;' });
      const topLine = h('div', { class: 'sb-row', style: 'gap:8px;' });
      topLine.appendChild(methodPill(e.method));
      const pathEl = h('span', { class: 'path' });
      pathEl.textContent = e.path;
      topLine.appendChild(pathEl);
      mid.appendChild(topLine);
      const metaLine = h('div', { class: 'meta' });
      metaLine.appendChild(statusChip(e.status));
      if (e.durationMs != null) {
        const d = h('span', {});
        d.textContent = fmtMs(e.durationMs);
        metaLine.appendChild(d);
      }
      if (e.attempts > 1) {
        const a = h('span', {});
        a.textContent = `×${e.attempts}`;
        metaLine.appendChild(a);
      }
      if (e.label) {
        const l = h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' });
        l.textContent = e.label;
        metaLine.appendChild(l);
      }
      mid.appendChild(metaLine);
      row.appendChild(time);
      row.appendChild(mid);
      row.appendChild(outcomeIcon(e.outcome));
      row.dataset.traceId = String(e.traceId ?? '');
      row.dataset.requestId = String(e.requestId ?? '');
      row.addEventListener('click', () => {
        selectedId = e.traceId;
        replayLifecycle(e);
        openDrawer(e);
        renderClient();
        highlightServerJoin(e.requestId);
        announce(`Selected ${e.method} ${e.path}, status ${e.status ?? 'network error'}.`);
      });
      row.addEventListener('mouseenter', () => highlightServerJoin(e.requestId));
      row.addEventListener('mouseleave', () => highlightServerJoin(null));
      return row;
    });
  }

  function highlightServerJoin(requestId) {
    const rows = serverList.querySelectorAll('.sb-srow');
    rows.forEach((r) => {
      const row = /** @type {HTMLElement} */ (r);
      row.classList.toggle('sb-join', !!requestId && row.dataset.requestId === String(requestId) && requestId !== 'null' && requestId !== '');
    });
  }

  function renderServer() {
    const rows = serverRows.map(normServer).sort((a, b) => b.time - a.time).slice(0, 60);
    const clientIds = new Set(getEntries().map((e) => String(e.requestId ?? e.traceId ?? '')));
    if (!rows.length) {
      clear(serverList);
      serverList.appendChild(h('p', { class: 'sb-muted', style: 'font-size:13px;' }, 'No server rows yet — polling demoRequests()…'));
      return;
    }
    renderList(serverList, rows, (r) => {
      const matched = r.requestId && clientIds.has(String(r.requestId));
      const row = h('div', { class: `sb-srow${matched ? '' : ' dashed'}`, tabindex: '0', role: 'button', 'aria-label': `${r.method} ${r.path}, ${matched ? 'matched to client row' : 'unmatched'}` });
      row.dataset.requestId = String(r.requestId ?? '');
      const time = h('span', { class: 'sb-muted sb-mono', style: 'font-size:11.5px;' }, new Date(r.time).toLocaleTimeString());
      const pathEl = h('span', { class: 'path' });
      pathEl.textContent = `${r.method} ${r.path}`;
      const meta = h('span', { class: 'meta sb-muted', style: 'font-size:12px;' });
      meta.textContent = `${r.status ?? '—'}${r.durationMs != null ? ` · ${fmtMs(r.durationMs)}` : ''}${matched ? '' : ' · preflight?'}`;
      row.appendChild(time);
      row.appendChild(pathEl);
      row.appendChild(meta);
      const join = () => highlightClientJoin(r.requestId);
      row.addEventListener('mouseenter', join);
      row.addEventListener('mouseleave', () => highlightClientJoin(null));
      row.addEventListener('click', join);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); join(); } });
      return row;
    });
  }

  function highlightClientJoin(requestId) {
    const rows = clientList.querySelectorAll('.sb-trow');
    rows.forEach((r) => {
      const row = /** @type {HTMLElement} */ (r);
      row.classList.toggle('sb-join', !!requestId && row.dataset.requestId === String(requestId) && requestId !== 'null' && requestId !== '');
    });
  }

  async function pollServer() {
    const c = new AbortController();
    aborters.push(c);
    try {
      const res = await demoRequests({}, { signal: c.signal, traceLabel: 'Trace server log poll', timeoutMs: 5000 });
      const d = res.data || {};
      const arr = Array.isArray(d) ? d : (d.requests ?? d.log ?? d.entries ?? d.data ?? []);
      serverRows = Array.isArray(arr) ? arr : [];
      renderServer();
      traceComplete(res.traceId, { renderMs: 0 });
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.kind === 'abort')) return;
      // Poll failures are non-fatal; keep the last good rows.
    }
  }

  // ---- Wiring ----
  statusFilter.addEventListener('change', () => { filters.statusClass = statusFilter.value; renderClient(); });
  methodFilter.addEventListener('change', () => { filters.method = methodFilter.value; renderClient(); });
  let searchT = null;
  searchBox.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { filters.search = searchBox.value.trim(); renderClient(); }, 200);
  });

  exportBtn.addEventListener('click', () => {
    try {
      const text = exportTraceJson();
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'synapsebridge-trace.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success('Trace exported as synapsebridge-trace.json');
      announce('Trace exported.');
    } catch (err) {
      toast.error(`Export failed: ${(err && err.message) || err}`);
    }
  });

  clearBtn.addEventListener('click', () => {
    clearTrace();
    selectedId = null;
    replayLifecycle(null);
    closeDrawer();
    renderClient();
    toast.info('Trace cleared');
    announce('Trace cleared.');
  });

  const unsub = onTraceChange(() => renderClient());

  renderClient();
  await pollServer();
  pollTimer = setInterval(pollServer, 3000);
  announce(`Trace view ready: ${getEntries().length} client entries traced.`);

  return () => {
    if (pollTimer) clearInterval(pollTimer);
    for (const c of aborters) {
      try { c.abort(); } catch { /* settled */ }
    }
    closeDrawer();
    if (typeof unsub === 'function') unsub();
  };
}
