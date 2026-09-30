import { describe, expect, it } from 'vitest';
import {
  lineStatus,
  priceCart,
  shippingFor,
  type LiveProduct,
  type LiveVariant,
  type StoredLine,
} from '../src/modules/cart/cart-pricing.js';

const settings = { freeShippingThreshold: 49_900, flatFeePerShipment: 4_000 };

function product(id: string, sellerId = 's1', overrides: Partial<LiveProduct> = {}): LiveProduct {
  return {
    id,
    slug: `product-${id}`,
    name: `Product ${id}`,
    brandName: 'Brand',
    sellable: true,
    image: null,
    seller: { id: sellerId, storeName: `Store ${sellerId}`, active: true },
    ...overrides,
  };
}

function variant(id: string, productId: string, overrides: Partial<LiveVariant> = {}): LiveVariant {
  return {
    id,
    productId,
    sku: `SKU-${id}`,
    options: {},
    price: 10_000,
    mrp: 15_000,
    stock: 20,
    reserved: 0,
    isActive: true,
    image: null,
    ...overrides,
  };
}

const line = (
  variantId: string,
  quantity: number,
  priceAtAdd: number | null = null,
): StoredLine => ({
  variantId,
  quantity,
  priceAtAdd,
  addedAt: null,
});

describe('lineStatus', () => {
  const p = product('p1');

  it('is OK within availability', () => {
    expect(lineStatus(3, variant('v1', 'p1'), p)).toEqual({ status: 'OK', maxQuantity: 10 });
  });

  it('counts reserved units as unavailable', () => {
    expect(lineStatus(3, variant('v1', 'p1', { stock: 5, reserved: 3 }), p)).toEqual({
      status: 'QUANTITY_REDUCED',
      maxQuantity: 2,
    });
    expect(lineStatus(1, variant('v1', 'p1', { stock: 5, reserved: 5 }), p).status).toBe(
      'OUT_OF_STOCK',
    );
  });

  it('caps at the per-line limit even with plenty of stock', () => {
    expect(lineStatus(11, variant('v1', 'p1', { stock: 500 }), p)).toEqual({
      status: 'QUANTITY_REDUCED',
      maxQuantity: 10,
    });
  });

  it('marks inactive variants, unlisted products and suspended sellers unavailable', () => {
    expect(lineStatus(1, undefined, p).status).toBe('UNAVAILABLE');
    expect(lineStatus(1, variant('v1', 'p1', { isActive: false }), p).status).toBe('UNAVAILABLE');
    expect(
      lineStatus(1, variant('v1', 'p1'), product('p1', 's1', { sellable: false })).status,
    ).toBe('UNAVAILABLE');
    expect(
      lineStatus(
        1,
        variant('v1', 'p1'),
        product('p1', 's1', { seller: { id: 's1', storeName: 'x', active: false } }),
      ).status,
    ).toBe('UNAVAILABLE');
  });
});

describe('shippingFor', () => {
  it('charges the flat fee below the threshold and nothing at or above it', () => {
    expect(shippingFor(0, settings)).toBe(0);
    expect(shippingFor(49_899, settings)).toBe(4_000);
    expect(shippingFor(49_900, settings)).toBe(0);
  });
});

describe('priceCart', () => {
  it('prices from live data, per seller shipment', () => {
    const variants = new Map([
      ['v1', variant('v1', 'p1', { price: 20_000, mrp: 25_000 })],
      ['v2', variant('v2', 'p2', { price: 45_000, mrp: 45_000 })],
    ]);
    const products = new Map([
      ['p1', product('p1', 's1')],
      ['p2', product('p2', 's2')],
    ]);
    const cart = priceCart([line('v1', 3), line('v2', 1)], variants, products, settings);

    expect(cart.items.map((i) => i.lineTotal)).toEqual([60_000, 45_000]);
    expect(cart.shipments).toEqual([
      expect.objectContaining({ subtotal: 60_000, shippingFee: 0, amountToFreeShipping: 0 }),
      expect.objectContaining({
        subtotal: 45_000,
        shippingFee: 4_000,
        amountToFreeShipping: 4_900,
      }),
    ]);
    expect(cart.summary).toEqual({
      itemCount: 4,
      subtotal: 105_000,
      mrpTotal: 120_000,
      savings: 15_000,
      shippingFee: 4_000,
      total: 109_000,
      freeShippingThreshold: 49_900,
    });
    expect(cart.hasIssues).toBe(false);
  });

  it('excludes unavailable and out-of-stock lines and clamps reduced ones', () => {
    const variants = new Map([
      ['v1', variant('v1', 'p1', { stock: 2 })],
      ['v2', variant('v2', 'p1', { stock: 0 })],
    ]);
    const products = new Map([['p1', product('p1')]]);
    const cart = priceCart(
      [line('v1', 5), line('v2', 1), line('gone', 1, 9_999)],
      variants,
      products,
      settings,
    );

    expect(cart.items.map((i) => i.status)).toEqual([
      'QUANTITY_REDUCED',
      'OUT_OF_STOCK',
      'UNAVAILABLE',
    ]);
    expect(cart.items[0]).toMatchObject({ quantity: 5, maxQuantity: 2, lineTotal: 20_000 });
    expect(cart.items[2]).toMatchObject({ lineTotal: 0, maxQuantity: 0 });
    expect(cart.summary.itemCount).toBe(2);
    expect(cart.summary.subtotal).toBe(20_000);
    expect(cart.hasIssues).toBe(true);
  });

  it('flags price changes since the item was added', () => {
    const variants = new Map([['v1', variant('v1', 'p1', { price: 9_000 })]]);
    const products = new Map([['p1', product('p1')]]);
    const cart = priceCart([line('v1', 1, 10_000)], variants, products, settings);
    expect(cart.items[0]?.previousUnitPrice).toBe(10_000);
    expect(cart.items[0]?.unitPrice).toBe(9_000);
    expect(cart.hasIssues).toBe(true);
  });

  it('returns an empty, zero-total cart', () => {
    const cart = priceCart([], new Map(), new Map(), settings);
    expect(cart.summary).toMatchObject({ itemCount: 0, subtotal: 0, shippingFee: 0, total: 0 });
    expect(cart.shipments).toEqual([]);
  });
});
