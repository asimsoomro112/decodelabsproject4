import { rateLimit } from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { Config } from '../config.js';
import { sendProblem } from '../problem.js';

function tooMany(req: Request, res: Response): void {
  res.setHeader('Retry-After', '60');
  sendProblem(res, req, {
    status: 429,
    title: 'Too Many Requests',
    detail: 'Rate limit exceeded. Slow down and retry after 60 seconds.',
    type: 'too-many-requests',
  });
}

export interface Limiters {
  generalLimiter: ReturnType<typeof rateLimit>;
  writesLimiter: ReturnType<typeof rateLimit>;
}

export function makeLimiters(cfg: Config): Limiters {
  const common = {
    windowMs: 60_000,
    standardHeaders: 'draft-7' as const,
    legacyHeaders: true,
    keyGenerator: (req: Request): string => req.ip ?? 'unknown',
    handler: tooMany,
  };
  const generalLimiter = rateLimit({ ...common, limit: cfg.rateLimitGeneralPerMin });
  const writesLimiter = rateLimit({
    ...common,
    limit: cfg.rateLimitWritesPerMin,
    skip: (req: Request): boolean => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  });
  return { generalLimiter, writesLimiter };
}
