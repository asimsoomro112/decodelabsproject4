import { ZodError } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { HttpProblem, sendProblem } from '../problem.js';
import { logger } from './requestLog.js';

/** Final error middleware. Every error leaves as application/problem+json. */
export function errorHandler(nodeEnv: string) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (res.headersSent) return;

    if (err instanceof HttpProblem) {
      sendProblem(res, req, {
        status: err.status,
        title: err.title,
        detail: err.detail,
        type: err.type,
        errors: err.errors,
      });
      return;
    }

    if (err instanceof ZodError) {
      sendProblem(res, req, {
        status: 422,
        title: 'Unprocessable Entity',
        detail: 'Request validation failed.',
        type: 'validation-failed',
        errors: err.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
      return;
    }

    const typed = err as { type?: string; message?: string } | null;
    if (typed?.type === 'entity.parse.failed') {
      sendProblem(res, req, {
        status: 400,
        title: 'Bad Request',
        detail: 'Malformed JSON in request body.',
        type: 'malformed-json',
      });
      return;
    }
    if (typed?.type === 'entity.too.large') {
      sendProblem(res, req, {
        status: 413,
        title: 'Content Too Large',
        detail: 'Request body exceeds the 10kb limit.',
        type: 'payload-too-large',
      });
      return;
    }

    logger.error({ err }, 'Unhandled error');
    sendProblem(res, req, {
      status: 500,
      title: 'Internal Server Error',
      detail: nodeEnv === 'development' ? (typed?.message ?? 'Unexpected error.') : 'Something went wrong.',
      type: 'internal-error',
    });
  };
}
