import { Router } from 'express';

export function makeHealthRouter(storeKind: 'memory' | 'postgres') {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      uptimeSec: Math.floor(process.uptime()),
      store: storeKind,
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
