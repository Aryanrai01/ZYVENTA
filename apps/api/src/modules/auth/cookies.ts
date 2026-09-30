import { AUTH_COOKIES } from '@zyventa/shared';
import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../../config/env.js';

export const REFRESH_COOKIE_PATH = '/api/v1/auth';

function base(): CookieOptions {
  return {
    secure: isProduction, // https-only in production; localhost dev runs over http
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

/**
 * Cookie layout:
 *  - zv_at   access JWT   HttpOnly  SameSite=Lax     Path=/               (short-lived)
 *  - zv_rt   refresh      HttpOnly  SameSite=Strict  Path=/api/v1/auth    (only sent to auth routes)
 *  - zv_csrf CSRF token   readable  SameSite=Lax     Path=/               (double-submit)
 *  - zv_session  "1"      readable  SameSite=Lax     Path=/               (UX hint only — lets the
 *                web app skip refresh calls/private renders for signed-out visitors; never trusted)
 *
 * The web app and API share one registrable domain, so these are first-party cookies.
 */
export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
): void {
  res.cookie(AUTH_COOKIES.accessToken, tokens.accessToken, {
    ...base(),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(AUTH_COOKIES.refreshToken, tokens.refreshToken, {
    ...base(),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
  res.cookie(AUTH_COOKIES.sessionHint, '1', {
    ...base(),
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIES.accessToken, {
    ...base(),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie(AUTH_COOKIES.refreshToken, {
    ...base(),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
  res.clearCookie(AUTH_COOKIES.sessionHint, { ...base(), sameSite: 'lax', path: '/' });
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIES.csrf, token, {
    ...base(),
    httpOnly: false, // the web app must read it to echo it in the X-CSRF-Token header
    sameSite: 'lax',
    path: '/',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}
