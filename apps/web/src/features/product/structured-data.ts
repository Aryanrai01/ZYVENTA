import type { ProductDetail } from '@zyventa/shared';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const rupees = (paise: number) => (paise / 100).toFixed(2);
const absolute = (url: string, site: string) => (url.startsWith('http') ? url : `${site}${url}`);

/** schema.org Product + BreadcrumbList for rich results. */
export function productJsonLd(product: ProductDetail, siteUrl: string): Json {
  const site = siteUrl.replace(/\/$/, '');
  const url = `${site}/products/${product.slug}`;
  const prices = product.variants.map((v) => v.price);
  const inStock = product.variants.some((v) => v.inStock);
  const availability = inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
  const seller: Json = { '@type': 'Organization', name: product.seller.storeName };

  const offers: Json =
    prices.length > 1 && Math.min(...prices) !== Math.max(...prices)
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'INR',
          lowPrice: rupees(Math.min(...prices)),
          highPrice: rupees(Math.max(...prices)),
          offerCount: prices.length,
          availability,
          url,
          seller,
        }
      : {
          '@type': 'Offer',
          priceCurrency: 'INR',
          price: rupees(prices[0] ?? product.price),
          availability,
          itemCondition: 'https://schema.org/NewCondition',
          url,
          seller,
        };

  const graph: Json[] = [
    {
      '@type': 'Product',
      '@id': `${url}#product`,
      name: product.name,
      description: product.shortDescription || product.seo.description,
      image: product.images.map((i) => absolute(i.url, site)),
      sku: product.variants[0]?.sku ?? product.id,
      url,
      category: product.breadcrumbs.map((b) => b.name).join(' > '),
      ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand.name } } : {}),
      ...(product.ratingCount > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: product.ratingAvg,
              reviewCount: product.ratingCount,
            },
          }
        : {}),
      offers,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { name: 'Home', path: '' },
        ...product.breadcrumbs.map((b) => ({ name: b.name, path: `/categories/${b.slug}` })),
      ].map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        item: `${site}${crumb.path}`,
      })),
    },
  ];

  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * JSON for a <script> tag. `<`, `>` and `&` are escaped so data such as a product name
 * containing "</script>" cannot break out of the tag (stored XSS via JSON-LD).
 */
export function serializeJsonLd(data: Json): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}
