import { before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Response as SuperAgentResponse } from 'superagent';
import { buildApp } from '../src/app.js';
import type { BuiltApp } from '../src/app.js';
import { seedStore } from '../src/store/seed.js';

const EDITOR_TOKEN = 'test-editor-token';
const ADMIN_TOKEN = 'test-admin-token';
const ALLOWED_ORIGIN = 'http://localhost:5173';

const BASE_OVERRIDES = {
  rateLimitGeneralPerMin: 100_000,
  rateLimitWritesPerMin: 100_000,
  editorToken: EDITOR_TOKEN,
  adminToken: ADMIN_TOKEN,
};

function validIntern(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Intern ${randomUUID().slice(0, 8)}`,
    email: `${randomUUID()}@example.com`,
    phone: '+92 300 0000000',
    track: 'backend',
    ...overrides,
  };
}

describe('SynapseBridge API', () => {
  let built: BuiltApp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any;

  before(async () => {
    built = await buildApp(BASE_OVERRIDES);
    api = request(built.app);
  });

  beforeEach(async () => {
    await seedStore(built.store);
  });

  // ---------- health ----------
  test('GET /api/v1/health returns 200 with service info', async () => {
    const res = await api.get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.version, '1.0.0');
    assert.equal(res.body.store, 'memory');
    assert.ok(typeof res.body.uptimeSec === 'number');
    assert.ok(typeof res.body.timestamp === 'string');
  });

  // ---------- tracks ----------
  test('GET /api/v1/tracks returns all 6 tracks with counts', async () => {
    const res = await api.get('/api/v1/tracks');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 6);
    const total = res.body.reduce((sum: number, t: { count: number }) => sum + t.count, 0);
    assert.equal(total, 14);
    for (const row of res.body) {
      assert.ok(typeof row.track === 'string');
      assert.ok(typeof row.count === 'number');
    }
  });

  // ---------- list ----------
  test('GET /api/v1/interns returns paginated list with meta', async () => {
    const res = await api.get('/api/v1/interns');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 12);
    assert.deepEqual(res.body.meta, { page: 1, pageSize: 12, total: 14, totalPages: 2 });
  });

  test('GET /api/v1/interns pagination page=2&pageSize=5', async () => {
    const res = await api.get('/api/v1/interns?page=2&pageSize=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 5);
    assert.equal(res.body.meta.page, 2);
    assert.equal(res.body.meta.pageSize, 5);
    assert.equal(res.body.meta.total, 14);
    assert.equal(res.body.meta.totalPages, 3);
  });

  test('GET /api/v1/interns search finds by name/email', async () => {
    const res = await api.get('/api/v1/interns?search=asim');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, 'Muhammad Asim');
  });

  test('GET /api/v1/interns filters by track', async () => {
    const res = await api.get('/api/v1/interns?track=frontend');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 3);
    for (const item of res.body.data) assert.equal(item.track, 'frontend');
  });

  test('GET /api/v1/interns filters by status', async () => {
    const res = await api.get('/api/v1/interns?status=applied');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 3);
    for (const item of res.body.data) assert.equal(item.status, 'applied');
  });

  test('GET /api/v1/interns sorts by name ascending', async () => {
    const res = await api.get('/api/v1/interns?sort=name&order=asc&pageSize=100');
    assert.equal(res.status, 200);
    const names = res.body.data.map((i: { name: string }) => i.name);
    for (let i = 1; i < names.length; i++) {
      assert.ok(names[i - 1].localeCompare(names[i]) <= 0, `${names[i - 1]} should sort before ${names[i]}`);
    }
  });

  test('GET /api/v1/interns 400 on non-numeric page', async () => {
    const res = await api.get('/api/v1/interns?page=abc');
    assert.equal(res.status, 400);
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  test('GET /api/v1/interns 422 on page=0', async () => {
    const res = await api.get('/api/v1/interns?page=0');
    assert.equal(res.status, 422);
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.some((e: { field: string }) => e.field === 'page'));
  });

  test('GET /api/v1/interns 422 on pageSize=200', async () => {
    const res = await api.get('/api/v1/interns?pageSize=200');
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.some((e: { field: string }) => e.field === 'pageSize'));
  });

  // ---------- get by id ----------
  test('GET /api/v1/interns/:id returns 200 for a known id', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const res = await api.get(`/api/v1/interns/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, id);
  });

  test('GET /api/v1/interns/:id returns 400 for a malformed id', async () => {
    const res = await api.get('/api/v1/interns/not-a-uuid');
    assert.equal(res.status, 400);
  });

  test('GET /api/v1/interns/:id returns 404 for an unknown uuid', async () => {
    const res = await api.get(`/api/v1/interns/${randomUUID()}`);
    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  // ---------- create ----------
  test('POST /api/v1/interns creates with 201 + Location', async () => {
    const res = await api.post('/api/v1/interns').send(validIntern());
    assert.equal(res.status, 201);
    assert.match(res.headers.location, /^\/api\/v1\/interns\//);
    assert.ok(typeof res.body.id === 'string');
    assert.equal(res.body.track, 'backend');
    assert.ok(typeof res.headers['x-request-id'] === 'string');
  });

  test('POST /api/v1/interns defaults status to applied', async () => {
    const payload = validIntern();
    const res = await api.post('/api/v1/interns').send(payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'applied');
    assert.equal(res.body.email, payload.email.toLowerCase());
  });

  test('POST /api/v1/interns 400 on malformed JSON', async () => {
    const res = await api
      .post('/api/v1/interns')
      .set('Content-Type', 'application/json')
      .send('{"name": broken');
    assert.equal(res.status, 400);
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  test('POST /api/v1/interns 415 on non-JSON content type', async () => {
    const res = await api.post('/api/v1/interns').set('Content-Type', 'text/plain').send('hello');
    assert.equal(res.status, 415);
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  test('POST /api/v1/interns 422 on bad email with field errors', async () => {
    const res = await api.post('/api/v1/interns').send(validIntern({ email: 'not-an-email' }));
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.some((e: { field: string }) => e.field === 'email'));
  });

  test('POST /api/v1/interns 422 on missing name', async () => {
    const payload = validIntern();
    delete (payload as Record<string, unknown>).name;
    const res = await api.post('/api/v1/interns').send(payload);
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.some((e: { field: string }) => e.field === 'name'));
  });

  test('POST /api/v1/interns 422 on bad phone', async () => {
    const res = await api.post('/api/v1/interns').send(validIntern({ phone: 'abc' }));
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.some((e: { field: string }) => e.field === 'phone'));
  });

  test('POST /api/v1/interns 422 on bad track', async () => {
    const res = await api.post('/api/v1/interns').send(validIntern({ track: 'wizardry' }));
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.some((e: { field: string }) => e.field === 'track'));
  });

  test('POST /api/v1/interns 409 on duplicate email (case-insensitive)', async () => {
    const res = await api
      .post('/api/v1/interns')
      .send(validIntern({ email: 'AHMED.RAZA@EXAMPLE.COM' }));
    assert.equal(res.status, 409);
    assert.ok(String(res.body.detail).toLowerCase().includes('ahmed.raza@example.com'));
  });

  test('POST /api/v1/interns idempotent replay returns same resource', async () => {
    const key = `key-${randomUUID()}`;
    const payload = validIntern();
    const first = await api.post('/api/v1/interns').set('Idempotency-Key', key).send(payload);
    assert.equal(first.status, 201);
    assert.ok(!('idempotent-replay' in first.headers));
    const second = await api.post('/api/v1/interns').set('Idempotency-Key', key).send(payload);
    assert.equal(second.status, 201);
    assert.equal(second.headers['idempotent-replay'], 'true');
    assert.equal(second.body.id, first.body.id);
    assert.equal(second.headers.location, first.headers.location);
    const list = await api.get('/api/v1/interns?pageSize=100');
    assert.equal(list.body.meta.total, 15);
  });

  // ---------- replace ----------
  test('PUT /api/v1/interns/:id replaces with 200 (editor token)', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const res = await api
      .put(`/api/v1/interns/${id}`)
      .set('Authorization', `Bearer ${EDITOR_TOKEN}`)
      .send({ name: 'Replaced Name', email: 'replaced@example.com', track: 'data', status: 'completed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Replaced Name');
    assert.equal(res.body.track, 'data');
    assert.ok(!('phone' in res.body) || res.body.phone === undefined);
  });

  test('PUT /api/v1/interns/:id 422 on missing required field', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const res = await api
      .put(`/api/v1/interns/${id}`)
      .set('Authorization', `Bearer ${EDITOR_TOKEN}`)
      .send({ name: 'No Email', track: 'data', status: 'active' });
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.some((e: { field: string }) => e.field === 'email'));
  });

  test('PUT /api/v1/interns/:id 401 without token (+WWW-Authenticate)', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const res = await api.put(`/api/v1/interns/${id}`).send(validIntern());
    assert.equal(res.status, 401);
    assert.equal(res.headers['www-authenticate'], 'Bearer realm="demo"');
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  test('PUT /api/v1/interns/:id 404 for unknown uuid (editor token)', async () => {
    const res = await api
      .put(`/api/v1/interns/${randomUUID()}`)
      .set('Authorization', `Bearer ${EDITOR_TOKEN}`)
      .send({ name: 'Ghost', email: 'ghost@example.com', track: 'data', status: 'active' });
    assert.equal(res.status, 404);
  });

  // ---------- patch ----------
  test('PATCH /api/v1/interns/:id updates phone only (editor token)', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const res = await api
      .patch(`/api/v1/interns/${id}`)
      .set('Authorization', `Bearer ${EDITOR_TOKEN}`)
      .send({ phone: '+92 300 9998888' });
    assert.equal(res.status, 200);
    assert.equal(res.body.phone, '+92 300 9998888');
    assert.equal(res.body.id, id);
  });

  test('PATCH /api/v1/interns/:id 422 on empty body', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const res = await api
      .patch(`/api/v1/interns/${id}`)
      .set('Authorization', `Bearer ${EDITOR_TOKEN}`)
      .send({});
    assert.equal(res.status, 422);
  });

  test('PATCH /api/v1/interns/:id 409 on duplicate email', async () => {
    const list = await api.get('/api/v1/interns?pageSize=2');
    const [a, b] = list.body.data;
    const res = await api
      .patch(`/api/v1/interns/${a.id}`)
      .set('Authorization', `Bearer ${EDITOR_TOKEN}`)
      .send({ email: b.email.toUpperCase() });
    assert.equal(res.status, 409);
  });

  // ---------- delete ----------
  test('DELETE /api/v1/interns/:id 204 then 404 (admin token)', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const del = await api.delete(`/api/v1/interns/${id}`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    assert.equal(del.status, 204);
    assert.equal(del.text, '');
    const get = await api.get(`/api/v1/interns/${id}`);
    assert.equal(get.status, 404);
  });

  test('DELETE /api/v1/interns/:id 403 with editor token', async () => {
    const list = await api.get('/api/v1/interns?pageSize=1');
    const id = list.body.data[0].id;
    const res = await api.delete(`/api/v1/interns/${id}`).set('Authorization', `Bearer ${EDITOR_TOKEN}`);
    assert.equal(res.status, 403);
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  // ---------- admin ----------
  test('GET /api/v1/admin/stats 200 with admin token', async () => {
    const res = await api.get('/api/v1/admin/stats').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.totals.interns, 14);
    assert.equal(Object.keys(res.body.totals.byTrack).length, 6);
    assert.equal(Object.keys(res.body.totals.byStatus).length, 4);
    assert.ok(res.body.requestsServed >= 1);
  });

  test('GET /api/v1/admin/stats 401 without token', async () => {
    const res = await api.get('/api/v1/admin/stats');
    assert.equal(res.status, 401);
    assert.ok(res.body.requestId);
  });

  // ---------- demo/status ----------
  test('GET /api/v1/demo/status/:code returns each supported code', async () => {
    for (const code of [200, 201, 204, 400, 401, 403, 404, 422, 429, 500, 502, 503]) {
      const res = await api.get(`/api/v1/demo/status/${code}`);
      assert.equal(res.status, code, `expected ${code}`);
      if (code === 200) assert.deepEqual(res.body, { ok: true });
      if (code === 201) assert.deepEqual(res.body, { ok: true, created: true });
      if (code >= 400) assert.match(res.headers['content-type'], /application\/problem\+json/);
      if (code === 429 || code === 503) assert.equal(res.headers['retry-after'], '5');
    }
  });

  test('GET /api/v1/demo/status/999 returns 400', async () => {
    const res = await api.get('/api/v1/demo/status/999');
    assert.equal(res.status, 400);
  });

  // ---------- demo/flaky ----------
  test('GET /api/v1/demo/flaky fails exactly N times then succeeds', async () => {
    const key = `flaky-${randomUUID()}`;
    for (let i = 1; i <= 3; i++) {
      const res = await api.get(`/api/v1/demo/flaky?key=${key}&failFirst=3`);
      assert.equal(res.status, 503, `attempt ${i} should fail`);
      assert.equal(res.headers['retry-after'], '2');
    }
    const ok = await api.get(`/api/v1/demo/flaky?key=${key}&failFirst=3`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.key, key);
    assert.equal(ok.body.attempts, 4);
  });

  test('GET /api/v1/demo/flaky 400 without key', async () => {
    const res = await api.get('/api/v1/demo/flaky');
    assert.equal(res.status, 400);
  });

  // ---------- demo/bad-body ----------
  test('GET /api/v1/demo/bad-body?mode=html returns text/html', async () => {
    const res = await api.get('/api/v1/demo/bad-body?mode=html');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.text.includes('<h1>Not JSON</h1>'));
  });

  test('GET /api/v1/demo/bad-body?mode=truncated-json returns invalid JSON', async () => {
    // Custom parser: superagent would otherwise throw parsing the broken JSON.
    const res = await api.get('/api/v1/demo/bad-body?mode=truncated-json').parse(
      (res: SuperAgentResponse, callback: (err: Error | null, body: { text: string }) => void) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => callback(null, { text }));
      },
    );
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    const raw = (res.body as { text: string }).text;
    assert.ok(raw.startsWith('{"broken"'));
    assert.throws(() => JSON.parse(raw));
  });

  test('GET /api/v1/demo/bad-body?mode=empty returns empty 200', async () => {
    const res = await api.get('/api/v1/demo/bad-body?mode=empty');
    assert.equal(res.status, 200);
    assert.equal(res.text, '');
  });

  test('GET /api/v1/demo/bad-body without mode returns 400', async () => {
    const res = await api.get('/api/v1/demo/bad-body');
    assert.equal(res.status, 400);
  });

  // ---------- demo/slow ----------
  test('GET /api/v1/demo/slow?ms=50 waits and reports', async () => {
    const res = await api.get('/api/v1/demo/slow?ms=50');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, waitedMs: 50 });
  });

  test('GET /api/v1/demo/slow?ms=abc returns 400', async () => {
    const res = await api.get('/api/v1/demo/slow?ms=abc');
    assert.equal(res.status, 400);
  });

  // ---------- demo/echo & demo/requests ----------
  test('GET /api/v1/demo/echo reports request shape without echoing secrets', async () => {
    const res = await api
      .get('/api/v1/demo/echo')
      .set('Authorization', 'Bearer supersecret123')
      .set('Idempotency-Key', 'echo-key');
    assert.equal(res.status, 200);
    assert.equal(res.body.method, 'GET');
    assert.equal(res.body.path, '/api/v1/demo/echo');
    assert.ok(typeof res.body.requestId === 'string');
    assert.equal(res.body.headers.authorization.present, true);
    assert.equal(res.body.headers.authorization.scheme, 'Bearer');
    assert.equal(res.body.headers.idempotencyKeyPresent, true);
    assert.ok(!JSON.stringify(res.body).includes('supersecret123'), 'must not echo token value');
  });

  test('GET /api/v1/demo/echo sees a preceding preflight', async () => {
    await api
      .options('/api/v1/demo/echo')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');
    const res = await api.get('/api/v1/demo/echo');
    assert.equal(res.body.preflightSeen, true);
  });

  test('GET /api/v1/demo/requests returns the request log', async () => {
    const res = await api.get('/api/v1/demo/requests');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 1);
    const entry = res.body.data[res.body.data.length - 1];
    assert.ok(typeof entry.requestId === 'string');
    assert.ok(typeof entry.method === 'string');
    assert.ok(typeof entry.path === 'string');
    assert.ok(typeof entry.status === 'number');
  });

  // ---------- routing errors ----------
  test('unknown route returns 404 problem+json with requestId', async () => {
    const res = await api.get('/api/v1/nope');
    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'], /application\/problem\+json/);
    assert.ok(res.body.requestId);
    assert.equal(res.body.status, 404);
  });

  test('PUT /api/v1/health returns 405 with Allow header', async () => {
    const res = await api.put('/api/v1/health').send({});
    assert.equal(res.status, 405);
    assert.ok(String(res.headers.allow).includes('GET'));
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  test('POST oversized body returns 413', async () => {
    const res = await api
      .post('/api/v1/interns')
      .send({ ...validIntern(), name: 'x'.repeat(11 * 1024) });
    assert.equal(res.status, 413);
    assert.match(res.headers['content-type'], /application\/problem\+json/);
  });

  // ---------- CORS ----------
  test('allowed origin receives access-control-allow-origin', async () => {
    const res = await api.get('/api/v1/health').set('Origin', ALLOWED_ORIGIN);
    assert.equal(res.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
  });

  test('preflight OPTIONS returns 204 with CORS headers', async () => {
    const res = await api
      .options('/api/v1/demo/echo')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');
    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-max-age'], '600');
    assert.ok(String(res.headers['access-control-expose-headers']).includes('X-Request-Id'));
  });

  test('disallowed origin gets no access-control-allow-origin header', async () => {
    const res = await api.get('/api/v1/health').set('Origin', 'http://evil.example');
    assert.ok(!('access-control-allow-origin' in res.headers));
    assert.equal(res.status, 200);
  });

  // ---------- request id & server timing ----------
  test('X-Request-Id is echoed back when supplied', async () => {
    const res = await api.get('/api/v1/health').set('X-Request-Id', 'req-123');
    assert.equal(res.headers['x-request-id'], 'req-123');
  });

  test('X-Request-Id is generated when absent', async () => {
    const res = await api.get('/api/v1/health');
    assert.ok(typeof res.headers['x-request-id'] === 'string');
    assert.ok(res.headers['x-request-id'].length >= 8);
  });

  test('Server-Timing header is present and well-formed', async () => {
    const res = await api.get('/api/v1/health');
    assert.match(String(res.headers['server-timing']), /app;dur=\d+/);
  });

  // ---------- problem+json shape ----------
  test('error bodies carry requestId (spot-check 404/422/401)', async () => {
    const notFoundRes = await api.get('/api/v1/nope');
    assert.ok(notFoundRes.body.requestId);
    const unprocessable = await api.post('/api/v1/interns').send(validIntern({ email: 'bad' }));
    assert.equal(unprocessable.status, 422);
    assert.ok(unprocessable.body.requestId);
    assert.match(unprocessable.headers['content-type'], /application\/problem\+json/);
    const unauthorizedRes = await api.get('/api/v1/admin/stats');
    assert.equal(unauthorizedRes.status, 401);
    assert.ok(unauthorizedRes.body.requestId);
    assert.match(unauthorizedRes.headers['content-type'], /application\/problem\+json/);
  });
});

describe('rate limiting', () => {
  let limitedApi: unknown;

  before(async () => {
    const built = await buildApp({
      ...BASE_OVERRIDES,
      rateLimitGeneralPerMin: 100_000,
      rateLimitWritesPerMin: 3,
    });
    await seedStore(built.store);
    limitedApi = request(built.app);
  });

  test('4th rapid write in a minute returns 429 with Retry-After', async () => {
    const client = limitedApi as ReturnType<typeof request>;
    for (let i = 0; i < 3; i++) {
      const res = await client.post('/api/v1/interns').send(validIntern());
      assert.equal(res.status, 201, `write ${i + 1} should succeed`);
    }
    const blocked = await client.post('/api/v1/interns').send(validIntern());
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['retry-after'], '60');
    assert.match(blocked.headers['content-type'], /application\/problem\+json/);
  });
});
