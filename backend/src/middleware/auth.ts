import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Config } from '../config.js';
import { sendProblem } from '../problem.js';

export type Role = 'editor' | 'admin';

/** Demo bearer-token auth. Wire with requireRoles from app.ts. */
export function makeAuth(cfg: Config) {
  const tokenToRole = new Map<string, Role>([
    [cfg.editorToken, 'editor'],
    [cfg.adminToken, 'admin'],
  ]);

  return function requireRoles(...roles: Role[]): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      const header = req.get('authorization');
      const match = header?.match(/^Bearer\s+(.+)$/i);
      const role = match ? tokenToRole.get(match[1].trim()) : undefined;
      if (!role) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="demo"');
        sendProblem(res, req, {
          status: 401,
          title: 'Unauthorized',
          detail: 'A valid Bearer <redacted> required.',
          type: 'unauthorized',
        });
        return;
      }
      if (!roles.includes(role)) {
        sendProblem(res, req, {
          status: 403,
          title: 'Forbidden',
          detail: `This endpoint requires one of: ${roles.join(', ')}.`,
          type: 'forbidden',
        });
        return;
      }
      next();
    };
  };
}
