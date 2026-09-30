import { CSRF_HEADER, IDEMPOTENCY_HEADER } from '@zyventa/shared';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { Cart } from '../../src/modules/cart/cart.model.js';
import { Order } from '../../src/modules/orders/order.model.js';
import { SellerOrder } from '../../src/modules/orders/seller-order.model.js';
import type {
  PaymentGateway,
  RazorpayPayment,
} from '../../src/modules/payments/razorpay.client.js';
import { ProductVariant } from '../../src/modules/products/product-variant.model.js';
import { Product } from '../../src/modules/products/product.model.js';
import { SellerLedgerEntry } from '../../src/modules/sellers/seller-ledger-entry.model.js';
import { Seller } from '../../src/modules/sellers/seller.model.js';
import { User } from '../../src/modules/users/user.model.js';
import { runSeed } from '../../src/scripts/seed/run-seed.js';
import { hmacSha256Hex, safeHexEqual } from '../../src/utils/crypto.js';

const PASSWORD = 'Seed-password-1';
const KEY_SECRET = 'fake-key-secret-for-tests';
const WEBHOOK_SECRET = 'fake-webhook-secret';

/** In-memory stand-in for Razorpay: same signatures, deterministic ids. */
function fakeGateway() {
  const orders = new Map<string, { amount: number }>();
  const payments = new Map<string, RazorpayPayment>();
  const gateway: PaymentGateway = {
    keyId: 'rzp_test_fake',
    createOrder: ({ amount }) => {
      const id = `order_${randomBytes(7).toString('hex')}`;
      orders.set(id, { amount });
      return Promise.resolve({ id, amount, currency: 'INR', receipt: null, status: 'created' });
    },
    fetchPayment: (id) => {
      const p = payments.get(id);
      return p ? Promise.resolve(p) : Promise.reject(new Error('not found'));
    },
    capturePayment: (id) =>
      Promise.resolve({
        ...(payments.get(id) as RazorpayPayment),
        status: 'captured',
        captured: true,
      }),
    refund: (paymentId, { amount }) =>
      Promise.resolve({
        id: `rfnd_${randomBytes(7).toString('hex')}`,
        payment_id: paymentId,
        amount,
        status: 'processed',
      }),
    verifyCheckoutSignature: (o, p, s) => safeHexEqual(hmacSha256Hex(KEY_SECRET, `${o}|${p}`), s),
    verifyWebhookSignature: (raw, s) => safeHexEqual(hmacSha256Hex(WEBHOOK_SECRET, raw), s),
  };
  /** Simulates the shopper paying in Razorpay Checkout. */
  const pay = (razorpayOrderId: string) => {
    const order = orders.get(razorpayOrderId);
    if (!order) throw new Error('unknown order');
    const id = `pay_${randomBytes(7).toString('hex')}`;
    payments.set(id, {
      id,
      order_id: razorpayOrderId,
      amount: order.amount,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      captured: true,
    });
    return {
      razorpayOrderId,
      razorpayPaymentId: id,
      razorpaySignature: hmacSha256Hex(KEY_SECRET, `${razorpayOrderId}|${id}`),
    };
  };
  return { gateway, pay, payments };
}

describe.skipIf(process.env.SKIP_DB_TESTS === '1')('commerce flows (integration)', () => {
  let replSet: MongoMemoryReplSet;
  const fake = fakeGateway();
  const app = createApp({
    isDatabaseUp: () => true,
    storage: null,
    gateway: fake.gateway,
  });

  async function signIn(email: string): Promise<{ agent: TestAgent; csrf: string }> {
    const agent = request.agent(app);
    let csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    const res = await agent
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, csrf)
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    return { agent, csrf };
  }

  let shopper: { agent: TestAgent; csrf: string };
  let sellerUserEmail: string;
  let variantId: string;

  async function fillCart(quantity: number) {
    await Cart.deleteMany({
      user: (await User.findOne({ email: 'aarav@zyventa.test' }).orFail())._id,
    });
    const res = await shopper.agent
      .post('/api/v1/cart/items')
      .set(CSRF_HEADER, shopper.csrf)
      .send({ variantId, quantity });
    expect(res.status).toBe(201);
  }

  async function placeOrder() {
    const addresses = await shopper.agent.get('/api/v1/addresses');
    const addressId = addresses.body.data[0].id as string;
    const quote = await shopper.agent
      .post('/api/v1/checkout/quote')
      .set(CSRF_HEADER, shopper.csrf)
      .send({ addressId });
    expect(quote.body.data.canPlaceOrder).toBe(true);
    const key = randomBytes(16).toString('hex');
    const placed = await shopper.agent
      .post('/api/v1/checkout/orders')
      .set(CSRF_HEADER, shopper.csrf)
      .set(IDEMPOTENCY_HEADER, key)
      .send({ addressId, expectedTotal: quote.body.data.pricing.total });
    expect(placed.status).toBe(201);
    return {
      init: placed.body.data as { orderId: string; razorpayOrderId: string; amount: number },
      key,
      addressId,
      total: quote.body.data.pricing.total as number,
    };
  }

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(replSet.getUri('zyventa_commerce_it'));
    await runSeed({ reset: true, password: PASSWORD, randomSeed: 3 });
    shopper = await signIn('aarav@zyventa.test');
    const sellerUser = await User.findOne({ email: 'techverse@zyventa.test' }).orFail();
    sellerUserEmail = sellerUser.email;
    const seller = await Seller.findOne({ user: sellerUser._id }).orFail();
    const products = await Product.find({ seller: seller._id, status: 'ACTIVE' })
      .select('_id')
      .lean();
    const variant = await ProductVariant.findOne({
      product: { $in: products.map((p) => p._id) },
      isActive: true,
      stock: { $gte: 20 },
    }).orFail();
    variantId = variant._id.toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replSet.stop();
  });

  it('places an order idempotently and reserves stock', async () => {
    await fillCart(2);
    const before = await ProductVariant.findById(variantId).orFail();
    const { init, key, addressId, total } = await placeOrder();
    const after = await ProductVariant.findById(variantId).orFail();
    expect(after.reserved - before.reserved).toBe(2);
    expect(init.amount).toBe(total);

    const replay = await shopper.agent
      .post('/api/v1/checkout/orders')
      .set(CSRF_HEADER, shopper.csrf)
      .set(IDEMPOTENCY_HEADER, key)
      .send({ addressId, expectedTotal: total });
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.orderId).toBe(init.orderId);
    expect(await Order.countDocuments({ _id: init.orderId })).toBe(1);
  });

  it('confirms only after a verified payment, exactly once', async () => {
    await fillCart(1);
    const before = await ProductVariant.findById(variantId).orFail();
    const { init } = await placeOrder();

    const forged = await shopper.agent
      .post('/api/v1/checkout/verify')
      .set(CSRF_HEADER, shopper.csrf)
      .send({
        razorpayOrderId: init.razorpayOrderId,
        razorpayPaymentId: 'pay_forged123',
        razorpaySignature: 'a'.repeat(64),
      });
    expect(forged.status).toBe(400);
    expect((await Order.findById(init.orderId).orFail()).status).toBe('PENDING_PAYMENT');

    const payment = fake.pay(init.razorpayOrderId);
    const verified = await shopper.agent
      .post('/api/v1/checkout/verify')
      .set(CSRF_HEADER, shopper.csrf)
      .send(payment);
    expect(verified.status).toBe(200);

    // The same capture arriving by webhook is a no-op.
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: fake.payments.get(payment.razorpayPaymentId) } },
    });
    const hook = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', hmacSha256Hex(WEBHOOK_SECRET, body))
      .set('X-Razorpay-Event-Id', 'evt_test_1')
      .send(body);
    expect(hook.status).toBe(200);

    const order = await Order.findById(init.orderId).orFail();
    expect(order.status).toBe('CONFIRMED');
    expect(order.paymentStatus).toBe('PAID');
    const after = await ProductVariant.findById(variantId).orFail();
    expect(before.stock - after.stock).toBe(1);
    expect(after.reserved).toBe(before.reserved);
    const shipments = await SellerOrder.find({ order: order._id }).lean();
    expect(shipments.every((s) => s.paidAt)).toBe(true);
    expect(await SellerLedgerEntry.countDocuments({ order: order._id, type: 'SALE' })).toBe(
      shipments.length,
    );
    // Purchased lines leave the cart.
    expect((await shopper.agent.get('/api/v1/cart')).body.data.items).toHaveLength(0);
  });

  it('refunds and restocks when a paid order is cancelled', async () => {
    await fillCart(1);
    const { init } = await placeOrder();
    await shopper.agent
      .post('/api/v1/checkout/verify')
      .set(CSRF_HEADER, shopper.csrf)
      .send(fake.pay(init.razorpayOrderId));
    const stockBefore = (await ProductVariant.findById(variantId).orFail()).stock;

    const res = await shopper.agent
      .post(`/api/v1/orders/${init.orderId}/cancel`)
      .set(CSRF_HEADER, shopper.csrf)
      .send({ reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.paymentStatus).toBe('REFUNDED');
    expect(res.body.data.refunds[0].status).toBe('PROCESSED');
    expect((await ProductVariant.findById(variantId).orFail()).stock).toBe(stockBefore + 1);
  });

  it('expires unpaid orders and releases their reservation', async () => {
    await fillCart(3);
    const { init } = await placeOrder();
    const reserved = (await ProductVariant.findById(variantId).orFail()).reserved;
    await Order.updateOne(
      { _id: init.orderId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(await app.locals.container.checkout.expireStaleOrders()).toBeGreaterThanOrEqual(1);
    expect((await Order.findById(init.orderId).orFail()).status).toBe('EXPIRED');
    expect((await ProductVariant.findById(variantId).orFail()).reserved).toBe(reserved - 3);
  });

  it('runs fulfilment, a return with refund, and a verified review', async () => {
    await fillCart(2);
    const { init } = await placeOrder();
    await shopper.agent
      .post('/api/v1/checkout/verify')
      .set(CSRF_HEADER, shopper.csrf)
      .send(fake.pay(init.razorpayOrderId));
    const seller = await signIn(sellerUserEmail);
    const so = await SellerOrder.findOne({ order: init.orderId }).orFail();
    const move = (body: Record<string, string>) =>
      seller.agent
        .patch(`/api/v1/seller/orders/${so._id.toString()}/status`)
        .set(CSRF_HEADER, seller.csrf)
        .send(body);

    expect((await move({ status: 'DELIVERED' })).status).toBe(409); // can't skip steps
    for (const status of ['PROCESSING', 'PACKED'])
      expect((await move({ status })).status).toBe(200);
    expect(
      (await move({ status: 'SHIPPED', carrier: 'Delhivery', trackingNumber: 'DLV123456' })).status,
    ).toBe(200);
    expect((await move({ status: 'DELIVERED' })).status).toBe(200);

    const detail = await shopper.agent.get(`/api/v1/orders/${init.orderId}`);
    const item = detail.body.data.shipments[0].items[0];
    expect(item.canReturn).toBe(true);
    expect(item.canReview).toBe(true);

    const ret = await shopper.agent
      .post(`/api/v1/orders/${init.orderId}/returns`)
      .set(CSRF_HEADER, shopper.csrf)
      .send({ orderItemId: item.id, quantity: 1, reason: 'DEFECTIVE' });
    expect(ret.status).toBe(201);
    const returnId = ret.body.data.returns[0].id as string;
    for (const status of ['APPROVED', 'PICKED_UP', 'RECEIVED']) {
      const r = await seller.agent
        .patch(`/api/v1/seller/returns/${returnId}`)
        .set(CSRF_HEADER, seller.csrf)
        .send({ status });
      expect(r.status).toBe(200);
    }
    const after = await shopper.agent.get(`/api/v1/orders/${init.orderId}`);
    expect(after.body.data.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(after.body.data.returns[0].status).toBe('REFUNDED');

    const review = await shopper.agent
      .post('/api/v1/reviews')
      .set(CSRF_HEADER, shopper.csrf)
      .send({ orderItemId: item.id, rating: 4, title: 'Good <b>value</b>' });
    expect(review.status).toBe(201);
    expect(review.body.data.title).toBe('Good value');
    const again = await shopper.agent
      .post('/api/v1/reviews')
      .set(CSRF_HEADER, shopper.csrf)
      .send({ orderItemId: item.id, rating: 5 });
    expect(again.status).toBe(409);
  });

  it('keeps sellers out of each other’s orders', async () => {
    const other = await signIn('loom@zyventa.test');
    const so = await SellerOrder.findOne({ paidAt: { $ne: null } }).orFail();
    const res = await other.agent.get(`/api/v1/seller/orders/${so._id.toString()}`);
    expect(res.status).toBe(404);
  });
});
