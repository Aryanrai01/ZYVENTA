import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { env, isProduction } from './config/env.js';
import { isDatabaseConnected } from './config/database.js';
import { createDocsRouter } from './docs/openapi.js';
import { requireCsrf } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { rejectOperatorKeys } from './middleware/rejectOperatorKeys.js';
import { requestLogger } from './middleware/requestLogger.js';
import { corsPolicy, securityHeaders } from './middleware/security.js';
import { createContainer, type Container } from './container.js';
import type { PrincipalStore } from './modules/auth/principal.js';
import type { PaymentGateway } from './modules/payments/razorpay.client.js';
import { createWebhookRouter } from './modules/payments/webhook.routes.js';
import type { ImageStorage } from './modules/uploads/image-storage.js';
import { createV1Router } from './routes/v1.js';

export interface AppDependencies {
  /** Overridable for tests; defaults to the live Mongoose connection state. */
  isDatabaseUp?: () => boolean;
  /** Test overrides for ports (see container.ts). */
  principals?: PrincipalStore;
  storage?: ImageStorage | null;
  gateway?: PaymentGateway | null;
}

/**
 * Builds the Express application without starting a server or opening connections, so the
 * same instance is used by `server.ts` and by Supertest.
 *
 * Middleware order matters:
 *   request id/logging → security headers → CORS → rate limit → raw-body webhooks
 *   → body parsers with size limits → cookies → compression → operator-key guard
 *   → CSRF check → routes (authentication/authorization per route)
 *   → 404 → error handler
 */
export function createApp(deps: AppDependencies): Express & { locals: { container: Container } } {
  const { isDatabaseUp = isDatabaseConnected } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('query parser', 'simple'); // flat query strings: no `?a[b]=c` object injection
  app.set('json spaces', isProduction ? 0 : 2);

  app.use(requestLogger);
  app.use(securityHeaders());
  app.use(corsPolicy(env.CORS_ORIGINS));
  app.use(
    createRateLimiter({
      windowMs: 60_000,
      limit: env.RATE_LIMIT_PER_MINUTE,
    }),
  );

  const container = createContainer({
    ...(deps.principals ? { principals: deps.principals } : {}),
    ...(deps.storage !== undefined ? { storage: deps.storage } : {}),
    ...(deps.gateway !== undefined ? { gateway: deps.gateway } : {}),
  });
  app.locals.container = container;

  // Webhooks are mounted HERE — before express.json and the CSRF check — because Razorpay
  // signs the raw bytes. They authenticate by HMAC signature instead.
  app.use(
    '/api/v1/webhooks',
    createWebhookRouter({
      gateway: container.gateway,
      checkout: container.checkout,
      refunds: container.refunds,
    }),
  );

  app.use(express.json({ limit: '100kb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 50 }));
  app.use(cookieParser());
  app.use(compression());
  app.use(rejectOperatorKeys);
  app.use(requireCsrf(env.CORS_ORIGINS));

  app.use(
    '/api/v1',
    createV1Router(container, {
      version: env.APP_VERSION,
      isDatabaseUp,
    }),
  );

  if (!isProduction) {
    app.use('/api/docs', createDocsRouter(env.APP_VERSION));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app as Express & { locals: { container: Container } };
}
