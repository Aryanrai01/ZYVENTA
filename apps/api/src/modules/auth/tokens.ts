import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { env } from '../../config/env.js';

const ISSUER = 'zyventa-api';
const AUDIENCE = 'zyventa';
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session family id — lets logout revoke an access token before it expires. */
  sid: string;
}

/**
 * Short-lived access token. It carries identity only: roles and account status are re-read
 * (cached ≤ 60 s) on every request, so a demoted or suspended user loses access promptly.
 */
export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${String(env.ACCESS_TOKEN_TTL_SECONDS)}s`)
    .sign(accessKey);
}

export type AccessTokenResult =
  { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

export async function verifyAccessToken(token: string): Promise<AccessTokenResult> {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'], // pin the algorithm: no `alg: none`, no key confusion
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, claims: { sub: payload.sub, sid: payload.sid } };
  } catch (error) {
    return { ok: false, reason: error instanceof joseErrors.JWTExpired ? 'expired' : 'invalid' };
  }
}

/** 32 random bytes → 43-char base64url. Used for refresh, verification and reset tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Keyed hash (HMAC-SHA256) of an opaque token. Only this is stored; without
 * TOKEN_HASH_SECRET a leaked database cannot even be used to test token guesses.
 * The `purpose` prefix separates keys per use (domain separation).
 */
export function hashToken(token: string, purpose: 'refresh' | 'email' | 'reset' | 'csrf'): string {
  return createHmac('sha256', env.TOKEN_HASH_SECRET).update(`${purpose}:${token}`).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
