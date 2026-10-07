import { z } from 'zod';
import { statusEnum, trackEnum } from './intern.js';
import { HttpProblem } from '../problem.js';

const sortEnum = z.enum(['name', 'email', 'track', 'status', 'createdAt', 'updatedAt']);
const orderEnum = z.enum(['asc', 'desc']);

export const listQuerySchema = z.object({
  search: z.string().max(60, 'Search must be at most 60 characters.').optional(),
  track: trackEnum.optional(),
  status: statusEnum.optional(),
  sort: sortEnum.default('createdAt'),
  order: orderEnum.default('desc'),
  page: z.coerce.number().int().min(1, 'Page must be at least 1.').default(1),
  pageSize: z.coerce.number().int().min(1, 'Page size must be at least 1.').max(100, 'Page size must be at most 100.').default(12),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Validates GET /interns query params. Type-coercion failures (e.g. page=abc)
 * are a 400 (the parameter is not even the right shape); semantic failures
 * (e.g. page=0, pageSize=200) are a 422 with field errors.
 */
export function validateListQuery(query: unknown): ListQuery {
  const result = listQuerySchema.safeParse(query);
  if (result.success) return result.data;
  const issues = result.error.issues;
  const hasTypeError = issues.some((issue) => issue.code === 'invalid_type');
  if (hasTypeError) {
    throw new HttpProblem({
      status: 400,
      title: 'Bad Request',
      detail: 'Invalid query parameter.',
      type: 'invalid-query',
    });
  }
  throw new HttpProblem({
    status: 422,
    title: 'Unprocessable Entity',
    detail: 'Invalid query parameters.',
    type: 'invalid-query',
    errors: issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  });
}
