/**
 * Ambient "bridge" background: a fixed full-viewport canvas (pointer-events
 * none, aria-hidden) showing two glowing nodes — BROWSER and SERVER — joined
 * by a curved bridge of fibers with parallax drift, neural-mesh particles and
 * aurora blobs in the brand palette (mocha #A5856F, ethereal #A0D4E0,
 * moonlit #F2F0EA).
 *
 * Subscribes to request:* events:
 * - request:start → packet spawns, node → node, speed ∝ recent real latency
 * - request:end → packet colored by outcome (emerald 2xx, amber 4xx, rose 5xx)
 * - preflight → ghost dashed packet first
 * - retry attempt → smaller packet with ↻
 * - timeout → packet fades to "?" mid-bridge
 * - offline → bridge dims and frays
 *
 * Perf: DPR capped at 2, particle count ∝ viewport, pauses on hidden tabs,
 * single rAF loop, ResizeObserver, reduced-motion → one static frame.
 * Honors `document.body.dataset.bg === 'off'`.
 *
 * @module bg/bridge-canvas
 */

import { on } from '../core/events.js';
import { API_BASE_URL } from '../config.js';

const MOCHA = '#A5856F';
const ETHEREAL = '#A0D4E0';
const MOONLIT = '#F2F0EA';
const EMERALD = '#34d399';
const AMBER = '#fbbf24';
const ROSE = '#fb7185';

/**
 * @typedef {Object} Packet
 * @property {string} traceId
 * @property {number} t Progress 0..1 along the bridge.
 * @property {number} speed Progress per second.
 * @property {string} color Current color.
 * @property {'normal'|'ghost'|'retry'|'lost'} kind Packet kind.
 * @property {number} alpha Opacity.
 * @property {boolean} settled Whether the outcome is known.
 */

/**
 * Host part of a URL with fallback.
 * @param {string} url URL to parse.
 * @param {string} fallback Fallback host.
 * @returns {string} Host.
 */
function hostOf(url, fallback) {
  try {
    return new URL(url).host || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Initialize the ambient background canvas.
 * @returns {() => void} Cleanup function.
 */
export function initBackground() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('bg'));
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const serverHost = hostOf(API_BASE_URL, window.location.host);
  const browserHost = window.location.host || 'localhost:5173';

  /** @type {{ w: number, h: number, dpr: number, mobile: boolean }} */
  const view = { w: 0, h: 0, dpr: 1, mobile: false };
  /** @type {Packet[]} */
  const packets = [];
  /** @type {{ x: number, y: number, r: number, vx: number, vy: number, hue: string, a: number }[]} */
  let particles = [];
  /** @type {{ x: number, y: number, r: number, color: string, phase: number, speed: number }[]} */
  const blobs = [
    { x: 0.22, y: 0.28, r: 0.42, color: MOCHA, phase: 0, speed: 0.11 },
    { x: 0.78, y: 0.72, r: 0.46, color: ETHEREAL, phase: 2.1, speed: 0.09 },
    { x: 0.55, y: 0.15, r: 0.3, color: MOONLIT, phase: 4.2, speed: 0.07 },
  ];
  const fibers = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
    offset: (i - 3) * 26,
    phase: i * 0.9,
    width: i === 3 ? 2.2 : 1.1,
    alpha: i === 3 ? 0.5 : 0.22,
  }));
  /** @type {{ x: number, y: number }} Parallax target/current. */
  const parallax = { x: 0, y: 0 };
  const parallaxGoal = { x: 0, y: 0 };
  let raf = 0;
  let running = false;
  let offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  let lastDurationMs = 900; // rolling average of real latencies
  let lastFrame = 0;

  /** Node positions for the current viewport. */
  function nodes() {
    if (view.mobile) {
      return {
        a: { x: view.w * 0.5, y: view.h * 0.16, label: 'BROWSER', host: browserHost },
        b: { x: view.w * 0.5, y: view.h * 0.84, label: 'SERVER', host: serverHost },
      };
    }
    return {
      a: { x: view.w * 0.15, y: view.h * 0.5, label: 'BROWSER', host: browserHost },
      b: { x: view.w * 0.85, y: view.h * 0.5, label: 'SERVER', host: serverHost },
    };
  }

  /** Cubic bezier point between nodes with a perpendicular offset. */
  function bridgePoint(t, offset, wobble) {
    const { a, b } = nodes();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bow = Math.sin(t * Math.PI) * (view.mobile ? -60 : -46);
    const wob = Math.sin(wobble) * 10;
    const cx1 = a.x + dx * 0.3 + nx * (bow + offset + wob);
    const cy1 = a.y + dy * 0.3 + ny * (bow + offset + wob);
    const cx2 = a.x + dx * 0.7 + nx * (bow + offset - wob);
    const cy2 = a.y + dy * 0.7 + ny * (bow + offset - wob);
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * b.y,
    };
  }

  /** Resize the canvas to the viewport (DPR capped at 2). */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = dpr;
    view.mobile = view.w < 768;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(140, Math.max(36, (view.w * view.h) / 22000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * view.w,
      y: Math.random() * view.h,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      hue: [MOCHA, ETHEREAL, MOONLIT][Math.floor(Math.random() * 3)],
      a: 0.12 + Math.random() * 0.3,
    }));
  }

  /** Draw one frame. @param {number} time rAF timestamp. */
  function draw(time) {
    const bgOff = document.body.dataset.bg === 'off';
    if (bgOff) {
      ctx.clearRect(0, 0, view.w, view.h);
      return;
    }
    const dt = Math.min(0.05, (time - lastFrame) / 1000 || 0.016);
    lastFrame = time;
    const t = time / 1000;

    parallax.x += (parallaxGoal.x - parallax.x) * 0.04;
    parallax.y += (parallaxGoal.y - parallax.y) * 0.04;

    ctx.clearRect(0, 0, view.w, view.h);

    // Aurora blobs.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const blob of blobs) {
      const bx = (blob.x + Math.sin(t * blob.speed + blob.phase) * 0.05) * view.w + parallax.x * 22;
      const by = (blob.y + Math.cos(t * blob.speed * 1.3 + blob.phase) * 0.05) * view.h + parallax.y * 22;
      const br = blob.r * Math.min(view.w, view.h);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, `${blob.color}2e`);
      g.addColorStop(1, `${blob.color}00`);
      ctx.fillStyle = g;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    ctx.restore();

    // Neural-mesh particles.
    for (const p of particles) {
      p.x += (p.vx + parallax.x * 8) * dt;
      p.y += (p.vy + parallax.y * 8) * dt;
      if (p.x < -10) p.x = view.w + 10;
      if (p.x > view.w + 10) p.x = -10;
      if (p.y < -10) p.y = view.h + 10;
      if (p.y > view.h + 10) p.y = -10;
      ctx.globalAlpha = p.a * (offline ? 0.4 : 1);
      ctx.fillStyle = p.hue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Bridge fibers.
    const { a, b } = nodes();
    const bridgeAlpha = offline ? 0.35 : 1;
    for (const fiber of fibers) {
      ctx.strokeStyle = fiber.width > 2 ? ETHEREAL : MOCHA;
      ctx.globalAlpha = fiber.alpha * bridgeAlpha;
      ctx.lineWidth = fiber.width;
      if (offline) ctx.setLineDash([6, 8]);
      ctx.beginPath();
      for (let i = 0; i <= 48; i += 1) {
        const pt = bridgePoint(i / 48, fiber.offset, t * 0.7 + fiber.phase);
        const px = pt.x + parallax.x * 14;
        const py = pt.y + parallax.y * 14;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // Packets.
    for (let i = packets.length - 1; i >= 0; i -= 1) {
      const pkt = packets[i];
      if (pkt.kind !== 'lost') {
        pkt.t += pkt.speed * dt;
        if (pkt.t >= 1) {
          packets.splice(i, 1);
          continue;
        }
      } else {
        pkt.alpha -= dt * 0.7;
        if (pkt.alpha <= 0) {
          packets.splice(i, 1);
          continue;
        }
      }
      const pt = bridgePoint(Math.min(1, pkt.t), 0, t * 0.7 + 2.7);
      const px = pt.x + parallax.x * 14;
      const py = pt.y + parallax.y * 14;
      if (pkt.kind === 'lost') {
        ctx.globalAlpha = Math.max(0, pkt.alpha);
        ctx.fillStyle = AMBER;
        ctx.font = '600 16px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', px, py);
        ctx.globalAlpha = 1;
        continue;
      }
      const size = pkt.kind === 'retry' ? 3 : 4.5;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, size * 4);
      glow.addColorStop(0, pkt.color);
      glow.addColorStop(1, `${pkt.color}00`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, size * 4, 0, Math.PI * 2);
      ctx.fill();
      if (pkt.kind === 'ghost') {
        ctx.strokeStyle = pkt.color;
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(px, py, size + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px, py, size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pkt.kind === 'retry') {
        ctx.fillStyle = pkt.color;
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('↻', px, py - 9);
      }
    }

    // Nodes.
    for (const node of [a, b]) {
      const isBrowser = node === a;
      const color = isBrowser ? ETHEREAL : MOCHA;
      const pulse = 1 + Math.sin(t * 2 + (isBrowser ? 0 : Math.PI)) * 0.08;
      const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 44 * pulse);
      glow.addColorStop(0, `${color}66`);
      glow.addColorStop(1, `${color}00`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 44 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14100d';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(242, 240, 234, 0.85)';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      const labelY = view.mobile ? (isBrowser ? node.y + 38 : node.y - 30) : node.y + 38;
      ctx.fillText(node.label, node.x, labelY);
      ctx.fillStyle = 'rgba(242, 240, 234, 0.5)';
      ctx.font = '400 10px "IBM Plex Mono", monospace';
      ctx.fillText(node.host, node.x, labelY + 14);
    }
  }

  /** Single static frame for reduced motion. */
  function drawStatic() {
    lastFrame = 0;
    draw(16);
  }

  /** Start the rAF loop. */
  function start() {
    if (running || reducedMotion) return;
    running = true;
    lastFrame = performance.now();
    const loop = (time) => {
      if (!running) return;
      draw(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  /** Stop the rAF loop. */
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  /** Spawn a packet for a new request. @param {string} traceId */
  function spawnPacket(traceId) {
    const travelMs = Math.min(4000, Math.max(350, lastDurationMs));
    packets.push({
      traceId,
      t: 0,
      speed: 1 / (travelMs / 1000),
      color: ETHEREAL,
      kind: 'normal',
      alpha: 1,
      settled: false,
    });
  }

  /** Find the unsettled packet for a trace. @param {string} traceId @returns {Packet|undefined} */
  function findPacket(traceId) {
    return packets.find((p) => p.traceId === traceId && !p.settled);
  }

  on('request:start', (d) => spawnPacket(d.traceId));
  on('request:preflight-suspected', (d) => {
    const ghost = findPacket(d.traceId);
    if (ghost) {
      packets.push({
        traceId: `${d.traceId}:preflight`,
        t: Math.max(0, ghost.t - 0.12),
        speed: ghost.speed * 1.25,
        color: MOONLIT,
        kind: 'ghost',
        alpha: 1,
        settled: false,
      });
    }
  });
  on('request:attempt', (d) => {
    if (d.attempt > 1) {
      const orig = findPacket(d.traceId);
      packets.push({
        traceId: `${d.traceId}:retry${d.attempt}`,
        t: orig ? orig.t * 0.4 : 0,
        speed: (orig ? orig.speed : 1.2) * 1.4,
        color: AMBER,
        kind: 'retry',
        alpha: 1,
        settled: false,
      });
    }
  });
  on('request:end', (d) => {
    const pkt = findPacket(d.traceId);
    if (d.durationMs) lastDurationMs = lastDurationMs * 0.7 + d.durationMs * 0.3;
    if (pkt) {
      pkt.settled = true;
      pkt.color = d.status >= 500 ? ROSE : d.status >= 400 ? AMBER : EMERALD;
    }
  });
  on('request:error', (d) => {
    const pkt = findPacket(d.traceId);
    if (!pkt) return;
    if (d.kind === 'timeout') {
      pkt.kind = 'lost';
      pkt.alpha = 1;
    } else {
      pkt.settled = true;
      pkt.color = d.kind === 'abort' ? MOONLIT : ROSE;
    }
  });

  window.addEventListener('online', () => {
    offline = false;
  });
  window.addEventListener('offline', () => {
    offline = true;
  });
  window.addEventListener('pointermove', (e) => {
    parallaxGoal.x = (e.clientX / window.innerWidth - 0.5) * 2;
    parallaxGoal.y = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!reducedMotion) start();
  });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(document.documentElement);
  } else {
    window.addEventListener('resize', resize);
  }

  resize();
  if (reducedMotion) {
    drawStatic();
  } else {
    start();
  }

  return () => {
    stop();
  };
}
