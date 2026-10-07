import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { requestId } from './middleware/requestId.js';
import { serverTiming } from './middleware/serverTiming.js';
import { httpLogger, logger, requestRecorder } from './middleware/requestLog.js';
import { makeCors } from './middleware/cors.js';
import { makeLimiters } from './middleware/rateLimit.js';
import { makeAuth } from './middleware/auth.js';
import { requireJsonContentType } from './middleware/contentType.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { MemoryStore } from './store/memoryStore.js';
import { createPgStore } from './store/pgStore.js';
import { seedStore } from './store/seed.js';
import type { InternRepository } from './store/InternRepository.js';
import { IdempotencyStore } from './lib/idempotency.js';
import { makeHealthRouter } from './routes/health.js';
import { makeTracksRouter } from './routes/tracks.js';
import { makeInternsRouter } from './routes/interns.js';
import { makeAdminRouter } from './routes/admin.js';
import { makeDemoRouter } from './routes/demo.js';

export interface BuiltApp {
  app: Express;
  store: InternRepository;
  storeKind: 'memory' | 'postgres';
  config: Config;
}

/**
 * Builds the Express app. Async because the optional Postgres adapter
 * connects at boot. The memory store is seeded with demo interns.
 *
 * Middleware order: helmet → requestId → serverTiming → requestLog (pino-http
 * + ring-buffer recorder, BEFORE cors so OPTIONS preflights are logged) →
 * cors → contentType (415 before parsing) → express.json → rate limiters →
 * routes → notFound → errorHandler.
 */
export async function buildApp(overrides: Partial<Config> = {}): Promise<BuiltApp> {
  const config = loadConfig(overrides);

  let store: InternRepository;
  let storeKind: 'memory' | 'postgres' = 'memory';
  if (config.databaseUrl) {
    logger.info('DATABASE_URL set — using Postgres store');
    store = await createPgStore(config.databaseUrl);
    storeKind = 'postgres';
  } else {
    store = new MemoryStore();
    await seedStore(store);
  }

  const idempotency = new IdempotencyStore();
  const requireRoles = makeAuth(config);

  const app = express();
  app.set('trust proxy', false);

  app.use(helmet());
  app.use(requestId);
  app.use(serverTiming);
  app.use(httpLogger);
  app.use(requestRecorder);
  app.use(makeCors(config.corsOrigins));
  app.use(requireJsonContentType);
  app.use(express.json({ limit: '10kb' }));

  const { generalLimiter, writesLimiter } = makeLimiters(config);
  app.use(generalLimiter);
  app.use(writesLimiter);

  app.use('/api/v1/health', makeHealthRouter(storeKind));
  app.use('/api/v1/tracks', makeTracksRouter(store));
  app.use('/api/v1/interns', makeInternsRouter({ store, idempotency, requireRoles }));
  app.use('/api/v1/admin', makeAdminRouter(store, requireRoles));
  app.use('/api/v1/demo', makeDemoRouter());

  app.use(notFound);
  app.use(errorHandler(config.nodeEnv));

  // Test + ops hooks (not part of the public API).
  app.locals.store = store;
  app.locals.storeKind = storeKind;
  app.locals.config = config;
  app.locals.idempotency = idempotency;

  return { app, store, storeKind, config };
}
