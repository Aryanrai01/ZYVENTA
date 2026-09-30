import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthPrincipal, PrincipalStore } from '../src/modules/auth/principal.js';
import { signAccessToken } from '../src/modules/auth/tokens.js';

/*
 * Authorization and input validation for the shopper APIs. Everything here is rejected
 * before any database access, so it runs without MongoDB.
 */
const USER_ID = '65f000000000000000000001';
const VARIANT = '65f0000000000000000000cc';

const shopper: AuthPrincipal = {
  userId: USER_ID,
  sessionId: 'family',
  roles: ['USER'],
  status: 'ACTIVE',
  emailVerified: false,
  sellerId: null,
  sellerActive: false,
};

function appFor(p: AuthPrincipal | null) {
  const principals: PrincipalStore = {
    resolve: () => Promise.resolve(p),
  };
  return createApp({ isDatabaseUp: () => true, principals, storage: null });
}

const bearer = async () => `Bearer ${await signAccessToken({ sub: USER_ID, sid: 'family' })}`;

describe('shopper APIs require sign-in', () => {
  const app = appFor(null);
  it.each([
    ['get', '/api/v1/cart'],
    ['post', '/api/v1/cart/items'],
    ['post', '/api/v1/cart/merge'],
    ['get', '/api/v1/wishlist'],
    ['get', '/api/v1/wishlist/ids'],
    ['get', '/api/v1/addresses'],
    ['get', '/api/v1/users/me'],
  ] as const)('%s %s → 401', async (method, path) => {
    const agent = request(app);
    const res = await agent[method](path).set('Authorization', await bearer());
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('shopper API validation', () => {
  const app = appFor(shopper);

  it('rejects browser-supplied prices on add-to-cart', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', await bearer())
      .send({ variantId: VARIANT, quantity: 1, price: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects out-of-range quantities', async () => {
    for (const quantity of [0, 11, 2.5]) {
      const res = await request(app)
        .patch(`/api/v1/cart/items/${VARIANT}`)
        .set('Authorization', await bearer())
        .send({ quantity });
      expect(res.status).toBe(400);
    }
  });

  it('rejects malformed ids', async () => {
    const res = await request(app)
      .delete('/api/v1/cart/items/not-an-id')
      .set('Authorization', await bearer());
    expect(res.status).toBe(400);
  });

  it('rejects oversize guest carts on preview (no sign-in needed)', async () => {
    const items = Array.from({ length: 51 }, () => ({ variantId: VARIANT, quantity: 1 }));
    const res = await request(appFor(null))
      .post('/api/v1/cart/preview')
      .set('Authorization', await bearer())
      .send({ items });
    expect(res.status).toBe(400);
  });

  it('rejects ownership smuggling on addresses', async () => {
    const res = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', await bearer())
      .send({
        user: '65f0000000000000000000ff',
        fullName: 'Asha Rao',
        phone: '9876543210',
        line1: '12 MG Road',
        city: 'Bengaluru',
        state: 'KA',
        pincode: '560001',
      });
    expect(res.status).toBe(400);
  });

  it('does not allow changing email or roles via the profile', async () => {
    for (const body of [{ email: 'x@y.co' }, { roles: ['ADMIN'] }]) {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', await bearer())
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it('keeps security alerts mandatory', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me/notification-preferences')
      .set('Authorization', await bearer())
      .send({ securityAlerts: false });
    expect(res.status).toBe(400);
  });

  it('validates the recently-viewed cards query', async () => {
    const res = await request(app).get('/api/v1/products/cards?slugs=Not%20A%20Slug');
    expect(res.status).toBe(400);
  });
});
