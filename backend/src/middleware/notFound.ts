import type { NextFunction, Request, Response } from 'express';
import { sendProblem } from '../problem.js';

interface KnownRoute {
  pattern: RegExp;
  methods: string[];
}

/**
 * Known routes with their allowed methods. A known path + unknown method
 * yields 405 (with an Allow header); anything else yields 404.
 * NOTE: OPTIONS preflights are answered by the CORS middleware before this.
 */
const KNOWN_ROUTES: KnownRoute[] = [
  { pattern: /^\/api\/v1\/health$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/tracks$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/interns$/, methods: ['GET', 'POST'] },
  { pattern: /^\/api\/v1\/interns\/[^/]+$/, methods: ['GET', 'PUT', 'PATCH', 'DELETE'] },
  { pattern: /^\/api\/v1\/admin\/stats$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/demo\/status\/[^/]+$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/demo\/slow$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/demo\/flaky$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/demo\/bad-body$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/demo\/echo$/, methods: ['GET'] },
  { pattern: /^\/api\/v1\/demo\/requests$/, methods: ['GET'] },
];

export function notFound(req: Request, res: Response, _next: NextFunction): void {
  const known = KNOWN_ROUTES.find((r) => r.pattern.test(req.path));
  if (known && !known.methods.includes(req.method)) {
    res.setHeader('Allow', known.methods.join(', '));
    sendProblem(res, req, {
      status: 405,
      title: 'Method Not Allowed',
      detail: `This endpoint supports: ${known.methods.join(', ')}.`,
      type: 'method-not-allowed',
    });
    return;
  }
  sendProblem(res, req, {
    status: 404,
    title: 'Not Found',
    detail: `No route for ${req.method} ${req.path}.`,
    type: 'not-found',
  });
}
