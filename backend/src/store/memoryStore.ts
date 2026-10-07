import { randomUUID } from 'node:crypto';
import { STATUSES, TRACKS } from '../schemas/intern.js';
import type { Intern, InternCreate, InternPatch, InternReplace } from '../schemas/intern.js';
import type { InternRepository, ListOptions, ListResult } from './InternRepository.js';
import { ConflictError } from './InternRepository.js';

/** In-memory InternRepository. Zero setup; seeded at boot. */
export class MemoryStore implements InternRepository {
  private readonly interns = new Map<string, Intern>();

  clear(): void {
    this.interns.clear();
  }

  private static now(): string {
    return new Date().toISOString();
  }

  private assertUniqueEmail(email: string, excludeId?: string): void {
    const lower = email.toLowerCase();
    for (const intern of this.interns.values()) {
      if (intern.id !== excludeId && intern.email.toLowerCase() === lower) {
        throw new ConflictError(email);
      }
    }
  }

  async create(data: InternCreate): Promise<Intern> {
    this.assertUniqueEmail(data.email);
    const timestamp = MemoryStore.now();
    const intern: Intern = {
      id: randomUUID(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      track: data.track,
      status: data.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.interns.set(intern.id, intern);
    return { ...intern };
  }

  async get(id: string): Promise<Intern | undefined> {
    const intern = this.interns.get(id);
    return intern ? { ...intern } : undefined;
  }

  async replace(id: string, data: InternReplace): Promise<Intern | undefined> {
    const existing = this.interns.get(id);
    if (!existing) return undefined;
    this.assertUniqueEmail(data.email, id);
    const updated: Intern = {
      ...existing,
      name: data.name,
      email: data.email,
      phone: data.phone,
      track: data.track,
      status: data.status,
      updatedAt: MemoryStore.now(),
    };
    this.interns.set(id, updated);
    return { ...updated };
  }

  async patch(id: string, partial: InternPatch): Promise<Intern | undefined> {
    const existing = this.interns.get(id);
    if (!existing) return undefined;
    if (partial.email !== undefined) this.assertUniqueEmail(partial.email, id);
    const updated: Intern = { ...existing, ...partial, updatedAt: MemoryStore.now() };
    this.interns.set(id, updated);
    return { ...updated };
  }

  async remove(id: string): Promise<boolean> {
    return this.interns.delete(id);
  }

  async list(opts: ListOptions): Promise<ListResult> {
    let items = [...this.interns.values()];
    if (opts.search) {
      const query = opts.search.toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(query) || i.email.toLowerCase().includes(query),
      );
    }
    if (opts.track) items = items.filter((i) => i.track === opts.track);
    if (opts.status) items = items.filter((i) => i.status === opts.status);
    const direction = opts.order === 'asc' ? 1 : -1;
    const key = opts.sort;
    items.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * direction);
    const total = items.length;
    const start = (opts.page - 1) * opts.pageSize;
    return {
      items: items.slice(start, start + opts.pageSize).map((i) => ({ ...i })),
      total,
    };
  }

  async countByTrack(): Promise<Record<string, number>> {
    const counts: Record<string, number> = Object.fromEntries(TRACKS.map((t) => [t, 0]));
    for (const intern of this.interns.values()) {
      counts[intern.track] = (counts[intern.track] ?? 0) + 1;
    }
    return counts;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const intern of this.interns.values()) {
      counts[intern.status] = (counts[intern.status] ?? 0) + 1;
    }
    return counts;
  }
}
