import type { Request, Response } from 'express';
import { getRequestId } from './middleware/requestId.js';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ProblemOptions {
  status: number;
  title: string;
  detail?: string;
  /** Kebab-case problem id; defaults to a kebab-case of the title. */
  type?: string;
  errors?: ValidationError[];
}

export class HttpProblem extends Error {
  readonly status: number;
  readonly title: string;
  readonly type?: string;
  readonly detail?: string;
  readonly errors?: ValidationError[];

  constructor(opts: ProblemOptions) {
    super(opts.detail ?? opts.title);
    this.name = 'HttpProblem';
    this.status = opts.status;
    this.title = opts.title;
    this.type = opts.type;
    this.detail = opts.detail;
    this.errors = opts.errors;
  }
}

function toKebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Send an RFC 9457 Problem Details response (`application/problem+json`). */
export function sendProblem(res: Response, req: Request, opts: ProblemOptions): void {
  const requestId = getRequestId(req);
  const body: Record<string, unknown> = {
    type: `https://synapsebridge.dev/problems/${opts.type ?? toKebab(opts.title)}`,
    title: opts.title,
    status: opts.status,
    detail: opts.detail,
    instance: req.path,
    requestId,
  };
  if (opts.errors) body.errors = opts.errors;
  if (requestId) res.setHeader('X-Request-Id', requestId);
  res.status(opts.status).type('application/problem+json').send(body);
}

export const badRequest = (detail?: string) =>
  new HttpProblem({ status: 400, title: 'Bad Request', detail, type: 'bad-request' });
export const unauthorized = (detail?: string) =>
  new HttpProblem({ status: 401, title: 'Unauthorized', detail, type: 'unauthorized' });
export const forbidden = (detail?: string) =>
  new HttpProblem({ status: 403, title: 'Forbidden', detail, type: 'forbidden' });
export const notFound = (detail?: string) =>
  new HttpProblem({ status: 404, title: 'Not Found', detail, type: 'not-found' });
export const conflict = (detail?: string) =>
  new HttpProblem({ status: 409, title: 'Conflict', detail, type: 'conflict' });
export const unprocessable = (detail?: string, errors?: ValidationError[]) =>
  new HttpProblem({ status: 422, title: 'Unprocessable Entity', detail, type: 'unprocessable-entity', errors });
export const tooManyRequests = (detail?: string) =>
  new HttpProblem({ status: 429, title: 'Too Many Requests', detail, type: 'too-many-requests' });
export const internal = (detail?: string) =>
  new HttpProblem({ status: 500, title: 'Internal Server Error', detail, type: 'internal-error' });
