import { describe, expect, it } from 'vitest';
import { activeFilterCount, filtersToSearch, parseFilters, toggleValue } from './filters';

describe('parseFilters', () => {
  it('parses a full query', () => {
    const filters = parseFilters({
      q: ' phone ',
      brand: 'voltra,nimbus',
      minPrice: '500',
      maxPrice: '20000',
      rating: '4',
      inStock: 'true',
      color: 'Black,Blue',
      attr_fabric: 'cotton',
      sort: 'price_asc',
      page: '3',
    });
    expect(filters).toEqual({
      q: 'phone',
      brand: ['voltra', 'nimbus'],
      minPrice: 500,
      maxPrice: 20000,
      rating: 4,
      inStock: true,
      options: { color: ['Black', 'Blue'] },
      attributes: { fabric: ['cotton'] },
      sort: 'price_asc',
      page: 3,
      limit: 24,
    });
  });

  it('drops malformed and unknown values instead of failing', () => {
    const filters = parseFilters({
      brand: 'Bad Slug,ok-one',
      minPrice: '-5',
      maxPrice: 'abc',
      rating: '9',
      sort: 'cheapest',
      page: '0',
      utm_source: 'mail',
      attr_$where: 'x',
    });
    expect(filters).toEqual({ brand: ['ok-one'], page: 1, limit: 24 });
  });

  it('ignores an inverted price range upper bound', () => {
    expect(parseFilters({ minPrice: '900', maxPrice: '100' })).toMatchObject({ minPrice: 900 });
    expect(parseFilters({ minPrice: '900', maxPrice: '100' }).maxPrice).toBeUndefined();
  });

  it('keeps the path context', () => {
    expect(parseFilters({ q: 'ignored' }, { category: 'fashion' })).toMatchObject({
      category: 'fashion',
      q: 'ignored',
    });
  });
});

describe('filtersToSearch', () => {
  it('round-trips and omits defaults', () => {
    const search = filtersToSearch({
      brand: ['a-b'],
      options: { size: ['M'] },
      attributes: { fabric: ['cotton'] },
      sort: 'relevance',
      page: 1,
      limit: 24,
    });
    expect(search).toBe('?brand=a-b&size=M&attr_fabric=cotton');
    expect(parseFilters(Object.fromEntries(new URLSearchParams(search)))).toMatchObject({
      brand: ['a-b'],
      options: { size: ['M'] },
      attributes: { fabric: ['cotton'] },
    });
  });

  it('omits path context keys', () => {
    expect(filtersToSearch({ category: 'fashion', page: 2 }, ['category'])).toBe('?page=2');
  });
});

describe('helpers', () => {
  it('counts active filters', () => {
    expect(activeFilterCount({ brand: ['a', 'b'], minPrice: 1, inStock: true })).toBe(4);
  });

  it('toggles list values', () => {
    expect(toggleValue(undefined, 'a')).toEqual(['a']);
    expect(toggleValue(['a'], 'a')).toBeUndefined();
  });
});
