import { describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { Cart } from '../../src/modules/cart/cart.model.js';
import { Category } from '../../src/modules/categories/category.model.js';
import { Coupon } from '../../src/modules/coupons/coupon.model.js';
import { Notification } from '../../src/modules/notifications/notification.model.js';
import { OrderItem } from '../../src/modules/orders/order-item.model.js';
import { Order } from '../../src/modules/orders/order.model.js';
import { Payment } from '../../src/modules/payments/payment.model.js';
import {
  ProductVariant,
  buildOptionsKey,
} from '../../src/modules/products/product-variant.model.js';
import { Product } from '../../src/modules/products/product.model.js';
import { Report } from '../../src/modules/reports/report.model.js';
import { Review } from '../../src/modules/reviews/review.model.js';
import { Seller } from '../../src/modules/sellers/seller.model.js';
import { Address } from '../../src/modules/users/address.model.js';
import { User } from '../../src/modules/users/user.model.js';
import { Wishlist } from '../../src/modules/wishlist/wishlist.model.js';
import { invalidPaths, oid } from '../helpers/validation.js';

const address = {
  fullName: 'Aarav Sharma',
  phone: '9876543210',
  line1: '42, 5th Cross, Bellandur',
  city: 'Bengaluru',
  state: 'KA',
  pincode: '560103',
};

describe('User', () => {
  const valid = { name: 'Aarav', email: 'Aarav@Example.com ', passwordHash: 'x'.repeat(40) };

  it('normalises email and defaults role/status', async () => {
    const user = new User(valid);
    expect(await invalidPaths(user)).toEqual([]);
    expect(user.email).toBe('aarav@example.com');
    expect(user.roles).toEqual(['USER']);
    expect(user.status).toBe('ACTIVE');
  });

  it('rejects unknown and duplicate roles', async () => {
    expect(await invalidPaths(new User({ ...valid, roles: ['SUPERUSER'] }))).toContain('roles.0');
    expect(await invalidPaths(new User({ ...valid, roles: ['USER', 'USER'] }))).toContain('roles');
    expect(await invalidPaths(new User({ ...valid, roles: [] }))).toContain('roles');
  });

  it('never serialises secrets', () => {
    const json = JSON.stringify(new User({ ...valid, failedLoginCount: 3 }));
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('failedLoginCount');
    expect(json).toContain('"id"');
    expect(json).not.toContain('"_id"');
  });
});

describe('Address', () => {
  it('accepts a valid Indian address', async () => {
    expect(await invalidPaths(new Address({ user: oid(), ...address }))).toEqual([]);
  });

  it('validates phone, PIN code and state', async () => {
    const bad = new Address({
      user: oid(),
      ...address,
      phone: '12345',
      pincode: '0123',
      state: 'XX',
    });
    expect(await invalidPaths(bad)).toEqual(['phone', 'pincode', 'state']);
  });
});

describe('Category', () => {
  it('requires level to match the ancestor chain', async () => {
    const parent = { _id: oid(), name: 'Electronics', slug: 'electronics' };
    expect(
      await invalidPaths(
        new Category({ name: 'Phones', slug: 'phones', ancestors: [parent], level: 1 }),
      ),
    ).toEqual([]);
    expect(
      await invalidPaths(
        new Category({ name: 'Phones', slug: 'phones', ancestors: [parent], level: 0 }),
      ),
    ).toContain('level');
  });

  it('rejects invalid slugs and GST rates', async () => {
    expect(
      await invalidPaths(new Category({ name: 'Bad', slug: 'Bad Slug', gstRateBps: 1234 })),
    ).toEqual(['gstRateBps', 'slug']);
  });
});

describe('Product', () => {
  const category = oid();
  const base = {
    seller: oid(),
    category,
    categoryPath: [oid(), category],
    name: 'Voltra X5 5G',
    slug: 'voltra-x5-5g',
  };

  it('allows a draft without images', async () => {
    expect(await invalidPaths(new Product(base))).toEqual([]);
  });

  it('requires images before going ACTIVE', async () => {
    expect(await invalidPaths(new Product({ ...base, status: 'ACTIVE' }))).toContain('images');
  });

  it('requires categoryPath to contain the category', async () => {
    expect(await invalidPaths(new Product({ ...base, categoryPath: [oid()] }))).toContain(
      'categoryPath',
    );
  });

  it('rejects unsafe image URLs', async () => {
    const product = new Product({ ...base, images: [{ url: 'javascript:alert(1)' }] });
    expect(await invalidPaths(product)).toContain('images.0.url');
  });

  it('limits variant axes and rejects duplicates', async () => {
    const product = new Product({
      ...base,
      variantOptions: [
        { name: 'color', values: ['Black'] },
        { name: 'color', values: ['White'] },
      ],
    });
    expect(await invalidPaths(product)).toContain('variantOptions');
  });
});

describe('ProductVariant', () => {
  const base = {
    product: oid(),
    seller: oid(),
    sku: 'volsma-001-01',
    price: 1_199_900,
    mrp: 1_499_900,
  };

  it('uppercases SKU and derives the options key', async () => {
    const variant = new ProductVariant({ ...base, options: { storage: '128 GB', color: 'Black' } });
    expect(await invalidPaths(variant)).toEqual([]);
    expect(variant.sku).toBe('VOLSMA-001-01');
    expect(variant.optionsKey).toBe('color=black|storage=128 gb');
  });

  it('rejects price above MRP, fractional paise and over-reservation', async () => {
    expect(await invalidPaths(new ProductVariant({ ...base, price: 2_000_000 }))).toContain(
      'price',
    );
    expect(await invalidPaths(new ProductVariant({ ...base, price: 1000.5 }))).toContain('price');
    expect(await invalidPaths(new ProductVariant({ ...base, stock: 1, reserved: 2 }))).toContain(
      'stock',
    );
  });

  it('exposes available = stock − reserved', () => {
    const variant = new ProductVariant({ ...base, stock: 10, reserved: 3 });
    expect(variant.get('available')).toBe(7);
  });

  it('builds order-independent option keys', () => {
    expect(buildOptionsKey({ storage: '256 GB', color: 'Blue ' })).toBe(
      buildOptionsKey({ color: 'blue', storage: '256 gb' }),
    );
    expect(buildOptionsKey({})).toBe('default');
    expect(buildOptionsKey(null)).toBe('default');
  });
});

describe('Cart & Wishlist', () => {
  it('rejects duplicate variants', async () => {
    const variant = oid();
    const cart = new Cart({
      user: oid(),
      items: [
        { product: oid(), variant, quantity: 1 },
        { product: oid(), variant, quantity: 2 },
      ],
    });
    expect(await invalidPaths(cart)).toEqual(['items']);
  });

  it('rejects quantities above the per-line limit', async () => {
    const cart = new Cart({
      user: oid(),
      items: [{ product: oid(), variant: oid(), quantity: 11 }],
    });
    expect(await invalidPaths(cart)).toEqual(['items.0.quantity']);
  });

  it('rejects duplicate wishlist entries', async () => {
    const product = oid();
    const wishlist = new Wishlist({ user: oid(), items: [{ product }, { product }] });
    expect(await invalidPaths(wishlist)).toContain('items');
  });
});

describe('Order money integrity', () => {
  const pricing = {
    mrpTotal: 150_000,
    subtotal: 120_000,
    couponDiscount: 10_000,
    shippingFee: 4_000,
    taxIncluded: 18_305,
    total: 114_000,
  };
  const order = (overrides: Record<string, unknown> = {}) =>
    new Order({
      orderNumber: 'ZV2609-000001',
      user: oid(),
      contact: { email: 'a@b.co', phone: '9876543210' },
      shippingAddress: address,
      pricing,
      itemCount: 2,
      sellerOrderCount: 1,
      ...overrides,
    });

  it('accepts consistent totals', async () => {
    expect(await invalidPaths(order())).toEqual([]);
  });

  it('rejects totals that do not add up', async () => {
    expect(await invalidPaths(order({ pricing: { ...pricing, total: 1 } }))).toContain(
      'pricing.total',
    );
  });

  it('rejects refunds above the total', async () => {
    expect(await invalidPaths(order({ refundedAmount: 200_000 }))).toContain('refundedAmount');
  });

  it('enforces line arithmetic on order items', async () => {
    const item = new OrderItem({
      order: oid(),
      sellerOrder: oid(),
      user: oid(),
      seller: oid(),
      product: oid(),
      variant: oid(),
      snapshot: { name: 'Tee', slug: 'tee', sku: 'TEE-1' },
      quantity: 2,
      unitPrice: 50_000,
      unitMrp: 60_000,
      lineSubtotal: 90_000,
      couponDiscount: 0,
      gstRateBps: 500,
      lineTotal: 90_000,
    });
    expect(await invalidPaths(item)).toEqual(['lineSubtotal']);
  });
});

describe('Payment', () => {
  it('validates Razorpay identifiers and refund bounds', async () => {
    const payment = new Payment({
      order: oid(),
      user: oid(),
      razorpayOrderId: 'not-an-order-id',
      razorpayPaymentId: 'pay_ABC123',
      amount: 10_000,
      amountRefunded: 20_000,
    });
    expect(await invalidPaths(payment)).toEqual(['amountRefunded', 'razorpayOrderId']);
  });
});

describe('Coupon', () => {
  const base = {
    code: 'save10',
    title: 'Save 10',
    type: 'PERCENTAGE',
    value: 10,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    createdBy: oid(),
  };

  it('uppercases the code', async () => {
    const coupon = new Coupon(base);
    expect(await invalidPaths(coupon)).toEqual([]);
    expect(coupon.code).toBe('SAVE10');
  });

  it('enforces business rules', async () => {
    expect(await invalidPaths(new Coupon({ ...base, value: 95 }))).toContain('value');
    expect(await invalidPaths(new Coupon({ ...base, endsAt: base.startsAt }))).toContain('endsAt');
    expect(await invalidPaths(new Coupon({ ...base, fundedBy: 'SELLER' }))).toContain(
      'ownerSeller',
    );
    expect(await invalidPaths(new Coupon({ ...base, type: 'FIXED', value: 50 }))).toContain(
      'value',
    );
    expect(await invalidPaths(new Coupon({ ...base, usageLimit: 5, usedCount: 6 }))).toContain(
      'usedCount',
    );
  });
});

describe('Review / Report / Notification', () => {
  it('requires whole-star ratings', async () => {
    const review = new Review({
      product: oid(),
      seller: oid(),
      user: oid(),
      orderItem: oid(),
      rating: 4.5,
    });
    expect(await invalidPaths(review)).toContain('rating');
  });

  it('derives the report target model', async () => {
    const report = new Report({
      reporter: oid(),
      targetType: 'REVIEW',
      target: oid(),
      reason: 'SPAM',
    });
    expect(await invalidPaths(report)).toEqual([]);
    expect(report.targetModel).toBe('Review');
  });

  it('only allows internal notification links', async () => {
    const note = new Notification({
      user: oid(),
      type: 'SYSTEM',
      title: 'Hi',
      link: 'https://evil.example',
    });
    expect(await invalidPaths(note)).toContain('link');
  });
});

describe('Sensitive serialisation', () => {
  it('hides token hashes and encrypted payout data', () => {
    const session = new Session({
      user: oid(),
      familyId: 'f'.repeat(32),
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(),
    });
    expect(JSON.stringify(session)).not.toContain('tokenHash');

    const seller = new Seller({
      payoutAccount: { accountNumberEncrypted: 'cipher', accountNumberLast4: '1234' },
    });
    const json = JSON.stringify(seller);
    expect(json).not.toContain('cipher');
    expect(json).toContain('1234');
  });
});

describe('AuditLog', () => {
  it('is append-only', async () => {
    await expect(AuditLog.updateOne({}, { action: 'x.y' }).exec()).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({}).exec()).rejects.toThrow(/append-only/);
  });

  it('requires dotted action names', async () => {
    const log = new AuditLog({
      actorRole: 'ADMIN',
      action: 'DeleteEverything',
      resource: 'USER',
      resourceId: '1',
    });
    expect(await invalidPaths(log)).toContain('action');
  });
});
