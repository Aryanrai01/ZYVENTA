import { randomBytes } from 'node:crypto';
import { AUTH_COOKIES, CSRF_HEADER, ERROR_CODES } from '@zyventa/shared';
import type { Request, RequestHandler } from 'express';
import { hashToken, safeEqual } from '../modules/auth/tokens.js';
import { ApiError } from '../utils/ApiError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** `<random>.<hmac(random)>` — signed so a cookie planted by a sibling subdomain is rejected. */
export function issueCsrfToken(): string {
  const nonce = randomBytes(24).toString('base64url');
  return `${nonce}.${hashToken(nonce, 'csrf').slice(0, 32)}`;
}

export function isValidCsrfToken(token: string | undefined): token is string {
  if (!token || token.length > 128) return false;
  const [nonce, signature, ...rest] = token.split('.');
  if (!nonce || !signature || rest.length > 0) return false;
  return safeEqual(signature, hashToken(nonce, 'csrf').slice(0, 32));
}

function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Signed double-submit CSRF protection for every state-changing request:
 *  1. Origin (or Referer) must be an allowlisted web origin when present.
 *  2. The X-CSRF-Token header must equal the zv_csrf cookie, and the token must be signed.
 *
 * Exemptions: safe methods, and pure bearer-token clients that send no cookies at all
 * (a cross-site attacker cannot make a browser attach an Authorization header).
 * Webhooks are mounted before this middleware and authenticate by signature instead.
 */
export function requireCsrf(allowedOrigins: readonly string[]): RequestHandler {
  const origins = new Set(allowedOrigins);

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const hasCookies = Object.keys((req.cookies as object | undefined) ?? {}).length > 0;
    if (!hasCookies && req.headers.authorization?.startsWith('Bearer ')) {
      next();
      return;
    }

    const origin = req.headers.origin ?? originOf(req.headers.referer);
    if (origin && !origins.has(origin)) {
      next(new ApiError(403, ERROR_CODES.CSRF_INVALID, 'Request origin not allowed'));
      return;
    }

    const header = req.get(CSRF_HEADER);
    const cookie = readCookie(req, AUTH_COOKIES.csrf);
    if (!header || !cookie || !safeEqual(header, cookie) || !isValidCsrfToken(cookie)) {
      next(
        new ApiError(
          403,
          ERROR_CODES.CSRF_INVALID,
          'Security token missing or expired. Refresh the page and try again.',
        ),
      );
      return;
    }
    next();
  };
}

function originOf(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}
