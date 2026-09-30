import { describe, expect, it } from 'vitest';
import { allocateProportionally, applyBps, discountPercent, includedTax } from './pricing.js';

describe('pricing helpers', () => {
  it('floors discount percentages', () => {
    expect(discountPercent(66_700, 100_000)).toBe(33);
    expect(discountPercent(100_000, 100_000)).toBe(0);
    expect(discountPercent(50, 0)).toBe(0);
  });

  it('applies basis points with rounding', () => {
    expect(applyBps(99_999, 1000)).toBe(10_000);
    expect(applyBps(12_345, 250)).toBe(309);
  });

  it('extracts GST from inclusive prices', () => {
    // ₹1,180 incl. 18% GST → ₹180 tax
    expect(includedTax(118_000, 1800)).toBe(18_000);
    expect(includedTax(118_000, 0)).toBe(0);
  });

  it('allocates totals exactly', () => {
    const parts = allocateProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
    expect(allocateProportionally(500, [0, 0])).toEqual([0, 0]);
    expect(allocateProportionally(7, [100, 200, 700])).toEqual([1, 1, 5]);
  });
});
