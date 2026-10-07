import type { NextFunction, Request, Response } from 'express';
import { sendProblem } from '../problem.js';

/**
 * Rejects POST/PUT/PATCH requests that carry a body but are not JSON.
 * Runs BEFORE express.json() so the wrong-content-type error is a clean 415.
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const length = req.get('content-length');
    const transferEncoding = req.get('transfer-encoding');
    const hasBody = (length !== undefined && length !== '0') || transferEncoding !== undefined;
    if (hasBody) {
      const contentType = req.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        sendProblem(res, req, {
          status: 415,
          title: 'Unsupported Media Type',
          detail: 'This endpoint accepts application/json request bodies only.',
          type: 'unsupported-media-type',
        });
        return;
      }
    }
  }
  next();
}
