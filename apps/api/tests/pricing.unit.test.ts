import { describe, expect, it } from 'vitest';
import {
  bestOffer,
  discountFor,
  matchesScope,
  priceOrder,
  type CouponRule,
  type EngineLine,
  type OfferRule,
} from '../src/modules/pricing/pricing-engine.js';

const emptyScope = { categories: [], products: [], brands: [], sellers: [] };
const shipping = { freeShippingThreshold: 49_900, flatFeePerShipment: 4_000 };

const line = (over: Partial<EngineLine> = {}): EngineLine => ({
  variantId: 'v1',
  productId: 'p1',
  sellerId: 's1',
  categoryPath: ['electronics', 'phones'],
  brandId: 'b1',
  quantity: 1,
  status: 'OK',
  maxQuantity: 10,
  listPrice: 100_000,
  mrp: 120_000,
  gstRateBps: 1800,
  ...over,
});

const offer = (over: Partial<OfferRule> = {}): OfferRule => ({
  id: 'o1',
  title: 'Sale',
  type: 'PERCENTAGE',
  value: 10,
  maxDiscount: null,
  priority: 0,
  scope: emptyScope,
  ...over,
});

const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  id: 'c1',
  code: 'SAVE10',
  title: '10% off',
  type: 'PERCENTAGE',
  value: 10,
  maxDiscount: null,
  minOrderAmount: 0,
  fundedBy: 'PLATFORM',
  ownerSeller: null,
  scope: emptyScope,
  ...over,
});

describe('scope and discounts', () => {
  it('ANDs dimensions and ORs values', () => {
    const l = line();
    expect(matchesScope(emptyScope, l)).toBe(true);
    expect(matchesScope({ ...emptyScope, categories: ['phones', 'x'] }, l)).toBe(true);
    expect(matchesScope({ ...emptyScope, categories: ['phones'], brands: ['b2'] }, l)).toBe(false);
    expect(matchesScope({ ...emptyScope, brands: ['b1'] }, line({ brandId: null }))).toBe(false);
  });

  it('floors percentages and applies caps', () => {
    expect(discountFor({ type: 'PERCENTAGE', value: 15, maxDiscount: null }, 9_999)).toBe(1_499);
    expect(discountFor({ type: 'PERCENTAGE', value: 50, maxDiscount: 10_000 }, 100_000)).toBe(
      10_000,
    );
    expect(discountFor({ type: 'FIXED', value: 50_000, maxDiscount: null }, 20_000)).toBe(20_000);
  });
});

describe('bestOffer', () => {
  it('picks the largest discount, then the higher priority', () => {
    const best = bestOffer(line(), [
      offer({ id: 'a', value: 10 }),
      offer({ id: 'b', type: 'FIXED', value: 15_000 }),
      offer({ id: 'c', type: 'FIXED', value: 15_000, priority: 5 }),
    ]);
    expect(best?.rule.id).toBe('c');
    expect(best?.discountPerUnit).toBe(15_000);
  });

  it('never takes a unit below ₹1 and ignores out-of-scope offers', () => {
    expect(
      bestOffer(line({ listPrice: 500 }), [offer({ type: 'FIXED', value: 10_000 })])
        ?.discountPerUnit,
    ).toBe(400);
    expect(bestOffer(line(), [offer({ scope: { ...emptyScope, sellers: ['other'] } })])).toBeNull();
  });
});

describe('priceOrder', () => {
  it('prices offers, coupon allocation, tax and per-seller shipping', () => {
    const result = priceOrder(
      [
        line({ quantity: 2 }),
        line({ variantId: 'v2', productId: 'p2', sellerId: 's2', listPrice: 30_000, mrp: 30_000 }),
      ],
      [offer({ scope: { ...emptyScope, sellers: ['s1'] } })],
      coupon(),
      shipping,
    );
    // s1: 2 × (100000 − 10%) = 180000 ; s2: 30000
    expect(result.lines.map((l) => l.lineSubtotal)).toEqual([180_000, 30_000]);
    expect(result.coupon).toEqual({ status: 'APPLIED', discount: 21_000 });
    expect(result.lines.map((l) => l.couponDiscount)).toEqual([18_000, 3_000]);
    expect(result.shipments.map((s) => s.shippingFee)).toEqual([0, 4_000]);
    expect(result.pricing).toMatchObject({
      subtotal: 210_000,
      couponDiscount: 21_000,
      shippingFee: 4_000,
      total: 193_000,
    });
    // GST extracted from line totals (18% inclusive)
    expect(result.lines[0]?.taxIncluded).toBe(Math.round((162_000 * 1800) / 11_800));
  });

  it('keeps allocations summing exactly to the discount', () => {
    const result = priceOrder(
      [
        line({ listPrice: 33_333 }),
        line({ variantId: 'v2', listPrice: 33_333 }),
        line({ variantId: 'v3', listPrice: 33_334 }),
      ],
      [],
      coupon({ type: 'FIXED', value: 1_001 }),
      shipping,
    );
    expect(result.lines.reduce((s, l) => s + l.couponDiscount, 0)).toBe(1_001);
  });

  it('rejects a coupon below its minimum or outside its scope', () => {
    const low = priceOrder([line()], [], coupon({ minOrderAmount: 200_000 }), shipping);
    expect(low.coupon?.status).toBe('INVALID');
    expect(low.pricing.couponDiscount).toBe(0);
    const scoped = priceOrder(
      [line()],
      [],
      coupon({ scope: { ...emptyScope, categories: ['fashion'] } }),
      shipping,
    );
    expect(scoped.coupon?.status).toBe('INVALID');
  });

  it('applies seller-funded coupons only to that seller', () => {
    const result = priceOrder(
      [line(), line({ variantId: 'v2', sellerId: 's2' })],
      [],
      coupon({ fundedBy: 'SELLER', ownerSeller: 's2' }),
      shipping,
    );
    expect(result.lines.map((l) => l.couponDiscount)).toEqual([0, 10_000]);
  });

  it('excludes unavailable lines and clamps reduced ones', () => {
    const result = priceOrder(
      [
        line({ status: 'UNAVAILABLE', maxQuantity: 0 }),
        line({ variantId: 'v2', quantity: 5, maxQuantity: 2, status: 'QUANTITY_REDUCED' }),
      ],
      [],
      null,
      shipping,
    );
    expect(result.lines.map((l) => l.units)).toEqual([0, 2]);
    expect(result.pricing.subtotal).toBe(200_000);
  });
});
