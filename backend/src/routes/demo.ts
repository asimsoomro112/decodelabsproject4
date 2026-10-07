import { Router } from 'express';
import { getRequestId } from '../middleware/requestId.js';
import { getRequestLog } from '../middleware/requestLog.js';
import { badRequest } from '../problem.js';
import { sendProblem } from '../problem.js';

const SUPPORTED_STATUS_CODES = [200, 201, 204, 400, 401, 403, 404, 422, 429, 500, 502, 503];

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

const MAX_SLOW_MS = 10_000;

/** Demo/test-aid endpoints: status codes, latency, flakiness, broken bodies. */
export function makeDemoRouter() {
  const router = Router();
  const flakyAttempts = new Map<string, number>();

  // GET /api/v1/demo/status/:code
  router.get('/status/:code', (req, res) => {
    const rawCode = req.params.code;
    const code = parseInt(Array.isArray(rawCode) ? (rawCode[0] ?? '') : rawCode, 10);
    if (!Number.isInteger(code) || !SUPPORTED_STATUS_CODES.includes(code)) {
      throw badRequest(`Unsupported status code. Supported: ${SUPPORTED_STATUS_CODES.join(', ')}.`);
    }
    if (code === 200) {
      res.json({ ok: true });
      return;
    }
    if (code === 201) {
      res.status(201).json({ ok: true, created: true });
      return;
    }
    if (code === 204) {
      res.status(204).end();
      return;
    }
    if (code === 429 || code === 503) res.setHeader('Retry-After', '5');
    sendProblem(res, req, {
      status: code,
      title: STATUS_TITLES[code] ?? 'Error',
      detail: `Demo response with status ${code}.`,
      type: `demo-status-${code}`,
    });
  });

  // GET /api/v1/demo/slow?ms= — waits, then answers. Clamped to 0..10000ms.
  router.get('/slow', async (req, res) => {
    const raw = req.query.ms;
    const ms = raw === undefined ? 1000 : Number(raw);
    if (!Number.isFinite(ms) || Math.floor(ms) !== ms || ms < 0) {
      throw badRequest('Invalid ms: must be a non-negative integer.');
    }
    const waitedMs = Math.min(ms, MAX_SLOW_MS);
    await new Promise((resolve) => setTimeout(resolve, waitedMs));
    res.json({ ok: true, waitedMs });
  });

  // GET /api/v1/demo/flaky?key=&failFirst= — fails N times with 503, then 200.
  router.get('/flaky', (req, res) => {
    const key = req.query.key;
    if (typeof key !== 'string' || key.length === 0) {
      throw badRequest('Query parameter "key" is required.');
    }
    const rawFailFirst = req.query.failFirst;
    const failFirst = rawFailFirst === undefined ? 2 : Number(rawFailFirst);
    if (!Number.isInteger(failFirst) || failFirst < 0) {
      throw badRequest('Invalid failFirst: must be an integer >= 0.');
    }
    const attempts = (flakyAttempts.get(key) ?? 0) + 1;
    flakyAttempts.set(key, attempts);
    if (attempts <= failFirst) {
      res.setHeader('Retry-After', '2');
      sendProblem(res, req, {
        status: 503,
        title: 'Service Unavailable',
        detail: `Flaky demo failing (attempt ${attempts} of ${failFirst} planned failures).`,
        type: 'flaky-failure',
      });
      return;
    }
    res.json({ ok: true, key, attempts });
  });

  // GET /api/v1/demo/bad-body?mode= — intentionally malformed responses.
  router.get('/bad-body', (req, res) => {
    const mode = req.query.mode;
    if (mode === 'html') {
      res.type('text/html').send('<h1>Not JSON</h1>');
      return;
    }
    if (mode === 'truncated-json') {
      res.type('application/json').send('{"broken": true,');
      return;
    }
    if (mode === 'empty') {
      res.status(200).end();
      return;
    }
    throw badRequest('Invalid mode. Supported: html, truncated-json, empty.');
  });

  // GET /api/v1/demo/echo — shows what the server saw. NEVER echoes token values.
  router.get('/echo', (req, res) => {
    const authorization = req.get('authorization');
    const scheme = authorization ? (authorization.split(' ')[0] ?? '') : '';
    // Approximation: was there an OPTIONS preflight to this path in the last 10s?
    const cutoff = Date.now() - 10_000;
    const preflightSeen = getRequestLog().some(
      (entry) =>
        entry.method === 'OPTIONS' &&
        entry.path === '/api/v1/demo/echo' &&
        new Date(entry.timestamp).getTime() >= cutoff,
    );
    res.json({
      method: req.method,
      path: req.baseUrl + req.path,
      origin: req.get('origin') ?? null,
      requestId: getRequestId(req),
      preflightSeen,
      headers: {
        contentType: req.get('content-type') ?? null,
        authorization: { present: authorization !== undefined, scheme: scheme || null },
        idempotencyKeyPresent: req.get('Idempotency-Key') !== undefined,
        xRequestId: req.get('x-request-id') ?? null,
      },
    });
  });

  // GET /api/v1/demo/requests — last 100 requests seen by the server.
  router.get('/requests', (_req, res) => {
    res.json({ data: getRequestLog() });
  });

  return router;
}
