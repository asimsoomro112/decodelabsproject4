import { z } from 'zod';

export const trackEnum = z.enum(['full-stack', 'frontend', 'backend', 'data', 'ui-ux', 'cloud']);
export const statusEnum = z.enum(['applied', 'active', 'completed', 'withdrawn']);

export const TRACKS = trackEnum.options;
export const STATUSES = statusEnum.options;

const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;

const internFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60, 'Name must be at most 60 characters.'),
  email: z.email('Invalid email address.').transform((v) => v.toLowerCase()),
  phone: z.string().regex(PHONE_REGEX, 'Invalid phone number.').optional(),
  track: trackEnum,
  status: statusEnum,
};

/** POST /interns — status defaults to 'applied'. */
export const internCreateSchema = z.strictObject({
  ...internFields,
  status: statusEnum.default('applied'),
});

/** PUT /interns/:id — full replacement, everything required. */
export const internReplaceSchema = z.strictObject({ ...internFields });

/** PATCH /interns/:id — partial update, but at least one field required. */
export const internPatchSchema = z
  .strictObject({ ...internFields })
  .partial()
  .refine((obj) => Object.keys(obj).length >= 1, {
    message: 'At least one field is required.',
  });

export type Track = z.infer<typeof trackEnum>;
export type InternStatus = z.infer<typeof statusEnum>;
export type InternCreate = z.infer<typeof internCreateSchema>;
export type InternReplace = z.infer<typeof internReplaceSchema>;
export type InternPatch = z.infer<typeof internPatchSchema>;

export interface Intern {
  id: string;
  name: string;
  email: string;
  phone?: string;
  track: Track;
  status: InternStatus;
  createdAt: string;
  updatedAt: string;
}
