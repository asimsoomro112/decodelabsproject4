/**
 * Lab view (#/lab) — five hands-on experiment panels.
 *
 * 1. Status Lab — every status code through the real client.
 * 2. Async Lab — the frozen page (busy loop vs await).
 * 3. Sequential vs Parallel — 8 slow calls, Gantt chart of real timings.
 * 4. Failure Lab — timeout, cancel, offline, retry, rate-limit, bad bodies.
 * 5. CORS Lab — simple vs preflighted requests + server request-log proof.
 *
 * Demo endpoint shapes used (see report — core contract gap):
 *   demoStatus(code, opts) · demoSlow(ms, opts) · demoFlaky(key, failCount, opts)
 *   demoBadBody(kind, opts) · demoEcho({}, opts) · demoRequests({}, opts)
 *
 * @module views/lab
 */

import {
  listInterns, createIntern, replaceIntern,
  demoStatus, demoSlow, demoFlaky, demoBadBody, demoEcho, demoRequests,
} from '../api/endpoints.js';
import { getRole, setRole } from '../api/auth.js';
import { isApiError, ApiError } from '../api/errors.js';
import { h, clear } from '../core/dom.js';
import { fmtMs } from '../core/format.js';
import { announce } from '../core/a11y.js';
import { complete as traceComplete } from '../trace/tracer.js';
import { toast } from '../ui/toast.js';
import { openDialog } from '../ui/dialog.js';
import {
  ensureBaseStyles, injectCss, section, card, chip, statusChip,
} from './components.js';

const STYLE_ID = 'sb-view-lab';

function styles() {
  injectCss(STYLE_ID, `
    .sb-code-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); gap: 8px; margin: 14px 0; }
    .sb-result { margin-top: 14px; }
    .sb-kv { display: grid; grid-template-columns: 150px 1fr; gap: 6px 12px; font-size: 14px; margin: 10px 0; }
    .sb-kv dt { color: var(--sb-muted); }
    .sb-kv dd { margin: 0; word-break: break-word; }
    .sb-snippet .tok-branch { opacity: .45; }
    .sb-snippet .tok-branch.taken { opacity: 1; background: rgba(79,209,197,.16); border-radius: 6px; }
    .sb-snippet .line { display: block; padding: 1px 8px; }
    .sb-demo-stage { display: flex; gap: 14px; align-items: center; justify-content: center; padding: 22px; }
    .sb-gantt { margin: 16px 0; display: grid; gap: 8px; }
    .sb-gantt-row { display: grid; grid-template-columns: 130px 1fr 90px; gap: 10px; align-items: center; font-size: 13px; }
    .sb-gantt-track { position: relative; height: 26px; background: rgba(255,255,255,.05); border-radius: 8px; overflow: hidden; }
    .sb-gantt-bar { position: absolute; top: 0; bottom: 0; border-radius: 8px; background: linear-gradient(90deg, #8b7bff, #4fd1c5); min-width: 3px; }
    .sb-gantt-bar.fail { background: linear-gradient(90deg, #fb7185, #f59e0b); }
    .sb-gantt-bar.wait { background: rgba(255,255,255,.18); }
    .sb-lab-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .sb-btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0; }
    .sb-note { font-size: 13.5px; color: var(--sb-muted); line-height: 1.6; }
    .sb-warn { background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.4); border-radius: 12px; padding: 12px 14px; font-size: 13.5px; color: #fde68a; margin: 12px 0; line-height: 1.6; }
  `);
}

/**
 * Mount the Lab view.
 *
 * @param {HTMLElement} root - The <main> element (already cleared).
 * @returns {Promise<(() => void)|undefined>} Cleanup: clears timers/controllers.
 */
export async function mount(root) {
  ensureBaseStyles();
  styles();
  const timers = [];
  const controllers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const track = (c) => { controllers.push(c); return c; };

  const view = h('div', { class: 'sb-view' });
  const hero = h('div', { class: 'sb-hero' });
  hero.appendChild(h('h1', {}, 'The Lab'));
  hero.appendChild(h('p', {}, 'Break things on purpose. Every button below fires a real request through the real client — statuses, timeouts, retries, rate limits and CORS, all observable.'));
  view.appendChild(hero);

  // ============ PANEL 1: Status Lab ============
  const p1 = section('1 · Status Lab', 'One button per status code. Watch how the client turns each response into either data or a structured ApiError.');
  const statusGrid = h('div', { class: 'sb-lab-grid' });
  const groups = [
    { label: '2xx Success — you asked, server delivered', codes: [200, 201, 204], tone: 'emerald' },
    { label: '4xx — you messed up', codes: [400, 401, 403, 404, 422, 429], tone: 'amber' },
    { label: '5xx — we messed up', codes: [500, 502, 503], tone: 'rose' },
  ];
  const resultCard = card('Result', 'The client outcome for the last status button.');
  const resultBody = h('div', { class: 'sb-result' });
  resultBody.appendChild(h('p', { class: 'sb-muted' }, 'Press a status code to fire it.'));
  resultCard.appendChild(resultBody);

  const snippetCard = card('The branch that ran', 'The client checks response.ok before touching the body.');
  const snippet = h('pre', { class: 'sb-pre sb-snippet', 'aria-label': 'Client response handling code' });
  const line = (text, id) => h('span', { class: 'tok-branch line', 'data-branch': id }, text);
  snippet.appendChild(line('const res = await fetch(url, opts);', ''));
  snippet.appendChild(line('if (!res.ok) {', 'err'));
  snippet.appendChild(line('  throw await ApiError.fromResponse(res);  // ← error path', 'err'));
  snippet.appendChild(line('}', 'err'));
  snippet.appendChild(line('const data = await res.json();             // ← success path', 'ok'));
  snippet.appendChild(line('return { data, status: res.status };', 'ok'));
  snippetCard.appendChild(snippet);
  snippetCard.appendChild(h('p', { class: 'sb-note' }, 'The taken branch lights up after each shot.'));

  for (const g of groups) {
    const gc = card(g.label, '');
    gc.appendChild(chip(g.label.split('—')[0].trim(), g.tone));
    const grid = h('div', { class: 'sb-code-grid' });
    for (const code of g.codes) {
      const b = h('button', { class: 'sb-btn sb-btn-sm', type: 'button' }, String(code));
      b.addEventListener('click', () => fireStatus(code, b));
      grid.appendChild(b);
    }
    gc.appendChild(grid);
    statusGrid.appendChild(gc);
  }
  statusGrid.appendChild(resultCard);
  statusGrid.appendChild(snippetCard);
  p1.appendChild(statusGrid);
  view.appendChild(p1);

  function highlightBranch(which) {
    const lines = snippet.querySelectorAll('.tok-branch');
    lines.forEach((l) => {
      const b = l.getAttribute('data-branch');
      l.classList.toggle('taken', b !== '' && b === which);
    });
  }

  function outcomeCard({ ok, status, title, bodyText, attempts, userMessage, kind }) {
    clear(resultBody);
    const wrap = h('div', {});
    wrap.appendChild(h('div', { class: 'sb-row' },
      chip(ok ? 'response.ok = true' : 'response.ok = false', ok ? 'emerald' : 'rose'),
      statusChip(status)));
    const dl = h('dl', { class: 'sb-kv' });
    const row = (k, v) => { dl.appendChild(h('dt', {}, k)); const dd = h('dd', {}); dd.textContent = v; dl.appendChild(dd); };
    row('status', String(status));
    if (title) row('problem title', title);
    if (bodyText) row('body', bodyText);
    row('retried?', attempts > 1 ? `yes — ${attempts} attempts` : 'no — 1 attempt');
    if (kind) row('error kind', kind);
    row('userMessage()', userMessage);
    wrap.appendChild(dl);
    resultBody.appendChild(wrap);
  }

  async function fireStatus(code, btn) {
    btn.disabled = true;
    const t0 = performance.now();
    try {
      const res = await demoStatus(code, { traceLabel: `Lab status ${code}` });
      traceComplete(res.traceId, { renderMs: performance.now() - t0 });
      highlightBranch('ok');
      const bodyText = res.data == null ? '(empty body)' : JSON.stringify(res.data).slice(0, 300);
      outcomeCard({
        ok: true, status: res.status, title: null, bodyText, kind: 'ok',
        attempts: res.attempts ?? 1, userMessage: 'All good — data parsed and handed to the view.',
      });
      announce(`Status ${code}: success, ${res.attempts ?? 1} attempt(s).`);
    } catch (err) {
      highlightBranch('err');
      const api = isApiError(err) ? err : null;
      let userMessage = 'Something unexpected happened.';
      if (api && typeof api.userMessage === 'function') {
        try { userMessage = api.userMessage(); } catch { userMessage = api.message || userMessage; }
      } else if (err && err.message) {
        userMessage = err instanceof ApiError ? String(err.message) : `Non-API failure: ${err.message}`;
      }
      // Reference ApiError so the import is meaningful for the didactic demo.
      const isApi = err instanceof ApiError;
      outcomeCard({
        ok: false,
        status: (api && api.status) || 0,
        title: (api && /** @type {any} */ (api.problem)?.title) || null,
        bodyText: (api && /** @type {any} */ (api.problem)?.detail) || (err && err.message) || null,
        attempts: (api && api.attempts) || 1,
        kind: (api && api.kind) || (err && err.name) || 'unknown',
        userMessage: `${userMessage}${isApi ? '' : ' (not an ApiError)'}`,
      });
      announce(`Status ${code}: failed as ${((api && api.kind) || 'error')}. ${userMessage}`);
    } finally {
      btn.disabled = false;
    }
  }

  // ============ PANEL 2: Async Lab ============
  const p2 = section('2 · Async Lab — the frozen page', 'Same 2-second wait, two universes. Left: a synchronous busy loop blocks the event loop, so even the CSS spinner freezes. Right: the same wait via await keeps the page alive. Promises move Pending → Fulfilled/Rejected without ever blocking the thread.');
  const asyncGrid = h('div', { class: 'sb-lab-grid' });

  const frozenCard = card('Blocking: busy loop', 'The main thread is stuck in while(Date.now() < end). Nothing paints, nothing responds.');
  const frozenStage = h('div', { class: 'sb-demo-stage' });
  const frozenSpin = h('div', { class: 'sb-spinner', 'aria-hidden': 'true' });
  frozenStage.appendChild(frozenSpin);
  frozenCard.appendChild(frozenStage);
  const frozenBtn = h('button', { class: 'sb-btn sb-btn-danger', type: 'button' }, 'Block for 2 s');
  const frozenNote = h('p', { class: 'sb-note' }, 'Idle — press the button and watch the spinner freeze solid.');
  frozenCard.appendChild(frozenBtn);
  frozenCard.appendChild(frozenNote);

  const awaitCard = card('Non-blocking: await', 'await demoSlow(2000) parks the function and frees the thread; the spinner keeps spinning.');
  const awaitStage = h('div', { class: 'sb-demo-stage' });
  const awaitSpin = h('div', { class: 'sb-spinner', 'aria-hidden': 'true' });
  awaitStage.appendChild(awaitSpin);
  awaitCard.appendChild(awaitStage);
  const awaitBtn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, 'Await 2 s (non-blocking)');
  const awaitNote = h('p', { class: 'sb-note' }, 'Idle — the spinner never stops, because the event loop is free.');
  awaitCard.appendChild(awaitBtn);
  awaitCard.appendChild(awaitNote);

  asyncGrid.appendChild(frozenCard);
  asyncGrid.appendChild(awaitCard);
  p2.appendChild(asyncGrid);
  view.appendChild(p2);

  frozenBtn.addEventListener('click', () => {
    frozenBtn.disabled = true;
    frozenNote.textContent = 'Blocked… the spinner above is frozen because the thread never yields.';
    announce('Blocking for 2 seconds. The page is frozen.');
    // Let the disabled state paint before blocking.
    setTimeout(() => {
      const end = Date.now() + 2000;
      while (Date.now() < end) { /* busy loop: the frozen page */ }
      frozenNote.textContent = 'Done — 2 s of nothing could paint. That is the frozen page.';
      frozenBtn.disabled = false;
      announce('Unblocked. The frozen page demo finished.');
    }, 50);
  });

  awaitBtn.addEventListener('click', async () => {
    awaitBtn.disabled = true;
    awaitNote.textContent = 'Pending… the promise is in flight; the event loop keeps painting.';
    announce('Awaiting 2 seconds without blocking.');
    try {
      await demoSlow(2000, { traceLabel: 'Lab async await demo' });
      awaitNote.textContent = 'Fulfilled — same 2 s, zero frozen frames.';
      announce('Await demo fulfilled. The page never froze.');
    } catch (err) {
      awaitNote.textContent = `Rejected: ${err && err.message ? err.message : err}`;
      announce('Await demo rejected.');
    } finally {
      awaitBtn.disabled = false;
    }
  });

  // ============ PANEL 3: Sequential vs Parallel ============
  const p3 = section('3 · Sequential vs Parallel', 'Eight 400 ms demoSlow calls. First awaited one-by-one in a for loop (≈3.2 s), then Promise.all (≈0.4 s), then Promise.allSettled with one demoFlaky failure tolerated.');
  const p3Card = card('Race them', 'Timings below are measured with performance.now() around each real call.');
  const raceBtn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, 'Run the race');
  const raceOut = h('div', { class: 'sb-result' });
  p3Card.appendChild(raceBtn);
  p3Card.appendChild(raceOut);
  p3.appendChild(p3Card);
  view.appendChild(p3);

  function ganttRow(label, startMs, durMs, totalMs, failed) {
    const rowEl = h('div', { class: 'sb-gantt-row' });
    rowEl.appendChild(h('span', { class: 'sb-muted sb-mono' }, label));
    const trackEl = h('div', { class: 'sb-gantt-track' });
    const bar = h('div', { class: `sb-gantt-bar${failed ? ' fail' : ''}` });
    bar.style.left = `${(startMs / totalMs) * 100}%`;
    bar.style.width = `${Math.max(1.5, (durMs / totalMs) * 100)}%`;
    trackEl.appendChild(bar);
    rowEl.appendChild(trackEl);
    rowEl.appendChild(h('span', { class: 'sb-mono' }, fmtMs(durMs)));
    return rowEl;
  }

  raceBtn.addEventListener('click', async () => {
    raceBtn.disabled = true;
    clear(raceOut);
    raceOut.appendChild(h('p', { class: 'sb-muted' }, 'Running…'));
    const N = 8;
    const MS = 400;
    try {
      // Sequential
      const seqStart = performance.now();
      const seqMarks = [];
      for (let i = 0; i < N; i++) {
        const s = performance.now();
        await demoSlow(MS, { traceLabel: `Lab race sequential ${i + 1}/8` });
        seqMarks.push({ label: `call ${i + 1}`, start: s - seqStart, dur: performance.now() - s });
      }
      const seqTotal = performance.now() - seqStart;

      // Parallel
      const parStart = performance.now();
      const parMarks = await Promise.all(Array.from({ length: N }, async (_, i) => {
        const s = performance.now();
        await demoSlow(MS, { traceLabel: `Lab race parallel ${i + 1}/8` });
        return { label: `call ${i + 1}`, start: s - parStart, dur: performance.now() - s };
      }));
      const parTotal = performance.now() - parStart;

      // allSettled with one flaky failure
      const settleStart = performance.now();
      const flakyKey = `lab-race-${Date.now()}`;
      const settleMarks = await Promise.all(Array.from({ length: N }, async (_, i) => {
        const s = performance.now();
        let failed = false;
        try {
          if (i === 3) await demoFlaky(flakyKey, 99, { traceLabel: 'Lab race flaky (fails)' });
          else await demoSlow(MS, { traceLabel: `Lab race settled ${i + 1}/8` });
        } catch {
          failed = true; // tolerated by allSettled
        }
        return { label: i === 3 ? 'flaky ✕' : `call ${i + 1}`, start: s - settleStart, dur: performance.now() - s, failed };
      }));
      const settleTotal = performance.now() - settleStart;

      clear(raceOut);
      const mkBlock = (title, marks, total, caption) => {
        const b = h('div', { style: 'margin:18px 0;' });
        b.appendChild(h('h4', { style: 'margin:0 0 4px;' }, `${title} — total ${fmtMs(total)}`));
        b.appendChild(h('p', { class: 'sb-note', style: 'margin:0 0 8px;' }, caption));
        const g = h('div', { class: 'sb-gantt' });
        for (const m of marks) g.appendChild(ganttRow(m.label, m.start, m.dur, total, m.failed));
        b.appendChild(g);
        return b;
      };
      raceOut.appendChild(mkBlock('Sequential (for…await)', seqMarks, seqTotal, 'Each call waits for the previous one. Total ≈ 8 × 400 ms.'));
      raceOut.appendChild(mkBlock('Parallel (Promise.all)', parMarks, parTotal, 'All eight fly at once. Total ≈ one 400 ms window.'));
      raceOut.appendChild(mkBlock('Parallel tolerant (Promise.allSettled)', settleMarks, settleTotal, 'The flaky call rejects, the other seven still resolve — the failure is contained, not fatal.'));
      announce(`Race finished: sequential ${fmtMs(seqTotal)}, parallel ${fmtMs(parTotal)}, settled ${fmtMs(settleTotal)}.`);
    } catch (err) {
      clear(raceOut);
      raceOut.appendChild(h('p', { class: 'sb-note' }, `Race aborted: ${err && err.message ? err.message : err}`));
    } finally {
      raceBtn.disabled = false;
    }
  });

  // ============ PANEL 4: Failure Lab ============
  const p4 = section('4 · Failure Lab', 'Every way a request can die, on demand — each mapped to the error kind the client reports.');
  const p4Card = card('Break a request', '');
  const failOut = h('div', { class: 'sb-result' });
  failOut.appendChild(h('p', { class: 'sb-muted' }, 'Pick a failure mode.'));
  p4Card.appendChild(failOut);
  const failBtns = h('div', { class: 'sb-btn-row' });
  p4Card.appendChild(failBtns);
  p4.appendChild(p4Card);
  view.appendChild(p4);

  function failResult(title, lines) {
    clear(failOut);
    failOut.appendChild(h('h4', { style: 'margin:0 0 6px;' }, title));
    const dl = h('dl', { class: 'sb-kv' });
    for (const [k, v] of lines) {
      dl.appendChild(h('dt', {}, k));
      const dd = h('dd', {});
      dd.textContent = v;
      dl.appendChild(dd);
    }
    failOut.appendChild(dl);
  }

  const failKindOf = (err) => {
    if (isApiError(err) && err.kind) return String(err.kind);
    if (err && err.name === 'AbortError') return 'abort';
    if (err && /abort/i.test(err.message || '')) return 'abort';
    if (err && /timed out|timeout/i.test(err.message || '')) return 'timeout';
    if (err && /network|fetch failed|failed to fetch/i.test(err.message || '')) return 'network';
    if (err && /json|parse|unexpected token/i.test(err.message || '')) return 'parse';
    return (err && err.name) || 'unknown';
  };

  const addFailBtn = (label, fn) => {
    const b = h('button', { class: 'sb-btn', type: 'button' }, label);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await fn(); } finally { b.disabled = false; }
    });
    failBtns.appendChild(b);
  };

  addFailBtn('Timeout', async () => {
    try {
      await demoSlow(9000, { timeoutMs: 2000, traceLabel: 'Lab failure timeout' });
      failResult('Timeout', [['unexpected', 'the call resolved — expected a timeout']]);
    } catch (err) {
      const kind = failKindOf(err);
      failResult('Timeout', [
        ['kind', kind],
        ['what happened', 'demoSlow(9000) with timeoutMs: 2000 — the client gave up after 2 s'],
        ['userMessage()', isApiError(err) && err.userMessage ? err.userMessage() : String((err && err.message) || err)],
      ]);
      announce(`Timeout demo finished with kind ${kind}.`);
    }
  });

  addFailBtn('Cancel', async () => {
    const c = track(new AbortController());
    const p = (async () => {
      try {
        await demoSlow(8000, { signal: c.signal, traceLabel: 'Lab failure cancel' });
        return { cancelled: false };
      } catch (err) {
        return { cancelled: true, err };
      }
    })();
    later(() => c.abort(), 800);
    const out = await p;
    if (out.cancelled) {
      const kind = failKindOf(out.err);
      failResult('Cancel', [
        ['kind', kind],
        ['what happened', 'AbortController.abort() fired 800 ms into an 8 s call'],
        ['note', 'aborts are not errors to retry — the Shield pattern returns silently'],
      ]);
      announce('Cancel demo finished: request aborted by the user.');
    } else {
      failResult('Cancel', [['unexpected', 'the call resolved — abort did not land']]);
    }
  });

  addFailBtn('Offline', async () => {
    try {
      await demoSlow(1000, { baseUrl: 'http://127.0.0.1:9/api/v1', timeoutMs: 3000, traceLabel: 'Lab failure offline' });
      failResult('Offline', [['unexpected', 'the call resolved — expected a network failure']]);
    } catch (err) {
      const kind = failKindOf(err);
      failResult('Offline', [
        ['kind', kind],
        ['what happened', 'baseUrl pointed at a dead port (127.0.0.1:9) — fetch itself rejected'],
        ['userMessage()', isApiError(err) && err.userMessage ? err.userMessage() : String((err && err.message) || err)],
      ]);
      announce(`Offline demo finished with kind ${kind}.`);
    }
  });

  addFailBtn('Retry', async () => {
    failResult('Retry', [['status', 'firing demoFlaky — fails twice, then succeeds…']]);
    const key = `lab-retry-${Date.now()}`;
    const t0 = performance.now();
    try {
      const res = await demoFlaky(key, 2, { traceLabel: 'Lab failure retry' });
      traceComplete(res.traceId, { renderMs: performance.now() - t0 });
      failResult('Retry', [
        ['attempts', `${res.attempts ?? '?'} (1 → 3)`],
        ['backoff', 'client waits ~250 ms, ~500 ms between attempts (exponential, jittered)'],
        ['outcome', 'succeeded on the final attempt — retries are invisible when they work'],
      ]);
      announce(`Retry demo succeeded after ${res.attempts ?? '?'} attempts.`);
    } catch (err) {
      failResult('Retry', [
        ['attempts', String((isApiError(err) && err.attempts) || '?')],
        ['outcome', `still failing: ${(err && err.message) || err}`],
      ]);
      announce('Retry demo exhausted its attempts.');
    }
  });

  addFailBtn('Rate limit', async () => {
    failResult('Rate limit', [['status', 'firing 25 rapid invalid POSTs — each 422 still counts toward the 20/min write limiter…']]);
    announce('Rate limit demo firing 25 rapid requests.');
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) => createIntern({}, { traceLabel: `Lab rate-limit probe ${i + 1}/25`, timeoutMs: 8000 })),
    );
    const limited = results.find((r) => r.status === 'rejected' && isApiError(r.reason) && r.reason.status === 429);
    const counts = {};
    for (const r of results) {
      const s = r.status === 'fulfilled' ? r.value.status : (isApiError(r.reason) ? r.reason.status : 'err');
      counts[s] = (counts[s] || 0) + 1;
    }
    if (limited && limited.status === 'rejected') {
      const err = limited.reason;
      const retryAfter = err.headers && typeof err.headers.get === 'function'
        ? err.headers.get('retry-after')
        : (err.problem && err.problem.retryAfter) || '60';
      failResult('Rate limit — 429 surfaced', [
        ['status', '429 Too Many Requests'],
        ['retry-after', `${retryAfter} s — the countdown below is live`],
        ['distribution', Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ')],
        ['note', 'writes are limited to 20/min; the 422s still counted, so the limiter tripped'],
      ]);
      const dd = h('dd', {});
      const dl = failOut.querySelector('dl');
      dl.appendChild(h('dt', {}, 'countdown'));
      dl.appendChild(dd);
      let left = parseInt(retryAfter, 10) || 60;
      const tick = () => {
        dd.textContent = left > 0 ? `${left} s until the window resets` : 'window reset — writes allowed again';
        if (left > 0) { left -= 1; later(tick, 1000); }
      };
      tick();
      announce('Rate limit demo: 429 received with a retry-after countdown.');
    } else {
      failResult('Rate limit', [
        ['outcome', 'no 429 observed in this burst'],
        ['distribution', Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ')],
        ['note', 'the limiter window may have already been warm — try again in a minute'],
      ]);
      announce('Rate limit demo finished without a 429.');
    }
  });

  for (const kind of ['html', 'truncated-json', 'empty']) {
    addFailBtn(`Bad body: ${kind}`, async () => {
      try {
        await demoBadBody(kind, { traceLabel: `Lab bad body ${kind}` });
        failResult(`Bad body: ${kind}`, [['unexpected', 'the call resolved — expected a parse failure']]);
      } catch (err) {
        failResult(`Bad body: ${kind}`, [
          ['kind', failKindOf(err)],
          ['what happened', { html: 'server returned text/html — res.json() choked', 'truncated-json': 'body cut mid-object — unexpected end of JSON input', empty: '204-style empty body parsed as JSON' }[kind]],
          ['message', String((err && err.message) || err).slice(0, 220)],
          ['lesson', 'always guard the parse step — it is step ⑥ of the lifecycle for a reason'],
        ]);
        announce(`Bad body demo (${kind}) finished with a parse failure.`);
      }
    });
  }

  // Forgot await — static didactic card (deliberately not a real bug).
  const forgotCard = card('Forgot await — the classic', 'Static example. No request is fired here; this is what the mistake looks like.');
  const forgotPre = h('pre', { class: 'sb-pre' });
  forgotPre.textContent = [
    '// ❌ forgot await — data is a Promise, not the payload',
    'const data = listInterns({ pageSize: 5 });',
    'console.log(data); // → [object Promise]',
    '',
    '// ✅ awaited — the resolved payload',
    'const res = await listInterns({ pageSize: 5 });',
    'console.log(res.data); // → { items: [...], pagination: {...} }',
  ].join('\n');
  forgotCard.appendChild(forgotPre);
  forgotCard.appendChild(h('p', { class: 'sb-note' }, 'Rule: any expression that returns a promise must be awaited (or .then-chained — but this codebase uses async/await only) before you touch its value.'));
  p4.appendChild(forgotCard);
  p4.appendChild(h('div', { class: 'sb-warn' }, 'Heads-up: the Rate limit button intentionally trips the 20/min write limiter. Writes from the Interns view may 429 for up to a minute afterwards — that is the lesson working as designed.'));
  view.appendChild(p4);

  // ============ PANEL 5: CORS Lab ============
  const p5 = section('5 · CORS Lab', 'Same-origin policy in action: a simple GET sails through with no preflight, while a PUT carrying an Authorization header forces the browser to send an OPTIONS preflight first. Proof comes from the server request log.');
  const corsGrid = h('div', { class: 'sb-lab-grid' });
  const simpleCard = card('Simple request', 'GET demoEcho — no custom headers, no preflight expected.');
  const preCard = card('Preflighted request', 'PUT /interns/:id with Authorization (editor/admin role) — OPTIONS preflight expected.');
  const corsOut = card('Server-log proof', 'demoRequests() entries around each shot.');
  const corsBody = h('div', { class: 'sb-result' });
  corsBody.appendChild(h('p', { class: 'sb-muted' }, 'Fire a request to inspect its preflight.'));
  corsOut.appendChild(corsBody);

  const simpleBtn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, 'Send simple GET');
  simpleCard.appendChild(simpleBtn);
  const preBtn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, 'Send PUT with Authorization');
  preCard.appendChild(preBtn);
  if (getRole() === 'guest') {
    const warn = h('p', { class: 'sb-note' }, 'You are a guest: the PUT will still trigger its OPTIONS preflight (preflight happens before auth), but the PUT itself will 401. ');
    const sw = h('button', { class: 'sb-btn sb-btn-sm', type: 'button' }, 'Switch to Editor');
    sw.addEventListener('click', () => { setRole('editor'); toast.info('Role: editor — the PUT will now carry Authorization.'); });
    warn.appendChild(sw);
    preCard.appendChild(warn);
  }
  const whyBtn = h('button', { class: 'sb-btn sb-btn-ghost', type: 'button' }, 'Why does this fail on another origin?');

  corsGrid.appendChild(simpleCard);
  corsGrid.appendChild(preCard);
  corsGrid.appendChild(corsOut);
  p5.appendChild(corsGrid);
  p5.appendChild(h('div', { class: 'sb-btn-row' }, whyBtn));
  p5.appendChild(h('p', { class: 'sb-note' }, 'Explainer: the same-origin policy stops evil.com from reading responses from your API. For “non-simple” requests (PUT, or any request with an Authorization header), the browser first sends an OPTIONS preflight asking “may I?”. If the server’s Access-Control-Allow-Origin does not list the page’s origin, the browser kills the real request before it is sent — the server never even sees it. An unlisted origin dies in the browser, not on the server.'));
  view.appendChild(p5);

  function serverEntries(data) {
    const d = data || {};
    const arr = Array.isArray(d) ? d : (d.requests ?? d.log ?? d.entries ?? d.data ?? []);
    return Array.isArray(arr) ? arr : [];
  }

  function showCorsProof(kind, reqPath, reqTime) {
    clear(corsBody);
    corsBody.appendChild(h('h4', { style: 'margin:0 0 6px;' }, kind));
    const dl = h('dl', { class: 'sb-kv' });
    const row = (k, v) => { dl.appendChild(h('dt', {}, k)); const dd = h('dd', {}); dd.textContent = v; dl.appendChild(dd); };
    row('request path', reqPath);
    row('sent at', new Date(reqTime).toISOString());
    corsBody.appendChild(dl);
    corsBody.appendChild(h('p', { class: 'sb-muted' }, 'Reading server log…'));
  }

  async function proveCors(kind, reqPath, reqTime, res) {
    try {
      const logRes = await demoRequests({}, { traceLabel: 'CORS lab server log' });
      traceComplete(logRes.traceId, { renderMs: 0 });
      const entries = serverEntries(logRes.data);
      const tOf = (e) => new Date(e.time ?? e.timestamp ?? e.at ?? 0).getTime();
      const preflights = entries.filter((e) => {
        const m = String(e.method || '').toUpperCase();
        const p = String(e.path || e.url || '');
        const t = tOf(e);
        return m === 'OPTIONS' && p === reqPath && t <= reqTime && (reqTime - t) < 3000;
      });
      clear(corsBody);
      corsBody.appendChild(h('h4', { style: 'margin:0 0 6px;' }, kind));
      const dl = h('dl', { class: 'sb-kv' });
      const row = (k, v, tone) => {
        dl.appendChild(h('dt', {}, k));
        const dd = h('dd', {});
        if (tone) { const c = chip(v, tone); dd.appendChild(c); } else dd.textContent = v;
        dl.appendChild(dd);
      };
      if (preflights.length) {
        const pf = preflights[0];
        row('preflight', `YES — OPTIONS ${reqPath} ${Math.round(reqTime - tOf(pf))} ms before`, 'violet');
        row('preflight status', String(pf.status ?? 204));
      } else {
        row('preflight', 'none — simple request, browser sent it directly', 'emerald');
      }
      // Access-Control-* headers visible to JS
      const hdrs = res && res.headers && typeof res.headers.forEach === 'function' ? res.headers : null;
      const ac = [];
      if (hdrs) {
        hdrs.forEach((v, k) => { if (k.toLowerCase().startsWith('access-control-')) ac.push(`${k}: ${v}`); });
      }
      row('Access-Control-* visible to JS', ac.length ? ac.join(' · ') : '(none exposed on this response)');
      corsBody.appendChild(dl);
      corsBody.appendChild(h('p', { class: 'sb-note' }, preflights.length
        ? 'The browser asked permission first (OPTIONS), the server allowed it, then the real request went out. That round-trip is the “preflight tax” on non-simple requests.'
        : 'GET with no custom headers is a “simple request”: no preflight, straight to the server.'));
      announce(`CORS proof: ${preflights.length ? 'preflight found' : 'no preflight (simple request)'}.`);
    } catch (err) {
      clear(corsBody);
      corsBody.appendChild(h('p', { class: 'sb-note' }, `Could not read the server log: ${(err && err.message) || err}`));
    }
  }

  simpleBtn.addEventListener('click', async () => {
    simpleBtn.disabled = true;
    const t = Date.now();
    try {
      const res = await demoEcho({}, { traceLabel: 'CORS simple GET' });
      traceComplete(res.traceId, { renderMs: 0 });
      showCorsProof('Simple GET → /api/v1/demo/echo', '/api/v1/demo/echo', t);
      await proveCors('Simple GET → /api/v1/demo/echo', '/api/v1/demo/echo', t, res);
    } catch (err) {
      toast.error(`Simple GET failed: ${(err && err.message) || err}`);
    } finally {
      simpleBtn.disabled = false;
    }
  });

  preBtn.addEventListener('click', async () => {
    preBtn.disabled = true;
    try {
      const listRes = await listInterns({ pageSize: 1 }, { traceLabel: 'CORS lab fetch intern id' });
      const d = listRes.data || {};
      const items = d.items ?? d.data ?? [];
      if (!items.length) {
        toast.info('No interns exist yet — register one first so the PUT has a target.');
        return;
      }
      const target = items[0];
      const reqPath = `/api/v1/interns/${target.id}`;
      const t = Date.now();
      let res = null;
      try {
        res = await replaceIntern(target.id, {
          name: target.name, email: target.email, phone: target.phone,
          track: target.track, status: target.status,
        }, { traceLabel: 'CORS preflighted PUT' });
        traceComplete(res.traceId, { renderMs: 0 });
        toast.success('PUT succeeded (editor/admin) — preflight still happened first.');
      } catch (err) {
        if (isApiError(err) && (err.status === 401 || err.status === 403)) {
          toast.error(`PUT rejected with ${err.status} as ${getRole()} — but the OPTIONS preflight still ran. Check the proof.`, {
            action: { label: 'Switch to Editor', onClick: () => setRole('editor') },
          });
        } else {
          toast.error(`PUT failed: ${(err && err.message) || err}`);
        }
      }
      showCorsProof(`Preflighted PUT → ${reqPath}`, reqPath, t);
      await proveCors(`Preflighted PUT → ${reqPath}`, reqPath, t, res);
    } finally {
      preBtn.disabled = false;
    }
  });

  whyBtn.addEventListener('click', () => {
    const body = h('div', { style: 'max-width:520px;' });
    const p1el = h('p', { class: 'sb-note' }, 'If you serve this frontend from another origin (a different port, domain, or file://) and the API does not list that origin, the browser blocks every non-simple request at the preflight step. The fix lives on the server, not in your fetch call:');
    const pre = h('pre', { class: 'sb-pre' });
    pre.textContent = [
      '# backend/.env (or wherever the API reads config)',
      '# Add the exact origin of the page making requests —',
      '# scheme + host + port, no trailing slash:',
      'CORS_ORIGINS=http://localhost:5173,https://your-app.vercel.app',
      '',
      '# Then restart the API. Preflights (OPTIONS) will answer 204',
      '# with Access-Control-Allow-Origin matching your page,',
      '# and the real requests will be allowed through.',
    ].join('\n');
    const p2el = h('p', { class: 'sb-note' }, 'No frontend code change can bypass this — that is the entire point of the same-origin policy.');
    body.appendChild(p1el);
    body.appendChild(pre);
    body.appendChild(p2el);
    openDialog({ title: 'Why does this fail on another origin?', body });
  });

  root.appendChild(view);

  return () => {
    for (const id of timers) clearTimeout(id);
    for (const c of controllers) {
      try { c.abort(); } catch { /* already settled */ }
    }
  };
}
