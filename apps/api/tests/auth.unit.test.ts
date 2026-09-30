import { AUTH_COOKIES, CSRF_HEADER } from '@zyventa/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  createAuthMiddleware,
  requireActiveSeller,
  requireRoles,
} from '../src/middleware/authenticate.js';
import { issueCsrfToken, isValidCsrfToken } from '../src/middleware/csrf.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestLogger } from '../src/middleware/requestLogger.js';
import { LOCKOUT, lockDurationMs } from '../src/modules/auth/auth.service.js';
import type { AuthPrincipal, PrincipalStore } from '../src/modules/auth/principal.js';
import {
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../src/modules/auth/tokens.js';
import { verificationEmail } from '../src/modules/email/templates.js';

const USER_ID = '65f000000000000000000001';

describe('access tokens', () => {
  it('round-trips subject and session id', async () => {
    const token = await signAccessToken({ sub: USER_ID, sid: 'family-1' });
    expect(await verifyAccessToken(token)).toEqual({
      ok: true,
      claims: { sub: USER_ID, sid: 'family-1' },
    });
  });

  it('rejects tampered, foreign-key and unsigned tokens', async () => {
    const token = await signAccessToken({ sub: USER_ID, sid: 'f' });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'attacker', sid: 'f' })).toString(
      'base64url',
    );
    expect((await verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).ok).toBe(false);

    const foreign = await new SignJWT({ sid: 'f' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER_ID)
      .setIssuer('zyventa-api')
      .setAudience('zyventa')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('a-completely-different-key-of-sufficient-length'));
    expect((await verifyAccessToken(foreign)).ok).toBe(false);

    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: USER_ID, sid: 'f', iss: 'zyventa-api', aud: 'zyventa' }),
    ).toString('base64url')}.`;
    expect((await verifyAccessToken(none)).ok).toBe(false);
  });

  it('reports expiry distinctly so clients know to refresh', async () => {
    const expired = await new SignJWT({ sid: 'f' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER_ID)
      .setIssuer('zyventa-api')
      .setAudience('zyventa')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));
    expect(await verifyAccessToken(expired)).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('opaque tokens', () => {
  it('are 43-char base64url and unique', () => {
    const a = generateOpaqueToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateOpaqueToken()).not.toBe(a);
  });

  it('hash differently per purpose (domain separation)', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token, 'refresh')).toHaveLength(64);
    expect(hashToken(token, 'refresh')).not.toBe(hashToken(token, 'reset'));
  });
});

describe('lockout policy', () => {
  it('locks at the threshold and backs off exponentially up to 24 h', () => {
    expect(lockDurationMs(LOCKOUT.threshold - 1)).toBe(0);
    expect(lockDurationMs(LOCKOUT.threshold)).toBe(15 * 60_000);
    expect(lockDurationMs(LOCKOUT.threshold + 1)).toBe(30 * 60_000);
    expect(lockDurationMs(100)).toBe(24 * 60 * 60_000);
  });
});

describe('email templates', () => {
  it('escape user-controlled names', () => {
    const mail = verificationEmail(
      'a@b.co',
      '<img src=x onerror=alert(1)>',
      'http://localhost:3000/verify-email?token=abc',
    );
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img');
  });
});

describe('CSRF protection', () => {
  const app = createApp({ isDatabaseUp: () => true });

  it('signs tokens and rejects forgeries', () => {
    const token = issueCsrfToken();
    expect(isValidCsrfToken(token)).toBe(true);
    expect(isValidCsrfToken(`${token.split('.')[0] ?? ''}.forged`)).toBe(false);
    expect(isValidCsrfToken('plain-value-set-by-attacker')).toBe(false);
  });

  it('issues a readable CSRF cookie and returns the same token', async () => {
    const res = await request(app).get('/api/v1/auth/csrf');
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith(`${AUTH_COOKIES.csrf}=`),
    );
    expect(cookie).toBeDefined();
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(cookie).toContain(res.body.data.csrfToken);
  });

  it('rejects state-changing requests without a matching token', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/v1/auth/csrf');
    const token = body.data.csrfToken as string;

    const missing = await agent.post('/api/v1/auth/logout');
    expect(missing.status).toBe(403);
    expect(missing.body.code).toBe('CSRF_INVALID');

    const wrong = await agent.post('/api/v1/auth/logout').set(CSRF_HEADER, issueCsrfToken());
    expect(wrong.status).toBe(403);

    const ok = await agent.post('/api/v1/auth/logout').set(CSRF_HEADER, token);
    expect(ok.status).toBe(200);
  });

  it('rejects foreign origins even with a valid token', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/v1/auth/csrf');
    const res = await agent
      .post('/api/v1/auth/logout')
      .set(CSRF_HEADER, body.data.csrfToken as string)
      .set('Referer', 'https://evil.example/page');
    expect(res.status).toBe(403);
  });

  it('exempts cookie-less bearer clients', async () => {
    const res = await request(app).post('/api/v1/auth/logout').set('Authorization', 'Bearer x');
    expect(res.status).toBe(200);
  });

  it('clears session cookies on logout', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/v1/auth/csrf');
    const res = await agent
      .post('/api/v1/auth/logout')
      .set(CSRF_HEADER, body.data.csrfToken as string);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toContain(`${AUTH_COOKIES.accessToken}=;`);
    expect(cookies).toContain(`${AUTH_COOKIES.refreshToken}=;`);
  });
});

describe('authentication & authorization middleware', () => {
  const base: AuthPrincipal = {
    userId: USER_ID,
    sessionId: 'family-1',
    roles: ['USER'],
    status: 'ACTIVE',
    emailVerified: true,
    sellerId: null,
    sellerActive: false,
  };

  function appWith(principal: AuthPrincipal | null) {
    const store: PrincipalStore = {
      resolve: () => Promise.resolve(principal),
    };
    const auth = createAuthMiddleware(store);
    const app = express();
    app.use(cookieParser());
    app.use(requestLogger);
    app.get('/me', auth.required, (req, res) => res.json({ auth: req.auth }));
    app.get('/maybe', auth.optional, (req, res) => res.json({ signedIn: Boolean(req.auth) }));
    app.get('/admin', auth.required, requireRoles('ADMIN'), (_req, res) => res.json({ ok: true }));
    app.get('/seller', auth.required, requireActiveSeller, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    return app;
  }

  const bearer = async () => `Bearer ${await signAccessToken({ sub: USER_ID, sid: 'family-1' })}`;

  it('requires a token', async () => {
    const res = await request(appWith(base)).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('accepts the access cookie and attaches the principal', async () => {
    const token = await signAccessToken({ sub: USER_ID, sid: 'family-1' });
    const res = await request(appWith(base))
      .get('/me')
      .set('Cookie', `${AUTH_COOKIES.accessToken}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.userId).toBe(USER_ID);
  });

  it('rejects revoked sessions and deleted accounts', async () => {
    const res = await request(appWith(null))
      .get('/me')
      .set('Authorization', await bearer());
    expect(res.status).toBe(401);
    const deleted = await request(appWith({ ...base, status: 'DELETED' }))
      .get('/me')
      .set('Authorization', await bearer());
    expect(deleted.status).toBe(401);
  });

  it('blocks suspended accounts with 403', async () => {
    const res = await request(appWith({ ...base, status: 'SUSPENDED' }))
      .get('/me')
      .set('Authorization', await bearer());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('never rejects on optional auth', async () => {
    const res = await request(appWith(base)).get('/maybe').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(200);
    expect(res.body.signedIn).toBe(false);
  });

  it('enforces roles server-side', async () => {
    const asUser = await request(appWith(base))
      .get('/admin')
      .set('Authorization', await bearer());
    expect(asUser.status).toBe(403);
    const asAdmin = await request(appWith({ ...base, roles: ['USER', 'ADMIN'] }))
      .get('/admin')
      .set('Authorization', await bearer());
    expect(asAdmin.status).toBe(200);
  });

  it('requires an ACTIVE seller profile, not just the role', async () => {
    const pending = {
      ...base,
      roles: ['USER', 'SELLER'] as AuthPrincipal['roles'],
      sellerId: 'x',
      sellerActive: false,
    };
    expect(
      (
        await request(appWith(pending))
          .get('/seller')
          .set('Authorization', await bearer())
      ).status,
    ).toBe(403);
    expect(
      (
        await request(appWith({ ...pending, sellerActive: true }))
          .get('/seller')
          .set('Authorization', await bearer())
      ).status,
    ).toBe(200);
  });
});

describe('auth rate limits', () => {
  it('caps registrations per IP', async () => {
    const app = createApp({ isDatabaseUp: () => true });
    const agent = request.agent(app);
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    let last = 0;
    // Invalid bodies still count toward the limit (limiter runs before validation).
    for (let i = 0; i < 11; i += 1) {
      last = (await agent.post('/api/v1/auth/register').set(CSRF_HEADER, csrf).send({})).status;
    }
    expect(last).toBe(429);
  });

  it('counts only failed logins toward the per-email limit', async () => {
    const app = createApp({ isDatabaseUp: () => true });
    const agent = request.agent(app);
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      // Fails validation (400) → counted as a failure without touching the database.
      statuses.push(
        (
          await agent
            .post('/api/v1/auth/login')
            .set(CSRF_HEADER, csrf)
            .send({ email: 'x@y.co', password: '' })
        ).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
