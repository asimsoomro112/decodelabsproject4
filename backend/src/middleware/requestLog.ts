import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { NextFunction, Request, Response } from 'express';
import { RingBuffer } from '../lib/ringBuffer.js';
import { getRequestId } from './requestId.js';

export interface RequestLogEntry {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  origin: string | null;
  timestamp: string;
}

const ring = new RingBuffer<RequestLogEntry>(100);
let requestsServed = 0;

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => getRequestId(req as Request),
  redact: { paths: ['req.headers.authorization'], censor: '[redacted]' },
});

/**
 * Records every request — including OPTIONS preflights — into the ring buffer.
 * MUST be registered before the CORS middleware so preflights are captured.
 */
export function requestRecorder(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    incrementRequestsServed();
    ring.push({
      requestId: getRequestId(req),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      origin: req.get('origin') ?? null,
      timestamp: new Date().toISOString(),
    });
  });
  next();
}

export function incrementRequestsServed(): void {
  requestsServed += 1;
}

export function getRequestsServed(): number {
  return requestsServed;
}

export function getRequestLog(): RequestLogEntry[] {
  return ring.toArray();
}
