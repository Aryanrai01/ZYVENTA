import { CSRF_HEADER } from '@zyventa/shared';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { Cart } from '../../src/modules/cart/cart.model.js';
import { ProductVariant } from '../../src/modules/products/product-variant.model.js';
import { Product } from '../../src/modules/products/product.model.js';
import { Address } from '../../src/modules/users/address.model.js';
import { User } from '../../src/modules/users/user.model.js';
import { Wishlist } from '../../src/modules/wishlist/wishlist.model.js';
import { runSeed } from '../../src/scripts/seed/run-seed.js';

const PASSWORD = 'Seed-password-1';
const ADDRESS = {
  fullName: 'Aarav Sharma',
  phone: '9876500001',
  line1: '42, 5th Cross, Bellandur',
  city: 'Bengaluru',
  state: 'KA',
  pincode: '560103',
};

describe.skipIf(process.env.SKIP_DB_TESTS === '1')('shopper flows (integration)', () => {
  let replSet: MongoMemoryReplSet;
  const app = createApp({ isDatabaseUp: () => true, storage: null });

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

  /** An in-stock active variant of an active product with at least `minAvailable` units. */
  async function sellableVariant(minAvailable = 5, skip = 0) {
    const products = await Product.find({ status: 'ACTIVE' }).select('_id').lean();
    const variants = await ProductVariant.find({
      product: { $in: products.map((p) => p._id) },
      isActive: true,
      $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, minAvailable] },
    })
      .sort({ _id: 1 })
      .skip(skip)
      .limit(1)
      .lean();
    const variant = variants[0];
    if (!variant) throw new Error('Seed has no sellable variant');
    return variant;
  }

  let aaravId: string;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(replSet.getUri('zyventa_shopper_it'));
    await runSeed({ reset: true, password: PASSWORD, randomSeed: 11 });
    aaravId = (await User.findOne({ email: 'aarav@zyventa.test' }).orFail())._id.toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replSet.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Cart.deleteMany({ user: aaravId }),
      Wishlist.deleteMany({ user: aaravId }),
      Address.deleteMany({ user: aaravId }),
    ]);
  });

  describe('cart', () => {
    it('adds, merges quantities and prices from the catalogue', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const variant = await sellableVariant();
      const id = variant._id.toString();

      const first = await agent
        .post('/api/v1/cart/items')
        .set(CSRF_HEADER, csrf)
        .send({ variantId: id, quantity: 1 });
      expect(first.status).toBe(201);
      const second = await agent
        .post('/api/v1/cart/items')
        .set(CSRF_HEADER, csrf)
        .send({ variantId: id, quantity: 2 });
      expect(second.body.data.items).toHaveLength(1);
      expect(second.body.data.items[0]).toMatchObject({
        variantId: id,
        quantity: 3,
        unitPrice: variant.price,
        lineTotal: variant.price * 3,
        status: 'OK',
      });
      expect(second.body.data.summary.subtotal).toBe(variant.price * 3);
    });

    it('refuses more than is available', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const variant = await sellableVariant();
      await ProductVariant.updateOne({ _id: variant._id }, { $set: { stock: 2, reserved: 0 } });
      const res = await agent
        .post('/api/v1/cart/items')
        .set(CSRF_HEADER, csrf)
        .send({ variantId: variant._id.toString(), quantity: 3 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
      await ProductVariant.updateOne({ _id: variant._id }, { $set: { stock: variant.stock } });
    });

    it('reflects later price changes and stock loss on read', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const variant = await sellableVariant(5, 1);
      await agent
        .post('/api/v1/cart/items')
        .set(CSRF_HEADER, csrf)
        .send({ variantId: variant._id.toString(), quantity: 2 });

      const newPrice = Math.max(100, variant.price - 1000);
      await ProductVariant.updateOne(
        { _id: variant._id },
        { $set: { price: newPrice, stock: 1, reserved: 0 } },
      );
      const res = await agent.get('/api/v1/cart');
      expect(res.body.data.items[0]).toMatchObject({
        unitPrice: newPrice,
        previousUnitPrice: variant.price,
        status: 'QUANTITY_REDUCED',
        maxQuantity: 1,
        lineTotal: newPrice,
      });
      expect(res.body.data.hasIssues).toBe(true);
      await ProductVariant.updateOne(
        { _id: variant._id },
        { $set: { price: variant.price, stock: variant.stock } },
      );
    });

    it('prices a guest cart and merges it at sign-in without doubling', async () => {
      const guest = request.agent(app);
      const csrf = (await guest.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
      const a = await sellableVariant(5, 2);
      const b = await sellableVariant(5, 3);
      const items = [
        { variantId: a._id.toString(), quantity: 2 },
        { variantId: b._id.toString(), quantity: 1 },
      ];

      const preview = await guest
        .post('/api/v1/cart/preview')
        .set(CSRF_HEADER, csrf)
        .send({ items });
      expect(preview.status).toBe(200);
      expect(preview.body.data.summary.itemCount).toBe(3);
      expect(await Cart.countDocuments({ user: aaravId })).toBe(0); // nothing stored

      const user = await signIn('aarav@zyventa.test');
      await user.agent
        .post('/api/v1/cart/items')
        .set(CSRF_HEADER, user.csrf)
        .send({ variantId: a._id.toString(), quantity: 1 });
      const merged = await user.agent
        .post('/api/v1/cart/merge')
        .set(CSRF_HEADER, user.csrf)
        .send({ items });
      expect(merged.status).toBe(200);
      const quantities = Object.fromEntries(
        (merged.body.data.items as { variantId: string; quantity: number }[]).map((i) => [
          i.variantId,
          i.quantity,
        ]),
      );
      expect(quantities).toEqual({ [a._id.toString()]: 2, [b._id.toString()]: 1 });
    });

    it('updates and removes lines', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const variant = await sellableVariant();
      const id = variant._id.toString();
      await agent
        .post('/api/v1/cart/items')
        .set(CSRF_HEADER, csrf)
        .send({ variantId: id, quantity: 1 });

      const updated = await agent
        .patch(`/api/v1/cart/items/${id}`)
        .set(CSRF_HEADER, csrf)
        .send({ quantity: 4 });
      expect(updated.body.data.items[0].quantity).toBe(4);

      const removed = await agent.delete(`/api/v1/cart/items/${id}`).set(CSRF_HEADER, csrf);
      expect(removed.body.data.items).toHaveLength(0);
    });

    it('requires the CSRF token for cookie-authenticated writes', async () => {
      const { agent } = await signIn('aarav@zyventa.test');
      const variant = await sellableVariant();
      const res = await agent
        .post('/api/v1/cart/items')
        .send({ variantId: variant._id.toString(), quantity: 1 });
      expect(res.status).toBe(403);
    });
  });

  describe('wishlist', () => {
    it('saves idempotently and lists active products', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const product = await Product.findOne({ status: 'ACTIVE' }).orFail();
      const id = product._id.toString();

      for (let i = 0; i < 2; i += 1) {
        const res = await agent
          .post('/api/v1/wishlist')
          .set(CSRF_HEADER, csrf)
          .send({ productId: id });
        expect(res.status).toBe(201);
        expect(res.body.data).toEqual([id]);
      }
      const list = await agent.get('/api/v1/wishlist');
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0].product.id).toBe(id);

      await agent.delete(`/api/v1/wishlist/${id}`).set(CSRF_HEADER, csrf);
      expect((await agent.get('/api/v1/wishlist/ids')).body.data).toEqual([]);
    });

    it('refuses products that are not on sale', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const product = await Product.findOne({ status: { $ne: 'ACTIVE' } });
      if (!product) return;
      const res = await agent
        .post('/api/v1/wishlist')
        .set(CSRF_HEADER, csrf)
        .send({ productId: product._id.toString() });
      expect(res.status).toBe(404);
    });
  });

  describe('addresses', () => {
    it('makes the first address default and keeps exactly one default', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const first = await agent.post('/api/v1/addresses').set(CSRF_HEADER, csrf).send(ADDRESS);
      expect(first.status).toBe(201);
      expect(first.body.data.isDefault).toBe(true);

      const second = await agent
        .post('/api/v1/addresses')
        .set(CSRF_HEADER, csrf)
        .send({ ...ADDRESS, label: 'WORK', isDefault: true });
      expect(second.body.data.isDefault).toBe(true);

      const list = await agent.get('/api/v1/addresses');
      expect(list.body.data.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
      expect(list.body.data[0].id).toBe(second.body.data.id);

      // Deleting the default promotes another.
      const afterDelete = await agent
        .delete(`/api/v1/addresses/${second.body.data.id as string}`)
        .set(CSRF_HEADER, csrf);
      expect(afterDelete.body.data).toHaveLength(1);
      expect(afterDelete.body.data[0].isDefault).toBe(true);
    });

    it("hides other users' addresses (IDOR)", async () => {
      const diya = await signIn('diya@zyventa.test');
      const created = await diya.agent
        .post('/api/v1/addresses')
        .set(CSRF_HEADER, diya.csrf)
        .send({ ...ADDRESS, fullName: 'Diya Patel' });
      const id = created.body.data.id as string;

      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const patch = await agent
        .patch(`/api/v1/addresses/${id}`)
        .set(CSRF_HEADER, csrf)
        .send({ city: 'Pune' });
      expect(patch.status).toBe(404);
      const del = await agent.delete(`/api/v1/addresses/${id}`).set(CSRF_HEADER, csrf);
      expect(del.status).toBe(404);
      expect(await Address.exists({ _id: id })).toBeTruthy();
    });
  });

  describe('profile', () => {
    it('updates name and clears phone', async () => {
      const { agent, csrf } = await signIn('aarav@zyventa.test');
      const res = await agent
        .patch('/api/v1/users/me')
        .set(CSRF_HEADER, csrf)
        .send({ name: 'Aarav S', phone: '' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'Aarav S', phone: null });

      const prefs = await agent
        .patch('/api/v1/users/me/notification-preferences')
        .set(CSRF_HEADER, csrf)
        .send({ promotions: true });
      expect(prefs.body.data.notificationPreferences).toMatchObject({
        promotions: true,
        securityAlerts: true,
      });
    });
  });

  describe('recently viewed cards', () => {
    it('returns cards in the requested order and drops unknown slugs', async () => {
      const products = await Product.find({ status: 'ACTIVE' }).limit(2).lean();
      const slugs = [products[1]?.slug, 'does-not-exist', products[0]?.slug].join(',');
      const res = await request(app).get(`/api/v1/products/cards?slugs=${slugs}`);
      expect(res.body.data.map((p: { slug: string }) => p.slug)).toEqual([
        products[1]?.slug,
        products[0]?.slug,
      ]);
    });
  });
});
