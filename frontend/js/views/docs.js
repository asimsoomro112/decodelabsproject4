/**
 * Docs view (#/docs) — concept cards mirroring the course slides.
 *
 * Each concept links to the exact repo file that implements it (rendered as
 * mono text paths — no dead links). Includes an interactive fetch() anatomy
 * explorer, a live JSON playground, an XSS-safe rendering demo, the REST
 * method matrix, the 15-endpoint API reference and the brief coverage
 * checklist.
 *
 * @module views/docs
 */

import { h, clear } from '../core/dom.js';
import { announce } from '../core/a11y.js';
import { ensureBaseStyles, injectCss, section, card, chip, methodPill } from './components.js';

const STYLE_ID = 'sb-view-docs';
const HOSTILE = '<img src=x onerror=alert(1)> Eve';

function styles() {
  injectCss(STYLE_ID, `
    .sb-doc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .sb-filepath { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; background: rgba(139,123,255,.12); border: 1px solid rgba(139,123,255,.35); color: #cdc4ff; border-radius: 8px; padding: 3px 9px; display: inline-block; margin: 3px 6px 3px 0; }
    .sb-ipo-svg { width: 100%; height: auto; display: block; margin: 8px 0; }
    .sb-tokens { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
    .sb-tok { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--sb-border); background: rgba(255,255,255,.05); color: var(--sb-text); cursor: pointer; min-height: 44px; }
    .sb-tok:hover, .sb-tok:focus-visible, .sb-tok[aria-pressed="true"] { border-color: var(--sb-accent-2); background: rgba(79,209,197,.12); }
    .sb-explain { min-height: 76px; }
    .sb-endpoint { display: flex; flex-direction: column; gap: 8px; }
    .sb-endpoint .top { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .sb-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 700px) { .sb-compare { grid-template-columns: 1fr; } }
    .sb-safe-demo { border: 2px solid var(--sb-emerald); border-radius: 12px; padding: 14px; margin-top: 10px; }
  `);
}

/**
 * Mount the Docs view.
 *
 * @param {HTMLElement} root - The <main> element (already cleared).
 * @returns {Promise<(() => void)|undefined>} No live resources; returns undefined.
 */
export async function mount(root) {
  ensureBaseStyles();
  styles();

  const view = h('div', { class: 'sb-view' });
  const hero = h('div', { class: 'sb-hero' });
  hero.appendChild(h('h1', {}, 'Docs'));
  hero.appendChild(h('p', {}, 'Every concept from the slides, pinned to the exact file that implements it. File paths are mono text — the map, not a link.'));
  view.appendChild(hero);

  const file = (p) => h('span', { class: 'sb-filepath' }, p);
  const files = (...ps) => {
    const wrap = h('div', { style: 'margin-top:10px;' });
    wrap.appendChild(h('div', { class: 'sb-muted', style: 'font-size:12px;margin-bottom:4px;' }, 'Implemented in:'));
    for (const p of ps) wrap.appendChild(file(p));
    return wrap;
  };
  const go = (hash, label) => {
    const b = h('button', { class: 'sb-btn sb-btn-sm', type: 'button' }, label);
    b.addEventListener('click', () => { window.location.hash = hash; });
    return b;
  };

  // ---- 1. I-P-O ----
  const s1 = section('Input → Process → Output', 'The whole app is one pipeline: a UI event becomes an HTTP request, the API processes it, the response re-renders the DOM. The tracer watches all three.');
  const c1 = card('The bridge, drawn', 'Static diagram — the live version is the Bridge view.');
  const svgWrap = h('div', {});
  // Fully static SVG (no API data) — innerHTML is acceptable here per the
  // static-markup rule; building namespaced SVG via h() is unreliable.
  svgWrap.innerHTML = `
    <svg class="sb-ipo-svg" viewBox="0 0 640 190" role="img" aria-label="Diagram: UI input crosses the bridge to the API process and back to DOM output">
      <defs>
        <linearGradient id="sb-g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8b7bff"/><stop offset="1" stop-color="#4fd1c5"/>
        </linearGradient>
      </defs>
      <rect x="20" y="40" width="150" height="110" rx="14" fill="rgba(139,123,255,.14)" stroke="#8b7bff" stroke-width="2"/>
      <text x="95" y="90" text-anchor="middle" fill="var(--sb-text)" font-size="17" font-weight="700">INPUT</text>
      <text x="95" y="114" text-anchor="middle" fill="var(--sb-muted)" font-size="12">click → fetch()</text>
      <text x="95" y="132" text-anchor="middle" fill="var(--sb-muted)" font-size="12">HTTP request</text>
      <rect x="245" y="40" width="150" height="110" rx="14" fill="rgba(79,209,197,.12)" stroke="#4fd1c5" stroke-width="2"/>
      <text x="320" y="90" text-anchor="middle" fill="var(--sb-text)" font-size="17" font-weight="700">PROCESS</text>
      <text x="320" y="114" text-anchor="middle" fill="var(--sb-muted)" font-size="12">Express route</text>
      <text x="320" y="132" text-anchor="middle" fill="var(--sb-muted)" font-size="12">Zod → DB → JSON</text>
      <rect x="470" y="40" width="150" height="110" rx="14" fill="rgba(196,181,253,.12)" stroke="#c4b5fd" stroke-width="2"/>
      <text x="545" y="90" text-anchor="middle" fill="var(--sb-text)" font-size="17" font-weight="700">OUTPUT</text>
      <text x="545" y="114" text-anchor="middle" fill="var(--sb-muted)" font-size="12">parse → DOM</text>
      <text x="545" y="132" text-anchor="middle" fill="var(--sb-muted)" font-size="12">re-render</text>
      <line x1="170" y1="95" x2="245" y2="95" stroke="url(#sb-g1)" stroke-width="3"/>
      <polygon points="245,88 258,95 245,102" fill="#4fd1c5"/>
      <line x1="395" y1="95" x2="470" y2="95" stroke="url(#sb-g1)" stroke-width="3"/>
      <polygon points="470,88 483,95 470,102" fill="#c4b5fd"/>
      <rect x="180" y="160" width="280" height="24" rx="12" fill="none" stroke="#8b7bff" stroke-dasharray="6 4"/>
      <text x="320" y="177" text-anchor="middle" fill="var(--sb-muted)" font-size="12">the bridge: CORS · JSON · status codes</text>
    </svg>`;
  c1.appendChild(svgWrap);
  c1.appendChild(files('frontend/js/views/bridge.js', 'frontend/js/trace/tracer.js', 'frontend/js/api/client.js'));
  c1.appendChild(h('div', { class: 'sb-btn-row', style: 'margin-top:12px;display:flex;gap:10px;' }, go('#/bridge', 'Open the live Bridge →')));
  s1.appendChild(c1);
  view.appendChild(s1);

  // ---- 2. REST matrix ----
  const s2 = section('REST method matrix', 'Nouns, not verbs — /interns is the resource; the HTTP method is the action. Idempotent methods can be safely retried.');
  const restCard = card('Method matrix', '');
  const restWrap = h('div', { class: 'sb-table-wrap' });
  const table = h('table', { class: 'sb-table' });
  const thead = h('thead', {});
  const hr = h('tr', {});
  for (const t of ['Method', 'Action', 'Idempotent?', 'DecodeLabs use case', '']) hr.appendChild(h('th', {}, t));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = h('tbody', {});
  const rows = [
    ['GET', 'List / read interns', 'yes (safe)', 'Search, filter, paginate the intern directory', '#/interns'],
    ['POST', 'Register one intern', 'no — use Idempotency-Key', 'Register intern dialog', '#/interns'],
    ['PUT', 'Replace a whole intern', 'yes', 'Replace dialog (prefilled whole object)', '#/interns'],
    ['PATCH', 'Update intern phone', 'no*', 'Inline phone pencil (optimistic UI)', '#/interns'],
    ['DELETE', 'Remove an intern', 'yes*', 'Delete with 5 s undo', '#/interns'],
  ];
  for (const [m, action, idem, use, hash] of rows) {
    const tr = h('tr', {});
    const mtd = h('td', {});
    mtd.appendChild(methodPill(m));
    tr.appendChild(mtd);
    tr.appendChild(h('td', {}, action));
    tr.appendChild(h('td', {}, idem));
    tr.appendChild(h('td', {}, use));
    const td = h('td', {});
    td.appendChild(go(hash, 'Try it →'));
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  restWrap.appendChild(table);
  restCard.appendChild(restWrap);
  restCard.appendChild(h('p', { class: 'sb-note', style: 'margin-top:10px;' }, '* PATCH/DELETE idempotency: repeating the same phone patch converges; repeating a delete returns 404, which the client treats as success (alreadyGone). Statelessness: every request carries its own auth role and parameters — the server keeps no session.'));
  restCard.appendChild(files('frontend/js/api/endpoints.js', 'frontend/js/views/interns.js'));
  s2.appendChild(restCard);
  view.appendChild(s2);

  // ---- 3. Status vocabulary ----
  const s3 = section('Status code vocabulary', 'The three families. The client maps each to either data or a structured ApiError with a friendly userMessage().');
  const s3Card = card('Status families', '');
  const s3Wrap = h('div', { class: 'sb-table-wrap' });
  const s3t = h('table', { class: 'sb-table' });
  const s3h = h('tr', {});
  for (const t of ['Family', 'Meaning', 'Example here', 'Client behavior']) s3h.appendChild(h('th', {}, t));
  s3t.appendChild(h('thead', {}, s3h));
  const s3b = h('tbody', {});
  const vocab = [
    ['2xx', 'Success — the server delivered', '200 list, 201 created, 204 no content', 'parse JSON → render; 204 skips the parse step'],
    ['4xx', 'Client error — the request was wrong', '400 bad input, 401/403 role, 404 gone, 422 validation, 429 rate limit', 'throw ApiError; 422 maps problem.errors[] onto form fields'],
    ['5xx', 'Server error — the server messed up', '500 crash, 502/503 upstream', 'throw ApiError; retry with backoff (idempotent only)'],
  ];
  for (const [fam, meaning, ex, beh] of vocab) {
    const tr = h('tr', {});
    const td = h('td', {});
    td.appendChild(chip(fam, fam === '2xx' ? 'emerald' : fam === '4xx' ? 'amber' : 'rose'));
    tr.appendChild(td);
    tr.appendChild(h('td', {}, meaning));
    tr.appendChild(h('td', { class: 'sb-mono', style: 'font-size:13px;' }, ex));
    tr.appendChild(h('td', {}, beh));
    s3b.appendChild(tr);
  }
  s3t.appendChild(s3b);
  s3Wrap.appendChild(s3t);
  s3Card.appendChild(s3Wrap);
  s3Card.appendChild(files('frontend/js/api/errors.js', 'frontend/js/views/lab.js'));
  s3Card.appendChild(h('div', { style: 'margin-top:12px;' }, go('#/lab', 'Fire every code in the Status Lab →')));
  s3.appendChild(s3Card);
  view.appendChild(s3);

  // ---- 4. fetch() anatomy ----
  const s4 = section('fetch() anatomy', 'Hover or focus any token to see what it does. This is the skeleton every request in the app shares.');
  const s4Card = card('Annotated request', '');
  const tokens = [
    ['await', 'Pauses this function until the promise settles — the event loop stays free (see the Async Lab).'],
    ['fetch(url, opts)', 'The only network primitive. Returns a Promise<Response>; it rejects only on network failure, never on HTTP errors.'],
    ['method: "POST"', 'The REST verb. GET/HEAD are “simple”; PUT/PATCH/DELETE with auth trigger a CORS preflight.'],
    ['headers', 'Metadata: Content-Type: application/json, Authorization from your role, Idempotency-Key on POST.'],
    ['body: JSON.stringify(data)', 'The JSON border crossing — only data survives, functions do not.'],
    ['signal', 'An AbortController signal. Aborting rejects with AbortError — the Shield pattern returns silently.'],
    ['if (!res.ok)', 'fetch does NOT throw on 404/500. This branch converts non-2xx into a structured ApiError.'],
    ['await res.json()', 'Parse step (lifecycle ⑥). A truncated or HTML body throws here — kind: parse.'],
    ['Server-Timing', 'The server reports its own milliseconds; the client splits round-trip into network / server / parse.'],
  ];
  const tokWrap = h('div', { class: 'sb-tokens', role: 'group', 'aria-label': 'fetch anatomy tokens' });
  const explain = h('div', { class: 'sb-explain glass', style: 'padding:14px 16px;' });
  explain.appendChild(h('p', { class: 'sb-muted', style: 'margin:0;' }, 'Pick a token above.'));
  for (const [tok, text] of tokens) {
    const b = h('button', { class: 'sb-tok', type: 'button', 'aria-pressed': 'false' }, tok);
    const show = () => {
      tokWrap.querySelectorAll('.sb-tok').forEach((t) => t.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      clear(explain);
      explain.appendChild(h('strong', { class: 'sb-mono', style: 'font-size:14px;' }, tok));
      explain.appendChild(h('p', { style: 'margin:8px 0 0;line-height:1.6;' }, text));
    };
    b.addEventListener('mouseenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('click', show);
    tokWrap.appendChild(b);
  }
  s4Card.appendChild(tokWrap);
  s4Card.appendChild(explain);
  s4Card.appendChild(files('frontend/js/api/client.js', 'frontend/js/views/lab.js'));
  s4.appendChild(s4Card);
  view.appendChild(s4);

  // ---- 5. JSON border crossing ----
  const s5 = section('JSON border crossing', 'Only JSON-safe data survives the trip: functions, undefined and Symbols are dropped, Dates become ISO strings. Try it live — type JSON, not JS.');
  const s5Card = card('Playground', 'JSON.parse on your input, then JSON.stringify back. Invalid input gets a friendly error, never a crash.');
  const ta = h('textarea', {
    class: 'sb-textarea', 'aria-label': 'JSON input',
    spellcheck: 'false',
  });
  ta.value = '{\n  "name": "Eve",\n  "joined": "2026-10-06",\n  "tags": ["frontend", "api"]\n}';
  const runBtn = h('button', { class: 'sb-btn sb-btn-primary', type: 'button' }, 'Parse & stringify');
  const jsonOut = h('pre', { class: 'sb-pre', 'aria-live': 'polite' });
  jsonOut.textContent = 'Output appears here.';
  runBtn.addEventListener('click', () => {
    const raw = ta.value;
    try {
      const parsed = JSON.parse(raw); // no eval — JSON text only
      jsonOut.textContent = JSON.stringify(parsed, null, 2);
      announce('JSON parsed successfully.');
    } catch (err) {
      jsonOut.textContent = `That is not valid JSON — ${err.message}. Tip: keys and strings need double quotes, no trailing commas, no comments.`;
      announce('Invalid JSON. See the friendly error in the output.');
    }
  });
  s5Card.appendChild(ta);
  s5Card.appendChild(h('div', { style: 'margin:12px 0;' }, runBtn));
  s5Card.appendChild(jsonOut);
  s5Card.appendChild(h('p', { class: 'sb-note' }, 'Why it matters: a Date object becomes "2026-10-06T00:00:00.000Z" on the wire; revive it with new Date(str) on this side. undefined fields vanish — the API treats missing and undefined identically.'));
  s5Card.appendChild(files('frontend/js/api/client.js'));
  s5.appendChild(s5Card);
  view.appendChild(s5);

  // ---- 6. XSS safety ----
  const s6 = section('XSS safety', 'The seeded hostile name must render as inert text. textContent treats it as characters; innerHTML would execute it.');
  const s6Card = card('textContent vs innerHTML', '');
  const cmp = h('div', { class: 'sb-compare' });
  const left = h('div', {});
  left.appendChild(h('h4', { style: 'margin:0 0 8px;' }, '❌ innerHTML (never with API data)'));
  const badPre = h('pre', { class: 'sb-pre' });
  badPre.textContent = 'el.innerHTML = intern.name;\n// <img src=x onerror=alert(1)> would RUN';
  left.appendChild(badPre);
  const right = h('div', {});
  right.appendChild(h('h4', { style: 'margin:0 0 8px;' }, '✅ textContent (what we do)'));
  const goodPre = h('pre', { class: 'sb-pre' });
  goodPre.textContent = 'el.textContent = intern.name;\n// the string is displayed, never parsed';
  right.appendChild(goodPre);
  cmp.appendChild(left);
  cmp.appendChild(right);
  s6Card.appendChild(cmp);
  const demo = h('div', { class: 'sb-safe-demo' });
  demo.appendChild(h('div', { class: 'sb-muted', style: 'font-size:12px;margin-bottom:6px;' }, 'Rendered safely with textContent:'));
  const hostileEl = h('strong', { style: 'font-size:16px;' });
  hostileEl.textContent = HOSTILE; // inert by construction
  demo.appendChild(hostileEl);
  s6Card.appendChild(demo);
  s6Card.appendChild(files('frontend/js/core/dom.js', 'frontend/js/views/components.js', 'frontend/js/views/interns.js'));
  s6.appendChild(s6Card);
  view.appendChild(s6);

  // ---- 7. Anti-patterns ----
  const s7 = section('Anti-patterns — and where we fixed them', 'Four classic mistakes, each with the file where this codebase does it right.');
  const s7Card = card('Anti-pattern table', '');
  const s7Wrap = h('div', { class: 'sb-table-wrap' });
  const s7t = h('table', { class: 'sb-table' });
  const s7h = h('tr', {});
  for (const t of ['Anti-pattern', 'Why it hurts', 'Where we fixed it']) s7h.appendChild(h('th', {}, t));
  s7t.appendChild(h('thead', {}, s7h));
  const s7b = h('tbody', {});
  const antis = [
    ['Forgot await', 'You get [object Promise] instead of data; downstream code crashes.', 'frontend/js/views/lab.js (Forgot-await card) · every endpoint call awaits'],
    ['await in a loop', 'N sequential round-trips instead of one parallel batch (≈3.2 s vs ≈0.4 s).', 'frontend/js/views/lab.js (Sequential vs Parallel) · frontend/js/views/bridge.js (Promise.all stats)'],
    ['Assuming 404 throws', 'fetch() resolves on 404 — res.ok is false but no exception; code “succeeds” with no data.', 'frontend/js/api/client.js (if (!res.ok) branch) · frontend/js/api/errors.js'],
    ['console.log in production', 'Leaks internals, pollutes consoles, can expose PII in shared machines.', 'eslint no-console rule · frontend/js/core/a11y.js announce() for user-facing status instead'],
  ];
  for (const [ap, why, where] of antis) {
    const tr = h('tr', {});
    tr.appendChild(h('td', {}, h('strong', {}, ap)));
    tr.appendChild(h('td', {}, why));
    const td = h('td', { class: 'sb-mono', style: 'font-size:12.5px;' }, where);
    tr.appendChild(td);
    s7b.appendChild(tr);
  }
  s7t.appendChild(s7b);
  s7Wrap.appendChild(s7t);
  s7Card.appendChild(s7Wrap);
  s7.appendChild(s7Card);
  view.appendChild(s7);

  // ---- 8. API reference ----
  const s8 = section('API reference', 'All 15 endpoints. “Try” jumps to the view where you can fire them for real.');
  const epGrid = h('div', { class: 'sb-doc-grid' });
  const endpoints = [
    ['GET', '/interns', 'Public', 'List with search/filter/sort/pagination', '200', '#/interns', 'frontend/js/api/endpoints.js → listInterns'],
    ['GET', '/interns/:id', 'Public', 'Read one intern', '200 · 404', '#/interns', 'frontend/js/api/endpoints.js → getIntern'],
    ['POST', '/interns', 'Editor+', 'Register; auto Idempotency-Key', '201 · 400 · 422 · 429', '#/interns', 'frontend/js/api/endpoints.js → createIntern'],
    ['PUT', '/interns/:id', 'Editor+', 'Replace whole intern', '200 · 400 · 401 · 403 · 404 · 422', '#/interns', 'frontend/js/api/endpoints.js → replaceIntern'],
    ['PATCH', '/interns/:id', 'Editor+', 'Partial update (e.g. phone)', '200 · 400 · 401 · 403 · 404 · 422', '#/interns', 'frontend/js/api/endpoints.js → patchIntern'],
    ['DELETE', '/interns/:id', 'Admin', 'Remove; 404 treated as success', '204 · 401 · 403 · 404', '#/interns', 'frontend/js/api/endpoints.js → deleteIntern'],
    ['GET', '/tracks', 'Public', 'Track list for filters', '200', '#/interns', 'frontend/js/api/endpoints.js → listTracks'],
    ['GET', '/stats', 'Admin', 'Aggregate tiles', '200 · 401 · 403', '#/bridge', 'frontend/js/api/endpoints.js → getStats'],
    ['GET', '/health', 'Public', 'Liveness probe', '200', '#/bridge', 'frontend/js/api/endpoints.js → health'],
    ['GET', '/demo/status/:code', 'Public', 'Return any status code', 'any', '#/lab', 'frontend/js/api/endpoints.js → demoStatus'],
    ['GET', '/demo/slow', 'Public', 'Delayed response (?ms=)', '200 · timeout', '#/lab', 'frontend/js/api/endpoints.js → demoSlow'],
    ['GET', '/demo/flaky', 'Public', 'Fails N times, then succeeds', '500 → 200', '#/lab', 'frontend/js/api/endpoints.js → demoFlaky'],
    ['GET', '/demo/bad-body', 'Public', 'Malformed bodies (?kind=)', '200 + parse error', '#/lab', 'frontend/js/api/endpoints.js → demoBadBody'],
    ['GET', '/demo/echo', 'Public', 'Echo request (CORS simple)', '200', '#/lab', 'frontend/js/api/endpoints.js → demoEcho'],
    ['GET', '/demo/requests', 'Public', 'Server request log', '200', '#/trace', 'frontend/js/api/endpoints.js → demoRequests'],
  ];
  for (const [m, path, auth, desc, statuses, hash, impl] of endpoints) {
    const ec = card('', '');
    ec.classList.add('sb-endpoint');
    const top = h('div', { class: 'top' });
    top.appendChild(methodPill(m));
    const pEl = h('code', { class: 'sb-mono', style: 'font-size:14px;' }, path);
    top.appendChild(pEl);
    ec.appendChild(top);
    ec.appendChild(h('div', { class: 'sb-row' },
      chip(auth, auth === 'Public' ? 'emerald' : auth === 'Admin' ? 'rose' : 'amber'),
      chip(statuses, 'ghost')));
    ec.appendChild(h('p', { class: 'sb-muted', style: 'font-size:13.5px;margin:0;line-height:1.55;' }, desc));
    ec.appendChild(file(impl));
    const brow = h('div', {});
    brow.appendChild(go(hash, 'Try it →'));
    ec.appendChild(brow);
    epGrid.appendChild(ec);
  }
  s8.appendChild(epGrid);
  view.appendChild(s8);

  // ---- 9. Coverage checklist ----
  const s9 = section('Brief coverage checklist', 'Every requirement in the project brief, mapped to where it is implemented.');
  const s9Card = card('Requirement → implementation', '');
  const s9Wrap = h('div', { class: 'sb-table-wrap' });
  const s9t = h('table', { class: 'sb-table' });
  const s9h = h('tr', {});
  for (const t of ['Requirement', 'View', 'File']) s9h.appendChild(h('th', {}, t));
  s9t.appendChild(h('thead', {}, s9h));
  const s9b = h('tbody', {});
  const coverage = [
    ['Send requests', 'Bridge · Lab', 'frontend/js/views/bridge.js · frontend/js/views/lab.js'],
    ['Display dynamic data', 'Bridge · Interns', 'frontend/js/views/bridge.js · frontend/js/views/interns.js'],
    ['Handle errors', 'Interns · Lab · Trace', 'frontend/js/api/errors.js · frontend/js/views/lab.js'],
    ['I-P-O architecture', 'Bridge · Docs', 'frontend/js/views/bridge.js · frontend/js/views/docs.js'],
    ['REST + idempotency', 'Interns · Docs', 'frontend/js/views/interns.js (Idempotency-Key) · frontend/js/views/docs.js'],
    ['Nouns + stateless', 'Docs', 'frontend/js/views/docs.js (REST matrix)'],
    ['Frozen page', 'Lab', 'frontend/js/views/lab.js (Async Lab)'],
    ['async-await', 'Lab · all views', 'frontend/js/views/lab.js · no .then() anywhere'],
    ['fetch skeleton', 'Docs', 'frontend/js/views/docs.js (anatomy) · frontend/js/api/client.js'],
    ['CORS', 'Lab', 'frontend/js/views/lab.js (CORS Lab + preflight proof)'],
    ['Status codes', 'Lab · Docs', 'frontend/js/views/lab.js (Status Lab) · frontend/js/views/docs.js'],
    ['JSON', 'Docs', 'frontend/js/views/docs.js (border crossing + playground)'],
    ['DOM injection', 'Interns · Docs', 'frontend/js/core/dom.js · frontend/js/views/interns.js (textContent only)'],
    ['try-catch-finally', 'All views', 'Shield pattern in every data load'],
    ['Anti-patterns', 'Docs · Lab', 'frontend/js/views/docs.js · frontend/js/views/lab.js'],
    ['Lifecycle', 'Trace', 'frontend/js/trace/lifecycle.js · frontend/js/views/trace.js'],
  ];
  for (const [req, vw, fp] of coverage) {
    const tr = h('tr', {});
    tr.appendChild(h('td', {}, h('strong', {}, req)));
    tr.appendChild(h('td', {}, vw));
    tr.appendChild(h('td', { class: 'sb-mono', style: 'font-size:12.5px;' }, fp));
    s9b.appendChild(tr);
  }
  s9t.appendChild(s9b);
  s9Wrap.appendChild(s9t);
  s9Card.appendChild(s9Wrap);
  s9.appendChild(s9Card);
  view.appendChild(s9);

  root.appendChild(view);
  announce('Docs loaded: 9 concept sections.');

  return undefined;
}
