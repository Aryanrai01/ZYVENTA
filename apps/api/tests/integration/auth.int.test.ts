import { AUTH_COOKIES, CSRF_HEADER } from '@zyventa/shared';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { syncAllIndexes } from '../../src/database/sync-indexes.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { testOutbox } from '../../src/modules/email/mailer.js';
import { User } from '../../src/modules/users/user.model.js';

/*
 * End-to-end auth flows over HTTP against a real replica set (cookies, CSRF, rotation,
 * lockout, email tokens). Skipped only where MongoDB binaries cannot be downloaded.
 */
describe.skipIf(process.env.SKIP_DB_TESTS === '1')('auth flows (integration)', () => {
  let replSet: MongoMemoryReplSet;
  // Fresh app per test = fresh in-memory rate-limit counters (limits are tested separately).
  let app = createApp({ isDatabaseUp: () => true });
  const password = 'Str0ng-pass-123';

  async function browser(): Promise<{ agent: TestAgent; csrf: string }> {
    const agent = request.agent(app);
    const res = await agent.get('/api/v1/auth/csrf');
    return { agent, csrf: res.body.data.csrfToken as string };
  }

  async function register(email: string) {
    const b = await browser();
    const res = await b.agent
      .post('/api/v1/auth/register')
      .set(CSRF_HEADER, b.csrf)
      .send({ name: 'Test User', email, password });
    const csrf = (await b.agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    return { ...b, csrf, res };
  }

  function lastTokenFor(email: string, path: string): string {
    const mail = [...testOutbox].reverse().find((m) => m.to === email && m.text.includes(path));
    const match = mail?.text.match(/token=([A-Za-z0-9_-]{43})/);
    if (!match?.[1]) throw new Error(`No ${path} email for ${email}`);
    return decodeURIComponent(match[1]);
  }

  const cookieNames = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).map(
      (c) => c.split('=')[0],
    );

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(replSet.getUri('zyventa_auth_it'));
    await syncAllIndexes({ apply: true });
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replSet.stop();
  });

  beforeEach(() => {
    testOutbox.length = 0;
    app = createApp({ isDatabaseUp: () => true });
  });

  it('registers, sets session cookies and sends a verification email', async () => {
    const { agent, res } = await register('new@zyventa.test');
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: 'new@zyventa.test',
      roles: ['USER'],
      emailVerified: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    expect(cookieNames(res)).toEqual(
      expect.arrayContaining([AUTH_COOKIES.accessToken, AUTH_COOKIES.refreshToken]),
    );

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('new@zyventa.test');

    const token = lastTokenFor('new@zyventa.test', '/verify-email');
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    expect(
      (await agent.post('/api/v1/auth/verify-email').set(CSRF_HEADER, csrf).send({ token })).status,
    ).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).body.data.emailVerified).toBe(true);
    // Single use.
    expect(
      (await agent.post('/api/v1/auth/verify-email').set(CSRF_HEADER, csrf).send({ token })).status,
    ).toBe(400);
  });

  it('refuses duplicate registration and ignores smuggled roles', async () => {
    await register('dup@zyventa.test');
    const again = await register('DUP@zyventa.test');
    expect(again.res.status).toBe(409);

    const { agent, csrf } = await browser();
    const sneaky = await agent
      .post('/api/v1/auth/register')
      .set(CSRF_HEADER, csrf)
      .send({ name: 'Mallory', email: 'mallory@zyventa.test', password, roles: ['ADMIN'] });
    expect(sneaky.status).toBe(400);
    expect(await User.exists({ email: 'mallory@zyventa.test' })).toBeNull();
  });

  it('logs in, and gives the same error for unknown email and wrong password', async () => {
    await register('login@zyventa.test');
    const { agent, csrf } = await browser();
    const wrong = await agent
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, csrf)
      .send({ email: 'login@zyventa.test', password: 'nope-nope-1' });
    const unknown = await agent
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, csrf)
      .send({ email: 'ghost@zyventa.test', password: 'nope-nope-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);

    const ok = await agent
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, csrf)
      .send({ email: 'login@zyventa.test', password });
    expect(ok.status).toBe(200);
  });

  it('locks the account after repeated failures', async () => {
    await register('lock@zyventa.test');
    const { agent, csrf } = await browser();
    for (let i = 0; i < 5; i += 1) {
      await agent
        .post('/api/v1/auth/login')
        .set(CSRF_HEADER, csrf)
        .send({ email: 'lock@zyventa.test', password: 'bad-pass-99' });
    }
    const locked = await agent
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, csrf)
      .send({ email: 'lock@zyventa.test', password });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { agent, csrf, res } = await register('rotate@zyventa.test');
    const original = (res.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith(`${AUTH_COOKIES.refreshToken}=`))
      ?.split(';')[0];
    expect(original).toBeDefined();

    const refreshed = await agent.post('/api/v1/auth/refresh').set(CSRF_HEADER, csrf);
    expect(refreshed.status).toBe(200);
    expect(await Session.countDocuments({ revokedReason: 'ROTATED' })).toBeGreaterThan(0);

    // Age the rotation past the grace window, then replay the stolen original token.
    await Session.updateMany(
      { revokedReason: 'ROTATED' },
      { $set: { revokedAt: new Date(Date.now() - 60_000) } },
    );
    const attacker = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [original ?? '', `${AUTH_COOKIES.csrf}=${csrf}`])
      .set(CSRF_HEADER, csrf);
    expect(attacker.status).toBe(401);
    expect(attacker.body.code).toBe('TOKEN_REUSED');

    // The legitimate browser is signed out too (whole family revoked).
    expect((await agent.post('/api/v1/auth/refresh').set(CSRF_HEADER, csrf)).status).toBe(401);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('logout revokes the access token immediately', async () => {
    const { agent, csrf } = await register('logout@zyventa.test');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    // Keep a copy of the access cookie to replay after logout.
    const accessCookie = (await agent.post('/api/v1/auth/refresh').set(CSRF_HEADER, csrf)).headers[
      'set-cookie'
    ] as unknown as string[];
    const access =
      accessCookie.find((c) => c.startsWith(`${AUTH_COOKIES.accessToken}=`))?.split(';')[0] ?? '';

    expect((await agent.post('/api/v1/auth/logout').set(CSRF_HEADER, csrf)).status).toBe(200);
    const replay = await request(app).get('/api/v1/auth/me').set('Cookie', access);
    expect(replay.status).toBe(401);
  });

  it('resets a forgotten password and signs out every device', async () => {
    const first = await register('reset@zyventa.test');
    const { agent, csrf } = await browser();

    const unknown = await agent
      .post('/api/v1/auth/forgot-password')
      .set(CSRF_HEADER, csrf)
      .send({ email: 'nobody@zyventa.test' });
    const known = await agent
      .post('/api/v1/auth/forgot-password')
      .set(CSRF_HEADER, csrf)
      .send({ email: 'reset@zyventa.test' });
    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body.message).toBe(known.body.message);

    await new Promise((resolve) => setTimeout(resolve, 200)); // background email task
    const token = lastTokenFor('reset@zyventa.test', '/reset-password');
    const reset = await agent
      .post('/api/v1/auth/reset-password')
      .set(CSRF_HEADER, csrf)
      .send({ token, password: 'Brand-new-pass-1' });
    expect(reset.status).toBe(200);

    expect((await first.agent.get('/api/v1/auth/me')).status).toBe(401);
    const login = await agent
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, csrf)
      .send({ email: 'reset@zyventa.test', password: 'Brand-new-pass-1' });
    expect(login.status).toBe(200);
  });

  it('changes password and keeps only the current device signed in', async () => {
    const deviceA = await register('change@zyventa.test');
    const deviceB = await browser();
    await deviceB.agent
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, deviceB.csrf)
      .send({ email: 'change@zyventa.test', password });

    const changed = await deviceA.agent
      .post('/api/v1/auth/change-password')
      .set(CSRF_HEADER, deviceA.csrf)
      .send({ currentPassword: password, newPassword: 'Another-pass-2' });
    expect(changed.status).toBe(200);
    expect((await deviceA.agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await deviceB.agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('blocks suspended users on their next request', async () => {
    const { agent } = await register('suspend@zyventa.test');
    await User.updateOne({ email: 'suspend@zyventa.test' }, { $set: { status: 'SUSPENDED' } });
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });
});
