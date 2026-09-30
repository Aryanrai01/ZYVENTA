import type { Server } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { startJobs } from './jobs/scheduler.js';
import { releaseSettledEarnings } from './modules/orders/fulfilment.service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  await connectDatabase(env.MONGODB_URI);

  const app = createApp({});
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    if (env.NODE_ENV !== 'production') {
      logger.info(`API docs at http://localhost:${env.PORT}/api/docs`);
    }
  });
  // Slightly above typical load-balancer idle timeouts to avoid 502s on reused connections.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const stopJobs = env.JOBS_ENABLED
    ? startJobs([
        {
          name: 'expire-unpaid-orders',
          intervalMs: 60_000,
          run: () => app.locals.container.checkout.expireStaleOrders(),
        },
        { name: 'release-seller-earnings', intervalMs: 15 * 60_000, run: releaseSettledEarnings },
      ])
    : () => undefined;

  registerShutdown(server, stopJobs);
}

function registerShutdown(server: Server, stopJobs: () => void): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');
    stopJobs();

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((closeError) => {
      if (closeError) logger.error({ err: closeError }, 'Error closing HTTP server');
      void Promise.allSettled([disconnectDatabase()]).then(() => {
        logger.info('Shutdown complete');
        process.exit(closeError ? 1 : 0);
      });
    });
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap().catch((error: unknown) => {
  // Startup failures are configuration/connectivity problems: log the reason, not driver internals.
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  logger.fatal({ reason }, 'API failed to start');
  process.exit(1);
});
