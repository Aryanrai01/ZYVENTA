import { describe, expect, it } from 'vitest';
import { mongoose } from '../src/database/mongoose.js';
import { redact } from '../src/modules/audit/audit.service.js';
import { buildCategoryTree } from '../src/modules/categories/category.service.js';
import {
  buildProductFilter,
  buildProductSort,
  looksLikeSku,
  rupeesToPaise,
} from '../src/modules/products/product-query.js';
import { buildSearchTokens } from '../src/modules/products/product.model.js';
import { sanitizeDescription, stripHtml } from '../src/modules/products/sanitize.js';
import { assertVariantsMatchAxes, extendAxes } from '../src/modules/products/variant-rules.js';

const oid = () => new mongoose.Types.ObjectId();

describe('buildProductFilter', () => {
  it('always restricts to ACTIVE products', () => {
    expect(buildProductFilter({})).toEqual({ status: 'ACTIVE' });
  });

  it('combines every filter with $and', () => {
    const category = oid();
    const brand = oid();
    const filter = buildProductFilter({
      search: { mode: 'text', q: 'phone' },
      categoryId: category,
      brandIds: [brand],
      minPricePaise: 1_000_000,
      maxPricePaise: 5_000_000,
      rating: 4,
      discount: 10,
      inStock: true,
      attributes: { network: ['5G'] },
    });
    expect(filter).toEqual({
      $and: [
        { status: 'ACTIVE' },
        { $text: { $search: 'phone' } },
        { categoryPath: category },
        { brand: { $in: [brand] } },
        { priceMin: { $gte: 1_000_000, $lte: 5_000_000 } },
        { ratingAvg: { $gte: 4 } },
        { discountPercent: { $gte: 10 } },
        { inStock: true },
        { attributes: { $elemMatch: { key: 'network', value: { $in: ['5G'] } } } },
      ],
    });
  });

  it('returns nothing (not everything) for an unknown brand filter', () => {
    const filter = buildProductFilter({ brandIds: [] }) as { $and: unknown[] };
    expect(filter.$and).toContainEqual({ brand: { $in: [] } });
  });

  it('builds anchored, escaped prefix regexes for partial words', () => {
    const filter = buildProductFilter({ search: { mode: 'prefix', q: 'Volt x5.*' } }) as {
      $and: { searchTokens?: { $all: RegExp[] } }[];
    };
    const regexes = filter.$and[1]?.searchTokens?.$all ?? [];
    expect(regexes.map(String)).toEqual(['/^volt/', '/^x5/']);
  });

  it('supports SKU lookups by id', () => {
    const id = oid();
    expect(buildProductFilter({ search: { mode: 'ids', ids: [id] } })).toEqual({
      $and: [{ status: 'ACTIVE' }, { _id: { $in: [id] } }],
    });
  });
});

describe('buildProductSort', () => {
  it('uses text score only when text-searching', () => {
    expect(buildProductSort('relevance', 'text')).toEqual({
      score: { $meta: 'textScore' },
      soldCount: -1,
      _id: 1,
    });
    expect(buildProductSort('relevance', 'none')).toMatchObject({ isFeatured: -1 });
  });

  it('always ends with a stable tie-breaker', () => {
    for (const sort of [
      'newest',
      'price_asc',
      'price_desc',
      'rating',
      'reviews',
      'discount',
      'popular',
    ] as const) {
      expect(Object.keys(buildProductSort(sort, 'none')).at(-1)).toBe('_id');
    }
  });
});

describe('search helpers', () => {
  it('detects SKU-looking queries', () => {
    expect(looksLikeSku('VOLSMA-001-01')).toBe(true);
    expect(looksLikeSku('phone')).toBe(false);
    expect(looksLikeSku('iphone 15')).toBe(false);
  });

  it('tokenises names, brands and tags', () => {
    expect(buildSearchTokens('Voltra X5 5G', 'Voltra', ['smart-phones'])).toEqual([
      'voltra',
      'x5',
      '5g',
      'smart',
      'phones',
    ]);
    expect(buildSearchTokens('Café Crème')).toEqual(['cafe', 'creme']);
  });

  it('converts rupees to paise', () => {
    expect(rupeesToPaise(499)).toBe(49_900);
    expect(rupeesToPaise(undefined)).toBeUndefined();
  });
});

describe('variant rules', () => {
  const axes = [
    { name: 'color' as const, values: ['Black', 'Blue'] },
    { name: 'size' as const, values: ['M', 'L'] },
  ];

  it('accepts valid, unique combinations (case-insensitive)', () => {
    expect(() =>
      assertVariantsMatchAxes(axes, [
        { options: { color: 'black', size: 'M' } },
        { options: { color: 'Blue', size: 'L' } },
      ]),
    ).not.toThrow();
  });

  it('rejects missing axes, unknown values and duplicates', () => {
    expect(() => assertVariantsMatchAxes(axes, [{ options: { color: 'Black' } }])).toThrow(
      /exactly/,
    );
    expect(() => assertVariantsMatchAxes(axes, [{ options: { color: 'Red', size: 'M' } }])).toThrow(
      /not a listed/,
    );
    expect(() =>
      assertVariantsMatchAxes(axes, [
        { options: { color: 'Black', size: 'M' } },
        { options: { color: 'black', size: 'm' } },
      ]),
    ).toThrow(/duplicates/);
  });

  it('requires exactly one option-less variant for simple products', () => {
    expect(() => assertVariantsMatchAxes([], [{ options: {} }])).not.toThrow();
    expect(() => assertVariantsMatchAxes([], [{ options: {} }, { options: {} }])).toThrow(
      /exactly one/,
    );
    expect(() => assertVariantsMatchAxes([], [{ options: { color: 'Red' } }])).toThrow();
  });

  it('extends axes with new values when adding a variant', () => {
    expect(extendAxes(axes, { color: 'Green', size: 'M' })[0]?.values).toEqual([
      'Black',
      'Blue',
      'Green',
    ]);
    expect(extendAxes(axes, { color: 'black', size: 'M' })[0]?.values).toEqual(['Black', 'Blue']);
  });
});

describe('HTML sanitisation', () => {
  it.each([
    ['<script>alert(1)</script><p>ok</p>', '<p>ok</p>'],
    ['<img src=x onerror=alert(1)>', ''],
    ['<p onclick="steal()">x</p>', '<p>x</p>'],
    ['<iframe src="https://evil.example"></iframe>', ''],
    [
      '<a href="javascript:alert(1)">x</a>',
      '<a rel="nofollow noopener noreferrer ugc" target="_blank">x</a>',
    ],
    ['<p style="background:url(x)">x</p>', '<p>x</p>'],
  ])('neutralises %s', (input, expected) => {
    expect(sanitizeDescription(input)).toBe(expected);
  });

  it('keeps safe formatting and forces safe links', () => {
    const out = sanitizeDescription(
      '<h1>T</h1><ul><li><b>a</b></li></ul><a href="https://x.co" target="_self">l</a>',
    );
    expect(out).toContain('<h3>T</h3><ul><li><strong>a</strong></li></ul>');
    expect(out).toContain('href="https://x.co"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="nofollow noopener noreferrer ugc"');
    expect(out).not.toContain('_self');
  });

  it('strips all tags for plain-text fields', () => {
    expect(stripHtml('<b>Great</b> product<script>x</script>')).toBe('Great product');
  });
});

describe('category tree', () => {
  it('nests children and hides branches whose parent is inactive (absent)', () => {
    const root = oid();
    const child = oid();
    const orphan = oid();
    const base = {
      description: '',
      image: null,
      gstRateBps: 1800,
      filterableAttributes: [],
      isActive: true,
      isFeatured: false,
      sortOrder: 0,
      seo: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tree = buildCategoryTree([
      { ...base, _id: root, name: 'Root', slug: 'root', parent: null, ancestors: [], level: 0 },
      { ...base, _id: child, name: 'Child', slug: 'child', parent: root, ancestors: [], level: 1 },
      {
        ...base,
        _id: orphan,
        name: 'Orphan',
        slug: 'orphan',
        parent: oid(),
        ancestors: [],
        level: 1,
      },
    ] as unknown as Parameters<typeof buildCategoryTree>[0]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.map((c) => c.slug)).toEqual(['child']);
  });
});

describe('audit redaction', () => {
  it('redacts secrets at any depth and truncates long strings', () => {
    const out = redact({
      password: 'x',
      nested: { accessToken: 'y', ok: 1 },
      list: [{ secret: 'z' }],
      long: 'a'.repeat(600),
    }) as Record<string, unknown>;
    expect(out).toMatchObject({
      password: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', ok: 1 },
      list: [{ secret: '[REDACTED]' }],
    });
    expect((out.long as string).length).toBeLessThan(510);
  });
});

describe('seoOf', () => {
  it('tolerates documents whose empty seo sub-document was minimised away', async () => {
    const { seoOf } = await import('../src/modules/products/product.mapper.js');
    expect(seoOf(undefined)).toEqual({ title: '', description: '' });
    expect(seoOf({ title: 'T' })).toEqual({ title: 'T', description: '' });
  });
});
