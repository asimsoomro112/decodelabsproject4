import type { NextFunction, Request, Response } from 'express';

type EndFn = Response['end'];

/** Adds `Server-Timing: app;dur=<ms>` to every response. */
export function serverTiming(_req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const originalEnd = res.end.bind(res) as EndFn;
  (res.end as EndFn) = function (this: Response, ...args: Parameters<EndFn>) {
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `app;dur=${Date.now() - start}`);
    }
    return (originalEnd as (...a: unknown[]) => unknown).apply(this, args);
  } as EndFn;
  next();
}
