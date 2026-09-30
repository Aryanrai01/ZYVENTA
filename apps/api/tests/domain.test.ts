import { slugify } from '@zyventa/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { formatOrderNumber } from '../src/database/counter.js';
import {
  getDummyHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../src/modules/auth/password.js';
import { computeProductAggregates } from '../src/modules/products/product-aggregates.js';
import { BRANDS, CATEGORY_TREE, type CategoryNode } from '../src/scripts/seed/catalog-data.js';
import { createRandom } from '../src/scripts/seed/random.js';

describe('computeProductAggregates', () => {
  const v = (price: number, mrp: number, stock: number, reserved = 0, isActive = true) => ({
    price,
    mrp,
    stock,
    reserved,
    isActive,
  });

  it('uses the cheapest in-stock variant as the headline price', () => {
    const result = computeProductAggregates([v(1000, 2000, 0), v(1500, 2000, 5), v(3000, 3000, 1)]);
    expect(result).toEqual({
      priceMin: 1500,
      priceMax: 3000,
      mrpAtPriceMin: 2000,
      discountPercent: 50,
      inStock: true,
      variantCount: 3,
    });
  });

  it('treats fully reserved stock as out of stock', () => {
    expect(computeProductAggregates([v(1000, 1000, 2, 2)]).inStock).toBe(false);
  });

  it('ignores inactive variants', () => {
    expect(computeProductAggregates([v(1000, 1000, 5, 0, false)])).toMatchObject({
      variantCount: 0,
      inStock: false,
      priceMin: 0,
    });
  });
});

describe('order numbers', () => {
  it('formats ZV<yymm>-<seq>', () => {
    expect(formatOrderNumber(123, new Date(Date.UTC(2026, 8, 27)))).toBe('ZV2609-000123');
    expect(formatOrderNumber(1_234_567, new Date(Date.UTC(2027, 0, 1)))).toBe('ZV2701-1234567');
  });
});

describe('password hashing', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse 42');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toMatch(/m=19456/);
    expect(hash).toMatch(/t=2/);
    expect(hash).toMatch(/p=1/);
    expect(await verifyPassword(hash, 'correct horse 42')).toBe(true);
    expect(await verifyPassword(hash, 'wrong horse 42')).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it('treats malformed hashes as a mismatch', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    expect(await verifyPassword(await getDummyHash(), 'anything')).toBe(false);
  });
});

describe('seed catalogue data', () => {
  const leaves: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      if (node.products) leaves.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(CATEGORY_TREE);

  it('only references declared brands', () => {
    const brands = new Set<string>(BRANDS);
    for (const leaf of leaves) {
      for (const brand of leaf.products?.brands ?? []) expect(brands.has(brand)).toBe(true);
    }
  });

  it('has unique product names and category slugs', () => {
    const names = leaves.flatMap((l) => l.products?.names ?? []);
    expect(new Set(names.map(slugify)).size).toBe(names.length);
  });

  it('never gives a node both products and children', () => {
    const check = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        expect(Boolean(node.products && node.children)).toBe(false);
        if (node.children) check(node.children);
      }
    };
    check(CATEGORY_TREE);
  });

  it('generates reproducible random sequences', () => {
    const a = createRandom(7);
    const b = createRandom(7);
    expect([a.int(1, 100), a.int(1, 100)]).toEqual([b.int(1, 100), b.int(1, 100)]);
  });
});

describe('operator-key guard', () => {
  const app = createApp({ isDatabaseUp: () => true });

  it.each([
    ['operator in body', { email: { $ne: null } }],
    ['dotted key', { 'profile.role': 'ADMIN' }],
    ['nested operator', { items: [{ qty: { $gt: 0 } }] }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).post('/api/v1/health/live').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects operators in the query string', async () => {
    const res = await request(app).get('/api/v1/health/live?$where=1');
    expect(res.status).toBe(400);
  });

  it('lets ordinary payloads through', async () => {
    const res = await request(app).get('/api/v1/health/live?page=2&q=phones');
    expect(res.status).toBe(200);
  });
});
