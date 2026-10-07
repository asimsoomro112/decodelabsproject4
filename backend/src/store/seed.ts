import type { InternStatus, Track } from '../schemas/intern.js';
import type { InternRepository } from './InternRepository.js';

export interface SeedIntern {
  name: string;
  email: string;
  phone?: string;
  track: Track;
  status: InternStatus;
}

export const SEED_INTERNS: SeedIntern[] = [
  { name: 'Ahmed Raza', email: 'ahmed.raza@example.com', phone: '+92 300 1234567', track: 'full-stack', status: 'active' },
  { name: 'Fatima Khan', email: 'fatima.khan@example.com', phone: '+92 321 9876543', track: 'frontend', status: 'active' },
  { name: 'Priya Sharma', email: 'priya.sharma@example.com', phone: '+91 98100 12345', track: 'backend', status: 'active' },
  { name: 'Muhammad Asim', email: 'muhammad.asim@example.com', phone: '+92 333 5551234', track: 'full-stack', status: 'active' },
  { name: 'Ayesha Malik', email: 'ayesha.malik@example.com', track: 'ui-ux', status: 'completed' },
  { name: 'Rahul Verma', email: 'rahul.verma@example.com', phone: '+91 99000 54321', track: 'data', status: 'active' },
  { name: 'Sarah Ahmed', email: 'sarah.ahmed@example.com', track: 'frontend', status: 'applied' },
  { name: 'Bilal Hussain', email: 'bilal.hussain@example.com', phone: '+92 345 7778899', track: 'backend', status: 'completed' },
  { name: 'Ananya Iyer', email: 'ananya.iyer@example.com', track: 'data', status: 'applied' },
  { name: 'Usman Tariq', email: 'usman.tariq@example.com', phone: '+92 302 4445566', track: 'cloud', status: 'active' },
  // Hostile input kept verbatim — the frontend must render it as inert text.
  { name: '<img src=x onerror=alert(1)> Eve', email: 'eve@example.com', track: 'frontend', status: 'applied' },
  { name: 'David Okafor', email: 'david.okafor@example.com', track: 'cloud', status: 'withdrawn' },
  { name: 'Hira Shahid', email: 'hira.shahid@example.com', phone: '+92 311 2223344', track: 'ui-ux', status: 'active' },
  { name: 'Arjun Mehta', email: 'arjun.mehta@example.com', track: 'full-stack', status: 'completed' },
];

/** Clears the store and loads the 14 demo interns. Used at boot and in tests. */
export async function seedStore(store: InternRepository): Promise<void> {
  store.clear();
  for (const seed of SEED_INTERNS) {
    await store.create({
      name: seed.name,
      email: seed.email,
      phone: seed.phone,
      track: seed.track,
      status: seed.status,
    });
  }
}
