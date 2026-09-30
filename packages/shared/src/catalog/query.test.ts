import { describe, expect, it } from 'vitest';
import { createProductSchema, stockUpdateSchema } from './inputs.js';
import { productListQuerySchema } from './query.js';

describe('productListQuerySchema', () => {
  it('parses filters, CSV lists, attribute and option filters', () => {
    const q = productListQuerySchema.parse({
      q: ' phone ',
      category: 'smartphones',
      brand: 'voltra,nimbus',
      minPrice: '10000',
      maxPrice: '50000',
      rating: '4',
      inStock: 'true',
      color: 'Black, Blue',
      attr_network: '5G',
      sort: 'price_asc',
      page: '2',
    });
    expect(q).toMatchObject({
      q: 'phone',
      category: 'smartphones',
      brand: ['voltra', 'nimbus'],
      minPrice: 10000,
      maxPrice: 50000,
      rating: 4,
      inStock: true,
      sort: 'price_asc',
      page: 2,
      limit: 20,
      attributes: { network: ['5G'] },
      options: { color: ['Black', 'Blue'] },
    });
  });

  it('defaults sort and pagination', () => {
    expect(productListQuerySchema.parse({})).toMatchObject({
      sort: 'relevance',
      page: 1,
      limit: 20,
    });
  });

  it('rejects unknown filters and inverted price ranges', () => {
    expect(productListQuerySchema.safeParse({ hack: '1' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ minPrice: '500', maxPrice: '100' }).success).toBe(
      false,
    );
    expect(productListQuerySchema.safeParse({ sort: 'price' }).success).toBe(false);
  });
});

describe('seller product inputs', () => {
  const variant = { sku: 'abc-001', price: 10_000, mrp: 12_000, stock: 5 };

  it('normalises SKUs and applies defaults', () => {
    const parsed = createProductSchema.parse({
      name: 'Test product',
      categoryId: 'a'.repeat(24),
      variants: [variant],
    });
    expect(parsed.variants[0]?.sku).toBe('ABC-001');
    expect(parsed.status).toBe('DRAFT');
    expect(parsed.returnPolicy).toEqual({ returnable: true, windowDays: 7 });
  });

  it('rejects price above MRP and fractional paise', () => {
    const base = { name: 'Test product', categoryId: 'a'.repeat(24) };
    expect(
      createProductSchema.safeParse({ ...base, variants: [{ ...variant, price: 13_000 }] }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, variants: [{ ...variant, price: 100.5 }] }).success,
    ).toBe(false);
  });

  it('forbids sellers from setting BLOCKED or smuggling seller ids', () => {
    const base = { name: 'Test product', categoryId: 'a'.repeat(24), variants: [variant] };
    expect(createProductSchema.safeParse({ ...base, status: 'BLOCKED' }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, seller: 'b'.repeat(24) }).success).toBe(false);
  });

  it('accepts absolute or relative stock updates', () => {
    expect(stockUpdateSchema.parse({ stock: 10 })).toEqual({ stock: 10 });
    expect(stockUpdateSchema.parse({ adjustBy: -3 })).toEqual({ adjustBy: -3 });
    expect(stockUpdateSchema.safeParse({ stock: -1 }).success).toBe(false);
    expect(stockUpdateSchema.safeParse({ adjustBy: 0 }).success).toBe(false);
  });
});
