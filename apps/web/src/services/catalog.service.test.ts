import { describe, expect, it } from 'vitest';
import { toProductQuery } from './catalog.service';

describe('toProductQuery', () => {
  it('serialises lists, options and attributes to the API contract', () => {
    expect(
      toProductQuery({
        q: 'phone',
        brand: ['voltra', 'nimbus'],
        options: { color: ['Black', 'Blue'], size: [] },
        attributes: { network: ['5G'] },
        minPrice: 1000,
        inStock: true,
        sort: 'price_asc',
      }),
    ).toMatchObject({
      q: 'phone',
      brand: 'voltra,nimbus',
      color: 'Black,Blue',
      attr_network: '5G',
      minPrice: 1000,
      inStock: true,
      sort: 'price_asc',
    });
  });

  it('omits empty lists', () => {
    const q = toProductQuery({ brand: [], options: { size: [] } });
    expect(q.brand).toBeUndefined();
    expect('size' in q).toBe(false);
  });
});
