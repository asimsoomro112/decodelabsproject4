import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { logger } from './middleware/requestLog.js';

async function main(): Promise<void> {
  const { app, storeKind, config } = await buildApp(loadConfig());
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, store: storeKind, env: config.nodeEnv },
      'SynapseBridge API listening',
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start SynapseBridge API');
  process.exit(1);
});
