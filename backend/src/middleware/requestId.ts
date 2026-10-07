import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Returns the request id as a string.
 *
 * `req.id` is typed as pino-http's `ReqId` (number | string | object) because
 * pino-http augments `http.IncomingMessage` with `id: ReqId`, which Express's
 * `Request` inherits. At runtime our requestId middleware always assigns a
 * string, so this narrows defensively.
 */
export function getRequestId(req: Request): string {
  const id: unknown = req.id;
  return typeof id === 'string' && id.length > 0 ? id : 'unknown';
}

/** Honor an incoming X-Request-Id, else mint one. Always echo it back. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('X-Request-Id');
  const id = incoming && incoming.trim() ? incoming.trim() : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
