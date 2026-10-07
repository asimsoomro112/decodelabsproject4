import type { Intern, InternCreate, InternPatch, InternReplace, InternStatus, Track } from '../schemas/intern.js';

export type SortKey = 'name' | 'email' | 'track' | 'status' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface ListOptions {
  search?: string;
  track?: Track;
  status?: InternStatus;
  sort: SortKey;
  order: SortOrder;
  page: number;
  pageSize: number;
}

export interface ListResult {
  items: Intern[];
  total: number;
}

export class ConflictError extends Error {
  constructor(public readonly email: string) {
    super(`Email already registered: ${email}`);
    this.name = 'ConflictError';
  }
}

/** Async so both the in-memory and Postgres adapters implement it honestly. */
export interface InternRepository {
  list(opts: ListOptions): Promise<ListResult>;
  get(id: string): Promise<Intern | undefined>;
  create(data: InternCreate): Promise<Intern>;
  replace(id: string, data: InternReplace): Promise<Intern | undefined>;
  patch(id: string, partial: InternPatch): Promise<Intern | undefined>;
  remove(id: string): Promise<boolean>;
  countByTrack(): Promise<Record<string, number>>;
  countByStatus(): Promise<Record<string, number>>;
  /** Synchronous reset for the memory store (used by seed + tests). */
  clear(): void;
}
