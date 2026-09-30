import { describe, expect, it } from 'vitest';
import { discountPercent, formatPrice } from './format';

describe('formatPrice', () => {
  it('formats paise as Indian rupees with lakh grouping', () => {
    expect(formatPrice(12_345_600)).toBe('₹1,23,456');
    expect(formatPrice(9_999)).toBe('₹99.99');
  });
});

describe('discountPercent', () => {
  it('floors the percentage', () => {
    expect(discountPercent(66_700, 100_000)).toBe(33);
  });

  it('returns 0 when there is no discount', () => {
    expect(discountPercent(100_000, 100_000)).toBe(0);
    expect(discountPercent(100, 0)).toBe(0);
  });
});
