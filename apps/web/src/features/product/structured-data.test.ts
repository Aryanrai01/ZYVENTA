import type { ProductDetail } from '@zyventa/shared';
import { describe, expect, it } from 'vitest';
import { productJsonLd, serializeJsonLd } from './structured-data';

const product = {
  id: 'p1',
  slug: 'phone-x',
  name: 'Phone </script><script>alert(1)</script>',
  brandName: 'Voltra',
  price: 1_999_900,
  mrp: 2_499_900,
  discountPercent: 20,
  hasPriceRange: true,
  ratingAvg: 4.4,
  ratingCount: 12,
  inStock: true,
  isFeatured: false,
  shortDescription: 'A phone',
  description: '',
  images: [{ url: '/placeholders/electronics.svg', alt: 'Phone' }],
  highlights: [],
  specifications: [],
  attributes: [],
  tags: [],
  variantOptions: [],
  variants: [
    {
      id: 'v1',
      sku: 'PX-128',
      options: {},
      price: 1_999_900,
      mrp: 2_499_900,
      discountPercent: 20,
      inStock: true,
      lowStock: false,
      maxQuantity: 10,
      images: [],
      isDefault: true,
    },
    {
      id: 'v2',
      sku: 'PX-256',
      options: {},
      price: 2_299_900,
      mrp: 2_699_900,
      discountPercent: 15,
      inStock: false,
      lowStock: false,
      maxQuantity: 0,
      images: [],
      isDefault: false,
    },
  ],
  category: { name: 'Phones', slug: 'phones' },
  breadcrumbs: [
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Phones', slug: 'phones' },
  ],
  brand: { name: 'Voltra', slug: 'voltra' },
  seller: { id: 's1', storeName: 'TechVerse', slug: 'techverse', ratingAvg: 4.5, ratingCount: 3 },
  returnPolicy: { returnable: true, windowDays: 7 },
  warranty: '',
  seo: { title: 'Phone', description: 'Phone' },
  publishedAt: null,
} satisfies ProductDetail;

describe('product JSON-LD', () => {
  it('describes price range, availability, rating and breadcrumbs', () => {
    const json = productJsonLd(product, 'https://zyventa.com/') as {
      '@graph': Record<string, unknown>[];
    };
    const [item, breadcrumbs] = json['@graph'];
    expect(item).toMatchObject({
      '@type': 'Product',
      image: ['https://zyventa.com/placeholders/electronics.svg'],
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: '19999.00',
        highPrice: '22999.00',
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
      },
      aggregateRating: { ratingValue: 4.4, reviewCount: 12 },
    });
    expect((breadcrumbs as { itemListElement: unknown[] }).itemListElement).toHaveLength(3);
  });

  it('cannot break out of the script tag', () => {
    const html = serializeJsonLd(productJsonLd(product, 'https://zyventa.com'));
    expect(html).not.toContain('</script>');
    expect(html).not.toContain('<');
    expect(JSON.parse(html)).toBeTruthy();
  });
});
