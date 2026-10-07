import { Router } from 'express';
import type { InternRepository } from '../store/InternRepository.js';

export function makeTracksRouter(store: InternRepository) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const counts = await store.countByTrack();
    res.json(Object.entries(counts).map(([track, count]) => ({ track, count })));
  });
  return router;
}
