import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const ALLOWED_ORIGIN = 'http://localhost:3000';

describe('app — infrastructure', () => {
  const app = createApp({ isDatabaseUp: () => true });

  it('GET /api/v1/health/live returns the success envelope', async () => {
    const res = await request(app).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Alive', data: { status: 'ok' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/v1/health/ready reports ready when MongoDB is up', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      checks: { mongodb: 'up' },
    });
  });

  it('GET /api/v1/health/ready reports degraded when MongoDB is down', async () => {
    const unavailableApp = createApp({ isDatabaseUp: () => false });
    const res = await request(unavailableApp).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({
      status: 'degraded',
      checks: { mongodb: 'down' },
    });
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'ROUTE_NOT_FOUND' });
    expect(typeof res.body.requestId).toBe('string');
  });

  it('generates a request id, and propagates a safe inbound one', async () => {
    const generated = await request(app).get('/api/v1/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const propagated = await request(app)
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'trace-abc12345');
    expect(propagated.headers['x-request-id']).toBe('trace-abc12345');

    const rejected = await request(app)
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'bad id <script>');
    expect(rejected.headers['x-request-id']).not.toContain('bad id');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });

  describe('CORS', () => {
    it('allows credentialed requests from allowlisted origins', async () => {
      const res = await request(app).get('/api/v1/health/live').set('Origin', ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects other origins and never answers with a wildcard', async () => {
      const res = await request(app)
        .get('/api/v1/health/live')
        .set('Origin', 'https://evil.example');
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers preflight for allowlisted origins', async () => {
      const res = await request(app)
        .options('/api/v1/health/live')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, X-CSRF-Token');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-headers']).toContain('X-CSRF-Token');
    });
  });

  describe('body parsing', () => {
    it('rejects malformed JSON with 400', async () => {
      const res = await request(app)
        .post('/api/v1/health/live')
        .set('Content-Type', 'application/json')
        .send('{"broken":');
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, code: 'BAD_REQUEST' });
    });

    it('rejects bodies above the size limit with 413', async () => {
      const res = await request(app)
        .post('/api/v1/health/live')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ blob: 'x'.repeat(200 * 1024) }));
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  it('serves the OpenAPI document outside production', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toContain('/health/ready');
  });
});

describe('app — rate limiting', () => {
  it('returns 429 with the standard error envelope once the budget is spent', async () => {
    process.env.RATE_LIMIT_PER_MINUTE = '1000';
    const app = createApp({ isDatabaseUp: () => true });
    // Budget is 1000/min in tests; burn it via a tight loop against a cheap route.
    let last = await request(app).get('/api/v1/health/live');
    for (let i = 0; i < 1000 && last.status !== 429; i += 1) {
      last = await request(app).get('/api/v1/health/live');
    }
    expect(last.status).toBe(429);
    expect(last.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(last.headers['ratelimit-policy']).toBeDefined();
  });
});
