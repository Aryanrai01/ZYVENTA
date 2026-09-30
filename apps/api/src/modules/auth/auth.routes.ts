import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@zyventa/shared';
import { Router } from 'express';
import type { AuthMiddleware } from '../../middleware/authenticate.js';
import { createRateLimiter, emailKey } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createAuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface AuthRouterDeps {
  service: AuthService;
  auth: AuthMiddleware;
}

/**
 * /api/v1/auth — layered limits: per-IP caps stop spraying from one host, per-email caps stop
 * distributed credential stuffing against one account; lockout (service) is the last line.
 */
export function createAuthRouter({ service, auth }: AuthRouterDeps): Router {
  const c = createAuthController(service);
  const limit = (windowMs: number, max: number, extra = {}) =>
    createRateLimiter({ windowMs, limit: max, ...extra });

  const router = Router();

  router.get('/csrf', c.csrf);

  router.post('/register', limit(HOUR, 10), validate({ body: registerSchema }), c.register);

  router.post(
    '/login',
    limit(15 * MINUTE, 30, { countFailuresOnly: true }),
    limit(15 * MINUTE, 10, { countFailuresOnly: true, key: emailKey }),
    validate({ body: loginSchema }),
    c.login,
  );

  router.post('/refresh', limit(MINUTE, 60), c.refresh);
  router.post('/logout', c.logout);
  router.post('/logout-all', auth.required, c.logoutAll);
  router.get('/me', auth.required, c.me);

  router.post(
    '/verify-email',
    limit(15 * MINUTE, 20),
    validate({ body: verifyEmailSchema }),
    c.verifyEmail,
  );
  router.post('/resend-verification', auth.required, limit(HOUR, 5), c.resendVerification);

  router.post(
    '/forgot-password',
    limit(HOUR, 10),
    limit(HOUR, 3, { key: emailKey }),
    validate({ body: forgotPasswordSchema }),
    c.forgotPassword,
  );
  router.post(
    '/reset-password',
    limit(15 * MINUTE, 10),
    validate({ body: resetPasswordSchema }),
    c.resetPassword,
  );
  router.post(
    '/change-password',
    auth.required,
    limit(15 * MINUTE, 10),
    validate({ body: changePasswordSchema }),
    c.changePassword,
  );

  return router;
}
