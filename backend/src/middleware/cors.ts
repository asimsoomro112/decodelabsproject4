import cors from 'cors';
import { logger } from './requestLog.js';

/**
 * CORS against an allowlist. Requests with no Origin header (curl, tests,
 * server-to-server) are allowed through without CORS headers. Disallowed
 * origins are refused with NO CORS headers (not an error response).
 */
export function makeCors(allowlist: string[]) {
  return cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowlist.includes(origin)) {
        callback(null, true);
        return;
      }
      logger.warn({ origin }, 'CORS blocked origin');
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: [
      'X-Request-Id',
      'Retry-After',
      'Server-Timing',
      'Location',
      'Idempotent-Replay',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ],
    maxAge: 600,
    optionsSuccessStatus: 204,
    credentials: false,
  });
}
