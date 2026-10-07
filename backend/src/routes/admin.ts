import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { InternRepository } from '../store/InternRepository.js';
import type { Role } from '../middleware/auth.js';
import { getRequestsServed } from '../middleware/requestLog.js';

export function makeAdminRouter(store: InternRepository, requireRoles: (...roles: Role[]) => RequestHandler) {
  const router = Router();
  router.get('/stats', requireRoles('admin'), async (_req, res) => {
    const [byTrack, byStatus, { total }] = await Promise.all([
      store.countByTrack(),
      store.countByStatus(),
      store.list({ sort: 'createdAt', order: 'desc', page: 1, pageSize: 1 }),
    ]);
    res.json({
      totals: { interns: total, byTrack, byStatus },
      requestsServed: getRequestsServed(),
    });
  });
  return router;
}
