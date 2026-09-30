import { CSRF_HEADER } from '@zyventa/shared';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { AuditLog } from '../../src/modules/audit/audit-log.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Notification } from '../../src/modules/notifications/notification.model.js';
import { ProductVariant } from '../../src/modules/products/product-variant.model.js';
import { Product } from '../../src/modules/products/product.model.js';
import { StockAlert } from '../../src/modules/stock-alerts/stock-alert.model.js';
import { User } from '../../src/modules/users/user.model.js';
import { runSeed } from '../../src/scripts/seed/run-seed.js';

const PASSWORD = 'Seed-password-1';

describe.skipIf(process.env.SKIP_DB_TESTS === '1')('catalogue (integration)', () => {
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
    csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string; // rotated on login
    return { agent, csrf };
  }

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(replSet.getUri('zyventa_catalog_it'));
    await runSeed({ reset: true, password: PASSWORD, randomSeed: 7 });
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replSet.stop();
  });

  describe('public listing', () => {
    it('paginates active products', async () => {
      const res = await request(app).get('/api/v1/products?limit=10');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(10);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, hasNextPage: true });
      expect(res.headers['cache-control']).toContain('public');
    });

    it('filters by category including subcategories', async () => {
      const fashion = await request(app).get('/api/v1/products?category=fashion&limit=60');
      const tees = await request(app).get('/api/v1/products?category=t-shirts&limit=60');
      expect(tees.body.pagination.total).toBeGreaterThan(0);
      expect(fashion.body.pagination.total).toBeGreaterThan(tees.body.pagination.total);
    });

    it('searches full words, then prefixes, then SKUs', async () => {
      const text = await request(app).get('/api/v1/products?q=voltra');
      expect(text.headers['x-search-mode']).toBe('text');
      expect(text.body.data.length).toBeGreaterThan(0);

      const prefix = await request(app).get('/api/v1/products?q=kitch');
      expect(prefix.headers['x-search-mode']).toBe('prefix');
      expect(prefix.body.data.every((p: { brandName: string }) => p.brandName === 'Kitchora')).toBe(
        true,
      );

      const variant = await ProductVariant.findOne().lean();
      const sku = await request(app).get(`/api/v1/products?q=${variant?.sku ?? ''}`);
      expect(sku.headers['x-search-mode']).toBe('sku');
      expect(sku.body.data).toHaveLength(1);
    });

    it('applies price range and sorts by price', async () => {
      const res = await request(app).get(
        '/api/v1/products?minPrice=1000&maxPrice=20000&sort=price_asc&limit=60',
      );
      const prices = (res.body.data as { price: number }[]).map((p) => p.price);
      expect(prices.every((p) => p >= 100_000 && p <= 2_000_000)).toBe(true);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    });

    it('returns nothing for an unknown brand, and 404 for an unknown category', async () => {
      expect(
        (await request(app).get('/api/v1/products?brand=no-such-brand')).body.pagination.total,
      ).toBe(0);
      expect((await request(app).get('/api/v1/products?category=no-such-category')).status).toBe(
        404,
      );
    });

    it('filters by variant options and attributes', async () => {
      const color = await request(app).get(
        '/api/v1/products?category=smartphones&color=Glacier%20Blue',
      );
      expect(color.body.pagination.total).toBeGreaterThan(0);
      const attr = await request(app).get('/api/v1/products?category=smartphones&attr_network=4G');
      const all = await request(app).get('/api/v1/products?category=smartphones');
      expect(attr.body.pagination.total).toBeLessThan(all.body.pagination.total);
    });

    it('computes facets for a category', async () => {
      const res = await request(app).get('/api/v1/products/facets?category=smartphones');
      expect(res.status).toBe(200);
      expect(res.body.data.brands.map((b: { value: string }) => b.value)).toContain('voltra');
      expect(res.body.data.options.map((o: { key: string }) => o.key)).toEqual(
        expect.arrayContaining(['color', 'storage']),
      );
      expect(res.body.data.attributes[0]).toMatchObject({ key: 'network', label: 'Network' });
      expect(res.body.data.priceRange.min).toBeLessThanOrEqual(res.body.data.priceRange.max);
    });

    it('serves product detail without exposing exact stock', async () => {
      const { data } = (await request(app).get('/api/v1/products?category=smartphones&limit=1'))
        .body;
      const res = await request(app).get(`/api/v1/products/${data[0].slug as string}`);
      expect(res.status).toBe(200);
      expect(res.body.data.variants.length).toBeGreaterThan(1);
      expect(res.body.data.breadcrumbs.map((b: { slug: string }) => b.slug)).toEqual([
        'electronics',
        'smartphones',
      ]);
      expect(JSON.stringify(res.body.data.variants)).not.toMatch(/"stock"|"reserved"/);

      const related = await request(app).get(`/api/v1/products/${data[0].slug as string}/related`);
      expect(related.body.data.length).toBeGreaterThan(0);
    });

    it('suggests categories, brands and products', async () => {
      const res = await request(app).get('/api/v1/products/suggestions?q=kitch');
      const types = (res.body.data as { type: string }[]).map((s) => s.type);
      expect(types).toEqual(expect.arrayContaining(['brand', 'product']));
    });
  });

  describe('seller product management', () => {
    let productId = '';

    it('creates, publishes and lists a product with variants', async () => {
      const { agent, csrf } = await signIn('techverse@zyventa.test');
      const category = await Category.findOne({ slug: 'headphones-and-earbuds' }).lean();
      const res = await agent
        .post('/api/v1/seller/products')
        .set(CSRF_HEADER, csrf)
        .send({
          name: 'Tarang Air Lite',
          categoryId: category?._id.toString(),
          description: '<p>Great sound</p><script>alert(1)</script>',
          images: [{ url: '/placeholders/electronics.svg', alt: 'Tarang Air Lite' }],
          variantOptions: [{ name: 'color', values: ['Black', 'White'] }],
          variants: [
            {
              sku: 'IT-TAL-BLK',
              options: { color: 'Black' },
              price: 199_900,
              mrp: 299_900,
              stock: 10,
            },
            {
              sku: 'IT-TAL-WHT',
              options: { color: 'White' },
              price: 209_900,
              mrp: 299_900,
              stock: 0,
            },
          ],
          status: 'ACTIVE',
        });
      expect(res.status).toBe(201);
      productId = res.body.data.id as string;
      expect(res.body.data.description).toBe('<p>Great sound</p>');
      expect(res.body.data.variants).toHaveLength(2);

      const listed = await request(app).get('/api/v1/products?q=tarang%20air');
      expect(listed.body.data.map((p: { name: string }) => p.name)).toContain('Tarang Air Lite');
      const product = await Product.findById(productId).lean();
      expect(product).toMatchObject({
        priceMin: 199_900,
        priceMax: 209_900,
        inStock: true,
        variantCount: 2,
      });
    });

    it('rejects duplicate SKUs and invalid option combinations', async () => {
      const { agent, csrf } = await signIn('techverse@zyventa.test');
      const dup = await agent
        .post(`/api/v1/seller/products/${productId}/variants`)
        .set(CSRF_HEADER, csrf)
        .send({ sku: 'IT-TAL-BLK', options: { color: 'Red' }, price: 199_900, mrp: 299_900 });
      expect(dup.status).toBe(409);
      const bad = await agent
        .post(`/api/v1/seller/products/${productId}/variants`)
        .set(CSRF_HEADER, csrf)
        .send({ sku: 'IT-TAL-RED', options: { size: 'L' }, price: 199_900, mrp: 299_900 });
      expect(bad.status).toBe(400);
    });

    it('audits price changes', async () => {
      const { agent, csrf } = await signIn('techverse@zyventa.test');
      const variant = await ProductVariant.findOne({ sku: 'IT-TAL-BLK' }).lean();
      const res = await agent
        .patch(`/api/v1/seller/products/${productId}/variants/${variant?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf)
        .send({ price: 189_900 });
      expect(res.status).toBe(200);
      const log = await AuditLog.findOne({
        action: 'variant.price_changed',
        resourceId: variant?._id.toString(),
      }).lean();
      expect(log?.metadata).toMatchObject({
        before: { price: 199_900 },
        after: { price: 189_900 },
      });
      expect(log?.actorRole).toBe('SELLER');
    });

    it('never lets another seller see or edit the product (IDOR → 404)', async () => {
      const { agent, csrf } = await signIn('loom@zyventa.test');
      expect((await agent.get(`/api/v1/seller/products/${productId}`)).status).toBe(404);
      const edit = await agent
        .patch(`/api/v1/seller/products/${productId}`)
        .set(CSRF_HEADER, csrf)
        .send({ name: 'Hijacked' });
      expect(edit.status).toBe(404);
      const variant = await ProductVariant.findOne({ sku: 'IT-TAL-BLK' }).lean();
      const stock = await agent
        .patch(`/api/v1/seller/inventory/${variant?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf)
        .send({ stock: 0 });
      expect(stock.status).toBe(404);
    });

    it('refuses to set stock below reserved units', async () => {
      const { agent, csrf } = await signIn('techverse@zyventa.test');
      const variant = await ProductVariant.findOneAndUpdate(
        { sku: 'IT-TAL-BLK' },
        { $set: { reserved: 4 } },
        { returnDocument: 'after' },
      ).lean();
      const res = await agent
        .patch(`/api/v1/seller/inventory/${variant?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf)
        .send({ stock: 3 });
      expect(res.status).toBe(409);
      const ok = await agent
        .patch(`/api/v1/seller/inventory/${variant?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf)
        .send({ adjustBy: 5 });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ stock: 15, reserved: 4, available: 11 });
    });

    it('notifies subscribers once when a variant comes back in stock', async () => {
      const { agent, csrf } = await signIn('techverse@zyventa.test');
      const white = await ProductVariant.findOne({ sku: 'IT-TAL-WHT' }).lean();
      const customer = await User.findOne({ email: 'aarav@zyventa.test' }).lean();
      await StockAlert.create({
        user: customer?._id,
        product: white?.product,
        variant: white?._id,
      });

      await agent
        .patch(`/api/v1/seller/inventory/${white?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf)
        .send({ stock: 5 });
      await new Promise((resolve) => setTimeout(resolve, 300)); // background fan-out
      await agent
        .patch(`/api/v1/seller/inventory/${white?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf)
        .send({ stock: 8 });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(
        await Notification.countDocuments({ user: customer?._id, type: 'BACK_IN_STOCK' }),
      ).toBe(1);
      expect((await StockAlert.findOne({ variant: white?._id }).lean())?.status).toBe('NOTIFIED');
    });

    it('archives products so shoppers no longer see them', async () => {
      const { agent, csrf } = await signIn('techverse@zyventa.test');
      const slug = (await Product.findById(productId).lean())?.slug ?? '';
      expect(
        (await agent.delete(`/api/v1/seller/products/${productId}`).set(CSRF_HEADER, csrf)).status,
      ).toBe(200);
      expect((await request(app).get(`/api/v1/products/${slug}`)).status).toBe(404);
    });
  });

  describe('admin catalogue management', () => {
    it('moves a category and re-paths its products', async () => {
      const { agent, csrf } = await signIn('admin@zyventa.test');
      const cycling = await Category.findOne({ slug: 'cycling' }).lean();
      const electronics = await Category.findOne({ slug: 'electronics' }).lean();
      const res = await agent
        .patch(`/api/v1/admin/categories/${cycling?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf)
        .send({ parentId: electronics?._id.toString() });
      expect(res.status).toBe(200);

      const moved = await Category.findById(cycling?._id).lean();
      expect(moved?.ancestors.map((a) => a.slug)).toEqual(['electronics']);
      const product = await Product.findOne({ category: cycling?._id }).lean();
      expect(product?.categoryPath.map(String)).toEqual([
        electronics?._id.toString(),
        cycling?._id.toString(),
      ]);
      expect(await AuditLog.exists({ action: 'category.moved' })).not.toBeNull();
    });

    it('refuses to delete categories that are in use', async () => {
      const { agent, csrf } = await signIn('admin@zyventa.test');
      const electronics = await Category.findOne({ slug: 'electronics' }).lean();
      const res = await agent
        .delete(`/api/v1/admin/categories/${electronics?._id.toString() ?? ''}`)
        .set(CSRF_HEADER, csrf);
      expect(res.status).toBe(409);
    });
  });
});
