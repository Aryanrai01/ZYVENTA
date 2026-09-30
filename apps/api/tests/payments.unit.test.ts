import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { PaymentGateway } from '../src/modules/payments/razorpay.client.js';
import { hmacSha256Hex, safeHexEqual } from '../src/utils/crypto.js';

const WEBHOOK_SECRET = 'test-webhook-secret';

const gateway: PaymentGateway = {
  keyId: 'rzp_test_abc',
  createOrder: () => Promise.reject(new Error('not used')),
  fetchPayment: () => Promise.reject(new Error('not used')),
  capturePayment: () => Promise.reject(new Error('not used')),
  refund: () => Promise.reject(new Error('not used')),
  verifyCheckoutSignature: () => false,
  verifyWebhookSignature: (raw, signature) =>
    safeHexEqual(hmacSha256Hex(WEBHOOK_SECRET, raw), signature),
};

describe('crypto helpers', () => {
  it('computes Razorpay-style HMAC signatures', () => {
    const expected = createHmac('sha256', 'secret').update('order_1|pay_1').digest('hex');
    expect(hmacSha256Hex('secret', 'order_1|pay_1')).toBe(expected);
  });

  it('compares digests in constant time and rejects malformed input', () => {
    const a = hmacSha256Hex('k', 'x');
    expect(safeHexEqual(a, a)).toBe(true);
    expect(safeHexEqual(a, a.replace(/.$/, a.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(safeHexEqual(a, 'zz')).toBe(false);
    expect(safeHexEqual(a, a.slice(2))).toBe(false);
  });
});

describe('Razorpay webhook endpoint', () => {
  const app = createApp({ isDatabaseUp: () => true, storage: null, gateway });

  it('rejects unsigned or wrongly signed payloads before touching the database', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} });
    const unsigned = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(unsigned.status).toBe(400);
    const forged = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', hmacSha256Hex('wrong-secret', body))
      .send(body);
    expect(forged.status).toBe(400);
  });

  it('is not subject to the CSRF check (authenticated by signature instead)', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Cookie', 'zv_at=anything')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body.code).not.toBe('CSRF_INVALID');
  });

  it('refuses webhooks entirely when payments are not configured', async () => {
    const noGateway = createApp({
      isDatabaseUp: () => true,
      storage: null,
      gateway: null,
    });
    const body = '{"event":"payment.captured"}';
    const res = await request(noGateway)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', hmacSha256Hex(WEBHOOK_SECRET, body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
