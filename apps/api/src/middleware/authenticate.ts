import { AUTH_COOKIES, ERROR_CODES, type Role } from '@zyventa/shared';
import type { Request, RequestHandler } from 'express';
import type { PrincipalStore } from '../modules/auth/principal.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { ApiError } from '../utils/ApiError.js';

function readAccessToken(req: Request): string | undefined {
  const cookie: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    AUTH_COOKIES.accessToken
  ];
  if (typeof cookie === 'string' && cookie.length > 0) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return undefined;
}

export interface AuthMiddleware {
  /** 401 unless a valid, unrevoked access token for an active account is present. */
  required: RequestHandler;
  /** Attaches `req.auth` when possible; never rejects (for public pages with personalisation). */
  optional: RequestHandler;
}

/**
 * Authentication chain step 1–3: token present → signature/expiry/issuer valid → account
 * active and session not revoked. Authorization (roles, ownership) is separate: see
 * `authorize.ts` and the ownership filters inside each service.
 */
export function createAuthMiddleware(store: PrincipalStore): AuthMiddleware {
  async function resolve(req: Request, strict: boolean): Promise<void> {
    const token = readAccessToken(req);
    if (!token) {
      if (strict) throw ApiError.unauthenticated();
      return;
    }

    const result = await verifyAccessToken(token);
    if (!result.ok) {
      if (!strict) return;
      throw result.reason === 'expired'
        ? new ApiError(401, ERROR_CODES.TOKEN_EXPIRED, 'Session expired')
        : new ApiError(401, ERROR_CODES.TOKEN_INVALID, 'Invalid session');
    }

    const principal = await store.resolve(result.claims.sub, result.claims.sid);
    if (!principal || principal.status === 'DELETED') {
      if (strict) throw new ApiError(401, ERROR_CODES.TOKEN_INVALID, 'Session is no longer valid');
      return;
    }
    if (principal.status === 'SUSPENDED') {
      if (strict) {
        throw new ApiError(403, ERROR_CODES.ACCOUNT_SUSPENDED, 'This account has been suspended');
      }
      return;
    }
    req.auth = principal;
  }

  return {
    required: (req, _res, next) => {
      resolve(req, true).then(() => {
        next();
      }, next);
    },
    optional: (req, _res, next) => {
      resolve(req, false).then(() => {
        next();
      }, next);
    },
  };
}

/** Role gate. Must run after `auth.required`. A user passes if they hold ANY listed role. */
export function requireRoles(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(ApiError.unauthenticated());
      return;
    }
    if (!roles.some((role) => req.auth?.roles.includes(role))) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}

/** Seller gate: SELLER role plus an ACTIVE seller profile (pending/suspended sellers are blocked). */
export const requireActiveSeller: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(ApiError.unauthenticated());
    return;
  }
  if (!req.auth.roles.includes('SELLER') || !req.auth.sellerId || !req.auth.sellerActive) {
    next(ApiError.forbidden('An active seller account is required'));
    return;
  }
  next();
};

/** Blocks unverified accounts from sensitive actions such as checkout. */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(ApiError.unauthenticated());
    return;
  }
  if (!req.auth.emailVerified) {
    next(
      new ApiError(403, ERROR_CODES.EMAIL_NOT_VERIFIED, 'Please verify your email address first'),
    );
    return;
  }
  next();
};

/** Narrowing helper for controllers behind `auth.required`. */
export function authOf(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) throw ApiError.unauthenticated();
  return req.auth;
}
