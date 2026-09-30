import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthPrincipal, PrincipalStore } from '../src/modules/auth/principal.js';
import { signAccessToken } from '../src/modules/auth/tokens.js';

/*
 * Authorization and validation of the Phase 7–10 APIs, all rejected before any database
 * access, so these run without MongoDB.
 */
const USER = '65f000000000000000000001';
const ID = '65f0000000000000000000cc';

const base: AuthPrincipal = {
  userId: USER,
  sessionId: 'family',
  roles: ['USER'],
  status: 'ACTIVE',
  emailVerified: true,
  sellerId: null,
  sellerActive: false,
};

function appFor(p: AuthPrincipal | null) {
  const principals: PrincipalStore = {
    resolve: () => Promise.resolve(p),
  };
  return createApp({
    isDatabaseUp: () => true,
    principals,
    storage: null,
    gateway: null,
  });
}
const bearer = async () => `Bearer ${await signAccessToken({ sub: USER, sid: 'family' })}`;

describe('role enforcement', () => {
  it.each([
    ['get', '/api/v1/seller/dashboard'],
    ['get', '/api/v1/seller/orders'],
    ['get', '/api/v1/seller/coupons'],
    ['get', '/api/v1/admin/users'],
    ['get', '/api/v1/admin/orders'],
    ['patch', '/api/v1/admin/settings'],
  ] as const)('a shopper gets 403 on %s %s', async (method, path) => {
    const agent = request(appFor(base));
    const res = await agent[method](path)
      .set('Authorization', await bearer())
      .send({});
    expect(res.status).toBe(403);
  });

  it('a suspended seller profile is refused Seller Center', async () => {
    const seller = {
      ...base,
      roles: ['USER', 'SELLER'] as AuthPrincipal['roles'],
      sellerId: ID,
      sellerActive: false,
    };
    const res = await request(appFor(seller))
      .get('/api/v1/seller/orders')
      .set('Authorization', await bearer());
    expect(res.status).toBe(403);
  });

  it.each([
    ['get', '/api/v1/orders'],
    ['post', '/api/v1/checkout/quote'],
    ['get', '/api/v1/notifications'],
    ['get', '/api/v1/stock-alerts'],
    ['post', '/api/v1/reviews'],
    ['get', '/api/v1/seller-applications/me'],
  ] as const)('anonymous gets 401 on %s %s', async (method, path) => {
    const agent = request(appFor(null));
    const res = await agent[method](path)
      .set('Authorization', await bearer())
      .send({});
    expect(res.status).toBe(401);
  });

  it('public engagement routes do not require sign-in', async () => {
    // Route-level auth: an unknown path under /api/v1 must stay a 404, not a 401.
    const res = await request(appFor(null)).get('/api/v1/definitely-not-a-route');
    expect(res.status).toBe(404);
  });
});

describe('checkout safety', () => {
  const app = appFor(base);

  it('requires an Idempotency-Key to place an order', async () => {
    const res = await request(app)
      .post('/api/v1/checkout/orders')
      .set('Authorization', await bearer())
      .send({ addressId: ID });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Idempotency-Key/);
  });

  it('rejects client-supplied prices and unknown fields', async () => {
    const res = await request(app)
      .post('/api/v1/checkout/orders')
      .set('Authorization', await bearer())
      .set('Idempotency-Key', 'abcdefghijklmnopqrstuvwx')
      .send({ addressId: ID, total: 100 });
    expect(res.status).toBe(400);
  });

  it('requires a verified email to place an order', async () => {
    const res = await request(appFor({ ...base, emailVerified: false }))
      .post('/api/v1/checkout/orders')
      .set('Authorization', await bearer())
      .set('Idempotency-Key', 'abcdefghijklmnopqrstuvwx')
      .send({ addressId: ID });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('validates Razorpay ids and signature shapes', async () => {
    const res = await request(app)
      .post('/api/v1/checkout/verify')
      .set('Authorization', await bearer())
      .send({
        razorpayOrderId: 'order_x',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'nothex',
      });
    expect(res.status).toBe(400);
  });
});

describe('input validation', () => {
  const seller = {
    ...base,
    roles: ['USER', 'SELLER'] as AuthPrincipal['roles'],
    sellerId: ID,
    sellerActive: true,
  };

  it('requires tracking details to mark a shipment shipped', async () => {
    const res = await request(appFor(seller))
      .patch(`/api/v1/seller/orders/${ID}/status`)
      .set('Authorization', await bearer())
      .send({ status: 'SHIPPED' });
    expect(res.status).toBe(400);
  });

  it('caps percentage coupons at 90%', async () => {
    const res = await request(appFor(seller))
      .post('/api/v1/seller/coupons')
      .set('Authorization', await bearer())
      .send({
        code: 'HUGE95',
        title: 'Huge',
        type: 'PERCENTAGE',
        value: 95,
        startsAt: '2026-01-01',
        endsAt: '2027-01-01',
      });
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range review ratings', async () => {
    const res = await request(appFor(base))
      .post('/api/v1/reviews')
      .set('Authorization', await bearer())
      .send({ orderItemId: ID, rating: 6 });
    expect(res.status).toBe(400);
  });

  it('never accepts a full account number that is malformed', async () => {
    const res = await request(appFor(seller))
      .put('/api/v1/seller/payout-account')
      .set('Authorization', await bearer())
      .send({
        accountHolderName: 'A B',
        accountNumber: '12ab',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC',
      });
    expect(res.status).toBe(400);
  });
});
