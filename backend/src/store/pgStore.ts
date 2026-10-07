import { randomUUID } from 'node:crypto';
import { STATUSES, TRACKS } from '../schemas/intern.js';
import type { Intern, InternCreate, InternPatch, InternReplace } from '../schemas/intern.js';
import type { InternRepository, ListOptions, ListResult } from './InternRepository.js';
import { ConflictError } from './InternRepository.js';

interface PgPool {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  end: () => Promise<void>;
}

const SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  email: 'email',
  track: 'track',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIntern(row: Record<string, unknown>): Intern {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: row.phone == null ? undefined : String(row.phone),
    track: row.track as Intern['track'],
    status: row.status as Intern['status'],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Escape LIKE wildcards so user search text is treated literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

class PgStore implements InternRepository {
  constructor(private readonly pool: PgPool) {}

  async init(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  private static isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
  }

  clear(): void {
    // Interface is sync; pg adapter clears via a fire-and-forget is not
    // acceptable, so this throws a clear message. seedStore() on the pg
    // adapter is done explicitly in app.ts with await.
    throw new Error('PgStore.clear() is not supported; reseed via SQL truncate instead.');
  }

  async clearAsync(): Promise<void> {
    await this.pool.query('TRUNCATE TABLE interns');
  }

  async create(data: InternCreate): Promise<Intern> {
    const now = new Date().toISOString();
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO interns (id, name, email, phone, track, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [randomUUID(), data.name, data.email, data.phone ?? null, data.track, data.status, now, now],
      );
      return toIntern(rows[0]);
    } catch (err) {
      if (PgStore.isUniqueViolation(err)) throw new ConflictError(data.email);
      throw err;
    }
  }

  async get(id: string): Promise<Intern | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM interns WHERE id = $1', [id]);
    return rows[0] ? toIntern(rows[0]) : undefined;
  }

  async replace(id: string, data: InternReplace): Promise<Intern | undefined> {
    try {
      const { rows } = await this.pool.query(
        `UPDATE interns SET name=$2, email=$3, phone=$4, track=$5, status=$6, updated_at=$7
         WHERE id=$1 RETURNING *`,
        [id, data.name, data.email, data.phone ?? null, data.track, data.status, new Date().toISOString()],
      );
      return rows[0] ? toIntern(rows[0]) : undefined;
    } catch (err) {
      if (PgStore.isUniqueViolation(err)) throw new ConflictError(data.email);
      throw err;
    }
  }

  async patch(id: string, partial: InternPatch): Promise<Intern | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (partial.name !== undefined) push('name', partial.name);
    if (partial.email !== undefined) push('email', partial.email);
    if (partial.phone !== undefined) push('phone', partial.phone ?? null);
    if (partial.track !== undefined) push('track', partial.track);
    if (partial.status !== undefined) push('status', partial.status);
    push('updated_at', new Date().toISOString());
    try {
      const { rows } = await this.pool.query(
        `UPDATE interns SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        params,
      );
      return rows[0] ? toIntern(rows[0]) : undefined;
    } catch (err) {
      if (PgStore.isUniqueViolation(err) && partial.email) throw new ConflictError(partial.email);
      throw err;
    }
  }

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM interns WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  async list(opts: ListOptions): Promise<ListResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts.search) {
      params.push(`%${escapeLike(opts.search)}%`);
      conditions.push(`(name ILIKE $${params.length} ESCAPE '\\' OR email ILIKE $${params.length} ESCAPE '\\')`);
    }
    if (opts.track) {
      params.push(opts.track);
      conditions.push(`track = $${params.length}`);
    }
    if (opts.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = SORT_COLUMNS[opts.sort] ?? 'created_at';
    const direction = opts.order === 'asc' ? 'ASC' : 'DESC';
    const offset = (opts.page - 1) * opts.pageSize;
    const countResult = await this.pool.query(`SELECT COUNT(*) AS total FROM interns ${where}`, params);
    const total = Number(countResult.rows[0].total);
    const { rows } = await this.pool.query(
      `SELECT * FROM interns ${where} ORDER BY ${sortColumn} ${direction} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, opts.pageSize, offset],
    );
    return { items: rows.map(toIntern), total };
  }

  async countByTrack(): Promise<Record<string, number>> {
    const counts: Record<string, number> = Object.fromEntries(TRACKS.map((t) => [t, 0]));
    const { rows } = await this.pool.query('SELECT track, COUNT(*) AS n FROM interns GROUP BY track');
    for (const row of rows) counts[String(row.track)] = Number(row.n);
    return counts;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    const { rows } = await this.pool.query('SELECT status, COUNT(*) AS n FROM interns GROUP BY status');
    for (const row of rows) counts[String(row.status)] = Number(row.n);
    return counts;
  }
}

interface PgModuleShape {
  Pool?: new (config: { connectionString: string }) => PgPool;
  default?: { Pool?: new (config: { connectionString: string }) => PgPool };
}

/**
 * OPTIONAL stretch adapter: builds an InternRepository backed by Postgres.
 * `pg` is imported lazily so a missing package never breaks install/start.
 * Run migrations/001_interns.sql before first use.
 */
export async function createPgStore(databaseUrl: string): Promise<InternRepository> {
  let pgModule: unknown;
  try {
    pgModule = await import('pg');
  } catch {
    throw new Error(
      'DATABASE_URL is set but the "pg" package is not installed. Install it with: npm install pg',
    );
  }
  const shape = pgModule as PgModuleShape;
  const PoolCtor = shape.Pool ?? shape.default?.Pool;
  if (typeof PoolCtor !== 'function') {
    throw new Error('Loaded "pg" but could not find a Pool constructor export.');
  }
  const store = new PgStore(new PoolCtor({ connectionString: databaseUrl }));
  await store.init();
  return store;
}
