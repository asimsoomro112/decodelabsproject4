/**
 * Bridge view (#/bridge) — the live I-P-O pipeline.
 *
 * Hero + three glass pipeline cards (Input / Process / Output) fed by the
 * newest tracer entry, a "Send a test request" button that fires a real
 * listInterns call and pulses the pipeline, a round-trip budget bar, live
 * stat tiles with count-up animation, and a packet-color legend.
 *
 * @module views/bridge
 */

import { listInterns, getStats, listTracks, health } from '../api/endpoints.js';
import { getRole, onRoleChange } from '../api/auth.js';
import { h, clear } from '../core/dom.js';
import { fmtMs } from '../core/format.js';
import { announce } from '../core/a11y.js';
import { getEntries, onTraceChange, complete as traceComplete } from '../trace/tracer.js';
import { toast } from '../ui/toast.js';
import {
  ensureBaseStyles, injectCss, section, card, chip, methodPill, statusChip,
  loadingInto, emptyState, errorState,
} from './components.js';

const STYLE_ID = 'sb-view-bridge';

/** CSS for the pipeline, budget bar, tiles and legend. */
function styles() {
  injectCss(STYLE_ID, `
    .sb-pipeline { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 12px; align-items: stretch; margin: 20px 0; }
    .sb-pipe-arrow { align-self: center; font-size: 28px; color: var(--sb-accent-2); }
    .sb-pipe-card h4 { margin: 0 0 2px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--sb-muted); }
    .sb-pipe-card .sb-pipe-val { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
    .sb-pipe-card .sb-pipe-sub { font-size: 13px; color: var(--sb-muted); line-height: 1.6; }
    .sb-budget { height: 34px; border-radius: 10px; overflow: hidden; display: flex; border: 1px solid var(--sb-border); margin: 12px 0 8px; }
    .sb-budget span { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #0b0e17; min-width: 0; overflow: hidden; white-space: nowrap; transition: width .5s ease; }
    .sb-budget .b-net { background: #7c8cf8; }
    .sb-budget .b-srv { background: #4fd1c5; }
    .sb-budget .b-ren { background: #c4b5fd; }
    .sb-budget-legend { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: var(--sb-muted); }
    .sb-dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    .sb-tile .sb-tile-num { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; margin: 6px 0 2px; }
    .sb-tile .sb-tile-label { color: var(--sb-muted); font-size: 13px; }
    .sb-legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .sb-legend .glass { padding: 14px 16px; display: flex; gap: 12px; align-items: center; }
    .sb-track-mini { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px dashed var(--sb-border); }
    .sb-track-mini:last-child { border-bottom: none; }
    .sb-api-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 8px; }
    .sb-api-dot.on { background: var(--ethereal); box-shadow: 0 0 8px var(--ethereal); }
    .sb-api-dot.off { background: var(--mocha); }
    .sb-hero-2026 { position: relative; text-align: center; padding: 8rem 1rem 6rem; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
    .sb-hero-glow-2026 { position: absolute; top: 50%; left: 50%; width: 60vw; height: 60vw; max-width: 600px; max-height: 600px; background: conic-gradient(from 0deg, var(--mocha) 0%, transparent 40%, var(--ethereal) 60%, transparent 100%); filter: blur(100px); opacity: 0.15; z-index: -1; border-radius: 50%; animation: ambient-flow 15s linear infinite; pointer-events: none; }
    @keyframes ambient-flow { 0% { transform: translate(-50%, -50%) rotate(0deg) scale(1); } 50% { transform: translate(-50%, -50%) rotate(180deg) scale(1.1); } 100% { transform: translate(-50%, -50%) rotate(360deg) scale(1); } }
    .sb-hero-title-2026 { font-size: clamp(3rem, 11vw, 8rem); font-weight: 900; letter-spacing: -0.05em; line-height: 0.95; text-transform: uppercase; margin-bottom: 2rem; z-index: 1; position: relative; }
    .sb-gradient-text-2026 { background: linear-gradient(135deg, var(--mocha), var(--ethereal)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .sb-annotation-2026 { position: absolute; font-family: 'Caveat', 'Comic Sans MS', cursive, sans-serif; font-size: clamp(1rem, 3vw, 2rem); color: var(--ethereal); transform: rotate(-8deg) translate(5px, -30px); text-transform: none; font-weight: 500; letter-spacing: normal; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
    .sb-hero-subtitle-2026 { max-width: 500px; font-size: clamp(1.1rem, 2vw, 1.25rem); line-height: 1.6; margin: 0 auto 3rem; z-index: 1; color: var(--sb-muted); }
    .sb-code-window { text-align: left; padding: 16px 20px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px; width: 100%; max-width: 380px; margin: 0 auto; z-index: 1; }
    .sb-code-header { display: flex; gap: 6px; margin-bottom: 12px; }
    .sb-code-dot-mac { width: 10px; height: 10px; border-radius: 50%; }
    .sb-code-line { display: flex; align-items: center; gap: 10px; color: var(--sb-muted); }
    .sb-cursor { font-weight: 300; opacity: 1; animation: sb-blink 1s step-end infinite; }
    @keyframes sb-blink { 50% { opacity: 0; } }
    @keyframes sb-pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
    @media (max-width: 760px) { .sb-pipeline { grid-template-columns: 1fr; } .sb-pipe-arrow { transform: rotate(90deg); justify-self: center; } .sb-hero-2026 { padding: 4rem 1rem 3rem; } }
  `);
}

/**
 * Tolerant extraction of the fields this view needs from a tracer entry.
 * The tracer is built by the core worker; every access is defensive.
 *
 * @param {object} e - Raw tracer entry.
 * @returns {{method: string, path: string, preflight: string, status: number|null, serverMs: number|null, networkMs: number|null, durationMs: number|null, traceId: string|null}}
 */
function pick(e) {
  const method = e.method || e.request?.method || '—';
  const path = e.path || e.url || e.request?.url || '—';
  const pre = e.preflight ?? e.corsPreflight;
  const preflight = pre === true ? 'yes' : pre === false ? 'no' : 'n/a';
  const status = Number.isFinite(Number(e.status)) ? Number(e.status) : null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    method, path, preflight, status,
    serverMs: num(e.serverMs ?? e.timing?.serverMs),
    networkMs: num(e.networkMs ?? e.timing?.networkMs),
    durationMs: num(e.durationMs),
    traceId: e.traceId ?? e.id ?? null,
  };
}

/**
 * Animate a number from 0 to target (respects reduced motion).
 *
 * @param {HTMLElement} el - Element receiving the text.
 * @param {number} target - Final value.
 */
function countUp(el, target) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !Number.isFinite(target)) {
    el.textContent = String(target);
    return;
  }
  const t0 = performance.now();
  const dur = 800;
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Mount the Bridge view.
 *
 * @param {HTMLElement} root - The <main> element (already cleared).
 * @returns {Promise<(() => void)|undefined>} Cleanup: unsubscribes trace/role listeners.
 */
export async function mount(root) {
  ensureBaseStyles();
  styles();
  const t0 = performance.now();
  const view = h('div', { class: 'sb-view' });

  // ---- Hero (2026 Trends) ----
  const hero = h('div', { class: 'sb-hero-2026' });
  
  const glow = h('div', { class: 'sb-hero-glow-2026' });
  hero.appendChild(glow);

  const h1 = h('h1', { class: 'sb-hero-title-2026' });
  h1.innerHTML = `UI. API. <span class="sb-annotation-2026">always live!</span><br><span class="sb-gradient-text-2026">ONE <span id="sb-hero-cycle">BRIDGE.</span><span class="sb-cursor">|</span></span>`;
  hero.appendChild(h1);

  const cycleWords = ['BRIDGE.', 'WORKFLOW.', 'SYSTEM.', 'PIPELINE.'];
  let cycleIdx = 0;
  const cycleEl = h1.querySelector('#sb-hero-cycle');
  let isTyping = true;
  
  async function typeWriter() {
    while (isTyping) {
      await new Promise(r => setTimeout(r, 2500));
      if (!isTyping) break;
      let currentWord = cycleEl.textContent;
      while (currentWord.length > 0) {
        currentWord = currentWord.slice(0, -1);
        cycleEl.textContent = currentWord;
        await new Promise(r => setTimeout(r, 40));
      }
      if (!isTyping) break;
      cycleIdx = (cycleIdx + 1) % cycleWords.length;
      let nextWord = cycleWords[cycleIdx];
      for (let i = 0; i <= nextWord.length; i++) {
        cycleEl.textContent = nextWord.slice(0, i);
        await new Promise(r => setTimeout(r, 80));
      }
    }
  }
  typeWriter();

  const p = h('p', { class: 'sb-hero-subtitle-2026' });
  p.textContent = 'A minimalist, type-first approach. Watch your UI, API, and DOM re-renders happen synchronously in real-time.';
  hero.appendChild(p);

  // Interactive Code Window (Feature Preview Trend)
  const codeWin = h('div', { class: 'sb-code-window glass' });
  const codeHeader = h('div', { class: 'sb-code-header' });
  codeHeader.appendChild(h('div', { class: 'sb-code-dot-mac', style: 'background:var(--mocha)' }));
  codeHeader.appendChild(h('div', { class: 'sb-code-dot-mac', style: 'background:var(--ethereal)' }));
  codeHeader.appendChild(h('div', { class: 'sb-code-dot-mac', style: 'background:var(--moonlit)' }));
  codeWin.appendChild(codeHeader);
  
  const codeLine = h('div', { class: 'sb-code-line' });
  const dot = h('span', { class: 'sb-api-dot off', 'aria-hidden': 'true' });
  const apiLabel = h('span', { style: 'color:var(--sb-text)' }, 'await bridge.connect()...');
  codeLine.appendChild(dot);
  codeLine.appendChild(apiLabel);
  codeWin.appendChild(codeLine);
  
  hero.appendChild(codeWin);
  view.appendChild(hero);

  // ---- Live pipeline ----
  const pipeSec = section('Live I-P-O pipeline', 'Values below are measured from the most recently completed request on the bridge.');
  const pipeline = h('div', { class: 'sb-pipeline', 'aria-live': 'polite' });

  const inputCard = card();
  inputCard.classList.add('sb-pipe-card');
  const inputMethod = h('div', { class: 'sb-pipe-val' }, '—');
  const inputUrl = h('div', { class: 'sb-mono sb-muted', style: 'font-size:13px;word-break:break-all;' }, 'no requests yet');
  const inputPre = h('div', { class: 'sb-pipe-sub' });
  inputCard.appendChild(h('h4', {}, '① Input'));
  inputCard.appendChild(inputMethod);
  inputCard.appendChild(inputUrl);
  inputCard.appendChild(inputPre);

  const procCard = card();
  procCard.classList.add('sb-pipe-card');
  const procTime = h('div', { class: 'sb-pipe-val' }, '—');
  const procStatus = h('div', { class: 'sb-pipe-sub' });
  procCard.appendChild(h('h4', {}, '② Process'));
  procCard.appendChild(procTime);
  procCard.appendChild(procStatus);

  const outCard = card();
  outCard.classList.add('sb-pipe-card');
  const outTime = h('div', { class: 'sb-pipe-val' }, '—');
  const outNodes = h('div', { class: 'sb-pipe-sub' });
  outCard.appendChild(h('h4', {}, '③ Output'));
  outCard.appendChild(outTime);
  outCard.appendChild(outNodes);

  const arrow = () => h('div', { class: 'sb-pipe-arrow', 'aria-hidden': 'true' }, '→');
  pipeline.appendChild(inputCard);
  pipeline.appendChild(arrow());
  pipeline.appendChild(procCard);
  pipeline.appendChild(arrow());
  pipeline.appendChild(outCard);
  pipeSec.appendChild(pipeline);

  const testBtn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, 'Send a test request');
  pipeSec.appendChild(testBtn);
  view.appendChild(pipeSec);

  // ---- Budget bar ----
  const budgetSec = section('Round-trip budget', 'Where the milliseconds went on the last request: network transit vs server work vs parse + render.');
  const budget = h('div', { class: 'sb-budget', role: 'img', 'aria-label': 'Round-trip budget bar. No request measured yet.' });
  const bNet = h('span', { class: 'b-net', style: 'width:34%;' }, '');
  const bSrv = h('span', { class: 'b-srv', style: 'width:33%;' }, '');
  const bRen = h('span', { class: 'b-ren', style: 'width:33%;' }, '');
  budget.appendChild(bNet);
  budget.appendChild(bSrv);
  budget.appendChild(bRen);
  const budgetLegend = h('div', { class: 'sb-budget-legend' });
  const legNet = h('span', {}, h('span', { class: 'sb-dot', style: 'background:#7c8cf8;' }), 'network —');
  const legSrv = h('span', {}, h('span', { class: 'sb-dot', style: 'background:#4fd1c5;' }), 'server —');
  const legRen = h('span', {}, h('span', { class: 'sb-dot', style: 'background:#c4b5fd;' }), 'parse + render —');
  budgetLegend.appendChild(legNet);
  budgetLegend.appendChild(legSrv);
  budgetLegend.appendChild(legRen);
  budgetSec.appendChild(budget);
  budgetSec.appendChild(budgetLegend);
  view.appendChild(budgetSec);

  /**
   * Refresh pipeline + budget from the newest tracer entry.
   */
  function refreshPipeline() {
    const entries = getEntries();
    if (!entries.length) return;
    const p = pick(entries[0]);
    const r0 = performance.now();

    clear(inputMethod);
    inputMethod.appendChild(methodPill(p.method));
    inputUrl.textContent = p.path;
    clear(inputPre);
    inputPre.appendChild(chip(`preflight: ${p.preflight}`, p.preflight === 'yes' ? 'violet' : 'ghost'));
    inputPre.appendChild(document.createTextNode(' CORS preflight sent before the real request'));

    procTime.textContent = p.serverMs != null ? fmtMs(p.serverMs) : '—';
    clear(procStatus);
    if (p.status != null) procStatus.appendChild(statusChip(p.status));
    else procStatus.appendChild(chip('no response', 'rose'));
    procStatus.appendChild(document.createTextNode(p.serverMs != null ? ' measured via Server-Timing' : ''));

    const renderMs = performance.now() - r0;
    const parseRender = p.durationMs != null && p.serverMs != null && p.networkMs != null
      ? Math.max(0, p.durationMs - p.serverMs - p.networkMs) + renderMs
      : null;
    outTime.textContent = parseRender != null ? fmtMs(parseRender) : '—';
    const nodes = view.querySelectorAll('*').length;
    outNodes.textContent = `${nodes} DOM nodes in this view`;

    // Budget bar
    const net = p.networkMs ?? 0;
    const srv = p.serverMs ?? 0;
    const ren = parseRender ?? 0;
    const total = net + srv + ren;
    if (total > 0) {
      const pct = (v) => `${Math.max(4, Math.round((v / total) * 100))}%`;
      bNet.style.width = pct(net);
      bSrv.style.width = pct(srv);
      bRen.style.width = pct(ren);
      bNet.textContent = fmtMs(net);
      bSrv.textContent = fmtMs(srv);
      bRen.textContent = fmtMs(ren);
      budget.setAttribute('aria-label', `Round-trip ${fmtMs(total)}: network ${fmtMs(net)}, server ${fmtMs(srv)}, parse and render ${fmtMs(ren)}.`);
    }
    legNet.childNodes[1].textContent = `network ${fmtMs(net)}`;
    legSrv.childNodes[1].textContent = `server ${fmtMs(srv)}`;
    legRen.childNodes[1].textContent = `parse + render ${fmtMs(ren)}`;
  }

  const unsubTrace = onTraceChange(refreshPipeline);
  refreshPipeline();

  // Test request button
  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    const label = testBtn.textContent;
    testBtn.textContent = 'Sending…';
    try {
      const res = await listInterns({ pageSize: 1 }, { traceLabel: 'Bridge test request' });
      traceComplete(res.traceId, { renderMs: performance.now() - t0 });
      for (const c of [inputCard, procCard, outCard]) {
        c.classList.remove('sb-pulse');
        void c.offsetWidth;
        c.classList.add('sb-pulse');
      }
      refreshPipeline();
      announce('Test request completed. Pipeline updated.');
    } catch (err) {
      const msg = err && err.message ? err.message : 'Test request failed';
      toast.error(msg);
      announce(`Test request failed: ${msg}`);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = label;
    }
  });

  // ---- Stat tiles ----
  const statsSec = section('Live stats', getRole() === 'admin'
    ? 'Aggregates from the stats endpoint (admin role).'
    : 'Public aggregates. Switch to the admin role for the full stats endpoint.');
  const tiles = h('div', { class: 'sb-grid cols-4' });
  statsSec.appendChild(tiles);
  view.appendChild(statsSec);

  /**
   * Defensive parse of stats-shaped payloads.
   * @param {any} d
   */
  function parseStats(d) {
    if (!d || typeof d !== 'object') return null;
    const totals = d.totals || d;
    const total = totals.total ?? totals.totalInterns ?? null;
    const active = totals.active ?? totals.activeInterns ?? null;
    const completed = totals.completed ?? totals.completedInterns ?? null;
    const byTrack = d.byTrack || d.tracks || d.perTrack || [];
    return { total, active, completed, byTrack: Array.isArray(byTrack) ? byTrack : [] };
  }

  function tile(label) {
    const t = card();
    t.classList.add('sb-tile');
    t.appendChild(h('div', { class: 'sb-tile-label' }, label));
    const num = h('div', { class: 'sb-tile-num' }, '—');
    t.appendChild(num);
    return { el: t, num };
  }

  async function loadStats() {
    loadingInto(tiles, { rows: 4, cards: true });
    const ctrl = new AbortController();
    try {
      let parsed;
      if (getRole() === 'admin') {
        const res = await getStats({}, { signal: ctrl.signal, traceLabel: 'Bridge stats load' });
        parsed = parseStats(res.data);
        traceComplete(res.traceId, { renderMs: performance.now() - t0 });
      } else {
        // Public fallback: totals from pagination + per-track counts from listTracks.
        const [listRes, trackRes] = await Promise.all([
          listInterns({ pageSize: 1 }, { signal: ctrl.signal, traceLabel: 'Bridge public total' }),
          listTracks({}, { signal: ctrl.signal, traceLabel: 'Bridge tracks load' }),
        ]);
        const d = listRes.data || {};
        const total = d.pagination?.total ?? d.meta?.total ?? d.total ?? null;
        const tracks = trackRes.data?.tracks ?? trackRes.data ?? [];
        parsed = {
          total,
          active: null,
          completed: null,
          byTrack: (Array.isArray(tracks) ? tracks : []).map((t) => ({
            track: t.name ?? t.track ?? t.id,
            count: t.count ?? t.interns ?? null,
          })),
        };
        traceComplete(listRes.traceId, { renderMs: performance.now() - t0 });
      }
      if (!parsed || (parsed.total == null && !parsed.byTrack.length)) {
        clear(tiles);
        tiles.appendChild(emptyState({ title: 'No stats yet', body: 'Register an intern to see live numbers here.' }));
        announce('Stats loaded: no data yet.');
        return;
      }
      clear(tiles);
      const tTotal = tile('Total interns');
      const tActive = tile('Active');
      const tDone = tile('Completed');
      tiles.appendChild(tTotal.el);
      tiles.appendChild(tActive.el);
      tiles.appendChild(tDone.el);
      countUp(tTotal.num, parsed.total ?? 0);
      if (parsed.active != null) countUp(tActive.num, parsed.active);
      else { tActive.num.textContent = '—'; tActive.el.appendChild(h('div', { class: 'sb-muted', style: 'font-size:12px;' }, 'admin only')); }
      if (parsed.completed != null) countUp(tDone.num, parsed.completed);
      else { tDone.num.textContent = '—'; tDone.el.appendChild(h('div', { class: 'sb-muted', style: 'font-size:12px;' }, 'admin only')); }
      const tTracks = card('Per track');
      if (parsed.byTrack.length) {
        for (const row of parsed.byTrack.slice(0, 6)) {
          const line = h('div', { class: 'sb-track-mini' });
          line.appendChild(h('span', {}, String(row.track ?? row.name ?? '—')));
          line.appendChild(h('strong', {}, row.count != null ? String(row.count) : '—'));
          tTracks.appendChild(line);
        }
      } else {
        tTracks.appendChild(h('p', { class: 'sb-muted', style: 'font-size:13px;margin:0;' }, 'No per-track breakdown available.'));
      }
      tiles.appendChild(tTracks);
      announce(`Stats loaded: ${parsed.total ?? 0} interns total.`);
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.kind === 'abort')) return;
      const msg = err && err.message ? err.message : 'Could not load stats';
      clear(tiles);
      tiles.appendChild(errorState({ message: msg, onRetry: loadStats }));
      announce(`Stats failed to load: ${msg}`);
    }
  }

  // ---- Legend ----
  const legendSec = section('Packet legend', 'How to read request colors across the app.');
  const legend = h('div', { class: 'sb-legend' });
  const legendItems = [
    ['emerald', '2xx — success', 'The server delivered what you asked for.'],
    ['amber', '4xx — client error', 'The request was wrong: bad input, missing auth.'],
    ['rose', '5xx — server error', 'The server messed up while handling a valid request.'],
    ['ghost', 'dashed — preflight', 'An OPTIONS request the browser sent before the real one (CORS).'],
  ];
  for (const [tone, title, body] of legendItems) {
    const item = card();
    item.style.padding = '14px 16px';
    const wrap = h('div', { class: 'sb-row' });
    wrap.appendChild(chip('●', tone));
    const text = h('div', {});
    text.appendChild(h('strong', { style: 'font-size:14px;' }, title));
    text.appendChild(h('div', { class: 'sb-muted', style: 'font-size:13px;' }, body));
    wrap.appendChild(text);
    item.appendChild(wrap);
    legend.appendChild(item);
  }
  legendSec.appendChild(legend);
  view.appendChild(legendSec);

  root.appendChild(view);

  // API health dot (non-blocking)
  (async () => {
    try {
      await health({}, { traceLabel: 'Bridge health check', timeoutMs: 5000 });
      dot.classList.remove('off');
      dot.classList.add('on');
      apiLabel.textContent = 'API online at /api/v1';
    } catch {
      apiLabel.textContent = 'API unreachable — check your network or backend.';
    }
  })();

  await loadStats();

  const unsubRole = onRoleChange(() => { loadStats(); });

  return () => {
    isTyping = false;
    if (typeof unsubTrace === 'function') unsubTrace();
    if (typeof unsubRole === 'function') unsubRole();
  };
}
