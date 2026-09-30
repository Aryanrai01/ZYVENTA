import { describe, expect, it } from 'vitest';
import { models } from '../../src/database/models.js';

function indexesOf(
  name: keyof typeof models,
): [Record<string, unknown>, Record<string, unknown>][] {
  return models[name].schema.indexes();
}

function hasIndex(
  name: keyof typeof models,
  keys: Record<string, unknown>,
  options: Record<string, unknown> = {},
) {
  return indexesOf(name).some(
    ([k, o]) =>
      JSON.stringify(k) === JSON.stringify(keys) &&
      Object.entries(options).every(
        ([key, value]) => JSON.stringify(o[key]) === JSON.stringify(value),
      ),
  );
}

describe('database indexes', () => {
  it('enforces uniqueness where the business requires it', () => {
    const unique = { unique: true };
    expect(hasIndex('User', { email: 1 }, unique)).toBe(true);
    expect(hasIndex('Seller', { user: 1 }, unique)).toBe(true);
    expect(hasIndex('Product', { slug: 1 }, unique)).toBe(true);
    expect(hasIndex('ProductVariant', { sku: 1 }, unique)).toBe(true);
    expect(hasIndex('ProductVariant', { product: 1, optionsKey: 1 }, unique)).toBe(true);
    expect(hasIndex('Cart', { user: 1 }, unique)).toBe(true);
    expect(hasIndex('Wishlist', { user: 1 }, unique)).toBe(true);
    expect(hasIndex('Order', { orderNumber: 1 }, unique)).toBe(true);
    expect(hasIndex('Payment', { razorpayOrderId: 1 }, unique)).toBe(true);
    expect(hasIndex('Payment', { razorpayPaymentId: 1 }, unique)).toBe(true);
    expect(hasIndex('WebhookEvent', { provider: 1, eventId: 1 }, unique)).toBe(true);
    expect(hasIndex('Review', { orderItem: 1 }, unique)).toBe(true);
    expect(hasIndex('StockAlert', { user: 1, variant: 1 }, unique)).toBe(true);
    expect(hasIndex('Coupon', { code: 1 }, unique)).toBe(true);
    expect(hasIndex('CouponRedemption', { order: 1 }, unique)).toBe(true);
    expect(hasIndex('Session', { tokenHash: 1 }, unique)).toBe(true);
    expect(hasIndex('IdempotencyKey', { user: 1, scope: 1, key: 1 }, unique)).toBe(true);
  });

  it('uses partial unique indexes for "at most one" rules', () => {
    expect(
      hasIndex(
        'Address',
        { user: 1 },
        { unique: true, partialFilterExpression: { isDefault: true } },
      ),
    ).toBe(true);
    expect(
      hasIndex(
        'SellerApplication',
        { user: 1 },
        { unique: true, partialFilterExpression: { status: 'PENDING' } },
      ),
    ).toBe(true);
  });

  it('expires ephemeral data with TTL indexes', () => {
    expect(hasIndex('Session', { expiresAt: 1 }, { expireAfterSeconds: 0 })).toBe(true);
    expect(hasIndex('AuthToken', { expiresAt: 1 }, { expireAfterSeconds: 0 })).toBe(true);
    expect(hasIndex('IdempotencyKey', { expiresAt: 1 }, { expireAfterSeconds: 0 })).toBe(true);
    expect(
      indexesOf('Notification').some(([, o]) => typeof o.expireAfterSeconds === 'number'),
    ).toBe(true);
  });

  it('has a weighted text index for product search', () => {
    const text = indexesOf('Product').find(([, o]) => o.name === 'product_text_search');
    expect(text?.[1].weights).toMatchObject({ name: 10, brandName: 6 });
  });

  it('keeps the declared index set stable (review snapshot diffs in PRs)', () => {
    const summary = Object.fromEntries(
      Object.keys(models).map((name) => [
        name,
        indexesOf(name as keyof typeof models).map(([keys, options]) => {
          const flags = ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression']
            .filter((flag) => flag in options)
            .map((flag) => `${flag}=${JSON.stringify(options[flag])}`);
          return [JSON.stringify(keys), ...flags].join(' ');
        }),
      ]),
    );
    expect(summary).toMatchSnapshot();
  });
});
