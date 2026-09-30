import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError.js';

/**
 * Security headers. The API only serves JSON (plus Swagger UI outside production), so the
 * CSP is locked down to "nothing"; the web app sets its own CSP for HTML pages.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  });
}

/**
 * Credentialed CORS restricted to an explicit allowlist — never `*`.
 * Requests without an Origin header (server-to-server, curl, Next.js server components) are
 * allowed through CORS; they are still subject to authentication and CSRF checks.
 */
export function corsPolicy(allowedOrigins: readonly string[]): RequestHandler {
  const allowlist = new Set(allowedOrigins);
  const options: CorsOptions = {
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) {
        callback(null, true);
        return;
      }
      callback(ApiError.forbidden('Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  };
  return cors(options);
}
