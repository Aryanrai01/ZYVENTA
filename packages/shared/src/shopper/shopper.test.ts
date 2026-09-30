import { describe, expect, it } from 'vitest';
import { productCardsQuerySchema } from '../catalog/query.js';
import {
  addressInputSchema,
  notificationPreferencesSchema,
  profileUpdateSchema,
} from './account.js';
import { addCartItemSchema, cartLinesSchema, updateCartItemSchema } from './cart.js';
import { wishlistAddSchema } from './wishlist.js';

const id = '64b7f0c2a1b2c3d4e5f60718';

describe('cart inputs', () => {
  it('accepts only ids and quantities', () => {
    expect(addCartItemSchema.parse({ variantId: id, quantity: 2 })).toEqual({
      variantId: id,
      quantity: 2,
    });
    // Browser-supplied prices are rejected outright, not silently ignored.
    expect(addCartItemSchema.safeParse({ variantId: id, quantity: 1, price: 1 }).success).toBe(
      false,
    );
  });

  it('bounds quantity', () => {
    for (const quantity of [0, -1, 11, 1.5]) {
      expect(updateCartItemSchema.safeParse({ quantity }).success).toBe(false);
    }
    expect(updateCartItemSchema.safeParse({ quantity: 10 }).success).toBe(true);
  });

  it('caps guest cart size', () => {
    const items = Array.from({ length: 51 }, () => ({ variantId: id, quantity: 1 }));
    expect(cartLinesSchema.safeParse({ items }).success).toBe(false);
    expect(cartLinesSchema.safeParse({ items: items.slice(0, 50) }).success).toBe(true);
  });

  it('rejects operator-shaped ids', () => {
    expect(addCartItemSchema.safeParse({ variantId: { $ne: null }, quantity: 1 }).success).toBe(
      false,
    );
  });
});

describe('wishlist inputs', () => {
  it('requires a product id', () => {
    expect(wishlistAddSchema.safeParse({ productId: id }).success).toBe(true);
    expect(wishlistAddSchema.safeParse({ productId: 'x' }).success).toBe(false);
  });
});

describe('address input', () => {
  const valid = {
    fullName: 'Asha Rao',
    phone: '9876543210',
    line1: '12 MG Road',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560001',
  };

  it('applies defaults', () => {
    expect(addressInputSchema.parse(valid)).toMatchObject({
      label: 'HOME',
      line2: '',
      landmark: '',
      isDefault: false,
    });
  });

  it('validates Indian phone, PIN and state', () => {
    expect(addressInputSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
    expect(addressInputSchema.safeParse({ ...valid, pincode: '060001' }).success).toBe(false);
    expect(addressInputSchema.safeParse({ ...valid, state: 'XX' }).success).toBe(false);
  });

  it('rejects unknown keys such as user', () => {
    expect(addressInputSchema.safeParse({ ...valid, user: id }).success).toBe(false);
  });
});

describe('profile inputs', () => {
  it('allows clearing the phone and rejects email changes', () => {
    expect(profileUpdateSchema.safeParse({ phone: '' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ email: 'a@b.co' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('never lets security alerts be switched off', () => {
    expect(notificationPreferencesSchema.safeParse({ securityAlerts: false }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ promotions: true }).success).toBe(true);
  });
});

describe('product cards query', () => {
  it('parses a slug list', () => {
    expect(productCardsQuerySchema.parse({ slugs: 'a-b, c-d' })).toEqual({ slugs: ['a-b', 'c-d'] });
    expect(productCardsQuerySchema.safeParse({ slugs: 'Bad Slug' }).success).toBe(false);
  });
});
