import type { VariantView } from '@zyventa/shared';
import { describe, expect, it } from 'vitest';
import { initialVariant, selectValue, valueState } from './variant-selection';

const v = (
  id: string,
  options: VariantView['options'],
  inStock = true,
  isDefault = false,
): VariantView => ({
  id,
  sku: `SKU-${id}`,
  options,
  price: 100,
  mrp: 100,
  discountPercent: 0,
  inStock,
  lowStock: false,
  maxQuantity: inStock ? 10 : 0,
  images: [],
  isDefault,
});

const variants = [
  v('black-128', { color: 'Black', storage: '128 GB' }, true, true),
  v('black-256', { color: 'Black', storage: '256 GB' }, false),
  v('blue-128', { color: 'Blue', storage: '128 GB' }),
];

describe('variant selection', () => {
  it('starts from the requested, then default in-stock, then any in-stock variant', () => {
    expect(initialVariant(variants, 'blue-128')?.id).toBe('blue-128');
    expect(initialVariant(variants)?.id).toBe('black-128');
    expect(initialVariant([v('a', {}, false), v('b', {})])?.id).toBe('b');
    expect(initialVariant([])).toBeUndefined();
  });

  it('reports value states relative to the other choices', () => {
    const current = variants[0];
    expect(valueState(variants, current, 'color', 'Black')).toBe('selected');
    expect(valueState(variants, current, 'color', 'Blue')).toBe('available');
    expect(valueState(variants, current, 'storage', '256 GB')).toBe('out-of-stock');
    const blue = variants[2];
    expect(valueState(variants, blue, 'storage', '256 GB')).toBe('unavailable');
  });

  it('jumps to the closest variant when a combination does not exist', () => {
    const blue = variants[2];
    expect(selectValue(variants, blue, 'storage', '256 GB')?.id).toBe('black-256');
    expect(selectValue(variants, variants[0], 'color', 'Blue')?.id).toBe('blue-128');
  });
});
