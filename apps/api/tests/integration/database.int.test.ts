import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { nextOrderNumber, nextSequence } from '../../src/database/counter.js';
import { mongoose } from '../../src/database/mongoose.js';
import { syncAllIndexes } from '../../src/database/sync-indexes.js';
import { AuditLog } from '../../src/modules/audit/audit-log.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Coupon } from '../../src/modules/coupons/coupon.model.js';
import { refreshProductAggregates } from '../../src/modules/products/product-aggregates.js';
import { ProductVariant } from '../../src/modules/products/product-variant.model.js';
import { Product } from '../../src/modules/products/product.model.js';
import { Seller } from '../../src/modules/sellers/seller.model.js';
import { Address } from '../../src/modules/users/address.model.js';
import { User } from '../../src/modules/users/user.model.js';
import { runSeed, type SeedSummary } from '../../src/scripts/seed/run-seed.js';

/*
 * Full-stack database tests against a real in-memory MongoDB replica set: runs the seed,
 * then checks constraints that only the database can enforce (unique/partial indexes,
 * atomic reservations, transactions). First run downloads a mongod binary (~100 MB).
 */
describe.skipIf(process.env.SKIP_DB_TESTS === '1')('database integration', () => {
  let replSet: MongoMemoryReplSet;
  let summary: SeedSummary;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(replSet.getUri('zyventa_it'));
    summary = await runSeed({ reset: true, password: 'Seed-password-1', randomSeed: 42 });
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replSet.stop();
  });

  it('seeds a coherent catalogue', async () => {
    expect(summary.catalog.products).toBeGreaterThan(80);
    expect(summary.catalog.variants).toBeGreaterThan(summary.catalog.products);
    expect(await Product.countDocuments({ status: 'ACTIVE' })).toBe(summary.catalog.products);
    expect(await Seller.countDocuments({ status: 'ACTIVE' })).toBe(4);
    expect(await Coupon.countDocuments()).toBe(summary.coupons);
    expect(summary.logins.some((l) => l.role === 'ADMIN')).toBe(true);
  });

  it('stores product aggregates consistent with variants', async () => {
    const product = await Product.findOne({ variantCount: { $gt: 1 } }).lean();
    expect(product).not.toBeNull();
    const variants = await ProductVariant.find({ product: product?._id }).lean();
    expect(product?.variantCount).toBe(variants.length);
    expect(product?.priceMax).toBe(Math.max(...variants.map((v) => v.price)));
  });

  it('builds category subtrees queryable via ancestors and categoryPath', async () => {
    const electronics = await Category.findOne({ slug: 'electronics' }).lean();
    const children = await Category.countDocuments({ 'ancestors._id': electronics?._id });
    expect(children).toBeGreaterThan(0);
    const products = await Product.countDocuments({
      status: 'ACTIVE',
      categoryPath: electronics?._id,
    });
    expect(products).toBeGreaterThan(0);
  });

  it('leaves every index in sync after seeding', async () => {
    const diffs = await syncAllIndexes({ apply: false });
    expect(diffs.filter((d) => d.toCreate.length > 0 || d.toDrop.length > 0)).toEqual([]);
  });

  it('serves text search from the weighted index', async () => {
    const hits = await Product.find(
      { $text: { $search: 'voltra' } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(5)
      .lean();
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.brandName).toBe('Voltra');
  });

  it('rejects duplicate emails regardless of case', async () => {
    await expect(
      User.create({ name: 'Dup', email: 'ADMIN@zyventa.test', passwordHash: 'x'.repeat(40) }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows only one default address per user', async () => {
    const existing = await Address.findOne({ isDefault: true }).lean();
    const copy = {
      user: existing?.user,
      fullName: existing?.fullName,
      phone: existing?.phone,
      line1: existing?.line1,
      city: existing?.city,
      state: existing?.state,
      pincode: existing?.pincode,
    };
    await expect(Address.create({ ...copy, isDefault: true })).rejects.toMatchObject({
      code: 11000,
    });
    await expect(Address.create({ ...copy, isDefault: false })).resolves.toBeDefined();
  });

  it('reserves stock atomically and never oversells', async () => {
    const variant = await ProductVariant.create({
      product: (await Product.findOne().lean())?._id,
      seller: (await Seller.findOne().lean())?._id,
      sku: 'IT-RACE-01',
      options: { color: 'Race Test' },
      price: 10_000,
      mrp: 10_000,
      stock: 5,
    });

    // 10 concurrent shoppers each try to reserve 1 unit of a 5-unit stock.
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        ProductVariant.updateOne(
          { _id: variant._id, $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, 1] } },
          { $inc: { reserved: 1 } },
        ),
      ),
    );
    expect(attempts.filter((r) => r.modifiedCount === 1)).toHaveLength(5);
    const after = await ProductVariant.findById(variant._id).lean();
    expect(after?.reserved).toBe(5);

    const aggregates = await refreshProductAggregates(variant.product);
    expect(aggregates.variantCount).toBeGreaterThan(0);
  });

  it('issues gap-free, unique order numbers under concurrency', async () => {
    const numbers = await Promise.all(Array.from({ length: 20 }, () => nextOrderNumber()));
    expect(new Set(numbers).size).toBe(20);
    expect(await nextSequence('it-counter')).toBe(1);
    expect(await nextSequence('it-counter')).toBe(2);
  });

  it('commits or rolls back multi-document transactions', async () => {
    const before = await Category.countDocuments();
    await expect(
      mongoose.connection.transaction(async (session) => {
        await Category.create([{ name: 'Temp', slug: 'temp-rollback' }], { session });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await Category.countDocuments()).toBe(before);
  });

  it('keeps audit logs append-only in the database too', async () => {
    const log = await AuditLog.create({
      actorRole: 'SYSTEM',
      action: 'test.created',
      resource: 'SETTINGS',
      resourceId: 'platform',
    });
    log.action = 'test.changed';
    await expect(log.save()).rejects.toThrow(/append-only/);
  });

  it('refuses to reseed a populated database without --reset', async () => {
    await expect(runSeed({ reset: false, password: 'Seed-password-1' })).rejects.toThrow(/--reset/);
  });
});
