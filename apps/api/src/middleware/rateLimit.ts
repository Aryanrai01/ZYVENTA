import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError.js';

interface RateLimiterConfig {
  windowMs: number;
  limit: number;
  /**
   * Bucket key. Defaults to client IP (IPv6 collapsed to /56 so one host can't rotate
   * addresses). Return e.g. the submitted email to also limit per account.
   */
  key?: (req: Request) => string;
  /** Count only failed requests (status ≥ 400) — e.g. failed logins. */
  countFailuresOnly?: boolean;
  message?: string;
}

/** Client IP bucket key, safe for IPv6. */
export function clientIpKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

/** Per-account bucket key from a JSON body `email` field (falls back to IP). */
export function emailKey(req: Request): string {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.length <= 254
    ? `email:${email.trim().toLowerCase()}`
    : clientIpKey(req);
}

/**
 * Factory for process-local rate limiters.
 * Later phases add stricter limiters (login, password reset, checkout, uploads) through here.
 */
export function createRateLimiter({
  windowMs,
  limit,
  key = clientIpKey,
  countFailuresOnly = false,
  message,
}: RateLimiterConfig): RequestHandler {
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: key,
    skipSuccessfulRequests: countFailuresOnly,
    handler: (_req, _res, next) => {
      next(ApiError.tooManyRequests(message));
    },
  };

  return rateLimit(options);
}
