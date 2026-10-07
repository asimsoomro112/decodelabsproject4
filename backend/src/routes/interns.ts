import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { internCreateSchema, internPatchSchema, internReplaceSchema } from '../schemas/intern.js';
import { validateListQuery } from '../schemas/query.js';
import { ConflictError } from '../store/InternRepository.js';
import type { InternRepository } from '../store/InternRepository.js';
import { IdempotencyStore } from '../lib/idempotency.js';
import type { Role } from '../middleware/auth.js';
import { HttpProblem, badRequest, conflict, notFound } from '../problem.js';

const uuidSchema = z.uuid();

/** Express 5 types route params as string | string[] — unwrap to a string. */
function pathId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? (raw[0] ?? '') : raw;
}

function assertValidId(id: string): void {
  if (!uuidSchema.safeParse(id).success) {
    throw badRequest('Invalid intern id: expected a UUID.');
  }
}

function toConflict(err: ConflictError): HttpProblem {
  return conflict(`Email already registered: ${err.email}.`);
}

export interface InternsDeps {
  store: InternRepository;
  idempotency: IdempotencyStore;
  requireRoles: (...roles: Role[]) => RequestHandler;
}

export function makeInternsRouter(deps: InternsDeps) {
  const { store, idempotency, requireRoles } = deps;
  const router = Router();

  // GET /api/v1/interns — list with search/filter/sort/pagination
  router.get('/', async (req, res) => {
    const query = validateListQuery(req.query);
    const { items, total } = await store.list({
      search: query.search,
      track: query.track,
      status: query.status,
      sort: query.sort,
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    });
    res.json({
      data: items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  });

  // GET /api/v1/interns/:id
  router.get('/:id', async (req, res) => {
    const id = pathId(req);
    assertValidId(id);
    const intern = await store.get(id);
    if (!intern) throw notFound('Intern not found.');
    res.json(intern);
  });

  // POST /api/v1/interns — public; idempotency-key aware
  router.post('/', async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (key) {
      const replay = idempotency.get(key);
      if (replay) {
        if (replay.location) res.setHeader('Location', replay.location);
        res.setHeader('Idempotent-Replay', 'true');
        res.status(replay.statusCode).json(replay.body);
        return;
      }
    }
    const data = internCreateSchema.parse(req.body); // ZodError → 422
    let intern;
    try {
      intern = await store.create(data);
    } catch (err) {
      if (err instanceof ConflictError) throw toConflict(err);
      throw err;
    }
    const location = `/api/v1/interns/${intern.id}`;
    if (key) idempotency.set(key, { statusCode: 201, location, body: intern });
    res.setHeader('Location', location);
    res.status(201).json(intern);
  });

  // PUT /api/v1/interns/:id — full replacement, editor+
  router.put('/:id', requireRoles('editor', 'admin'), async (req, res) => {
    const id = pathId(req);
    assertValidId(id);
    const data = internReplaceSchema.parse(req.body); // ZodError → 422
    let intern;
    try {
      intern = await store.replace(id, data);
    } catch (err) {
      if (err instanceof ConflictError) throw toConflict(err);
      throw err;
    }
    if (!intern) throw notFound('Intern not found.');
    res.json(intern);
  });

  // PATCH /api/v1/interns/:id — partial update, editor+
  router.patch('/:id', requireRoles('editor', 'admin'), async (req, res) => {
    const id = pathId(req);
    assertValidId(id);
    const data = internPatchSchema.parse(req.body); // ZodError → 422 (incl. empty body)
    let intern;
    try {
      intern = await store.patch(id, data);
    } catch (err) {
      if (err instanceof ConflictError) throw toConflict(err);
      throw err;
    }
    if (!intern) throw notFound('Intern not found.');
    res.json(intern);
  });

  // DELETE /api/v1/interns/:id — admin only
  router.delete('/:id', requireRoles('admin'), async (req, res) => {
    const id = pathId(req);
    assertValidId(id);
    const removed = await store.remove(id);
    if (!removed) throw notFound('Intern not found.');
    res.status(204).end();
  });

  return router;
}
