import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  PRODUCT_SORTS,
  brandInputSchema,
  brandUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  createProductSchema,
  imageDeleteSchema,
  stockUpdateSchema,
  updateProductSchema,
  variantInputSchema,
  variantUpdateSchema,
} from '@zyventa/shared';
import { z } from 'zod';
import { errorEnvelope, paginatedEnvelope, successEnvelope } from '../../docs/schemas.js';

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const err = (description: string) => ({ description, ...json(errorEnvelope) });
const obj = (description: string) => z.object({}).catchall(z.unknown()).describe(description);

const productCard = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    brandName: z.string(),
    image: z.object({ url: z.string(), alt: z.string() }).nullable(),
    price: z.number().int().describe('paise'),
    mrp: z.number().int().describe('paise'),
    discountPercent: z.number().int(),
    hasPriceRange: z.boolean(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    inStock: z.boolean(),
    isFeatured: z.boolean(),
  })
  .describe('ProductCard');

const listQuery = z.object({
  q: z
    .string()
    .optional()
    .describe('Full-text search; falls back to prefix match; SKU exact match'),
  category: z.string().optional().describe('Category slug (includes subcategories)'),
  brand: z.string().optional().describe('Comma-separated brand slugs'),
  seller: z.string().optional().describe('Seller store slug'),
  minPrice: z.number().int().optional().describe('Rupees'),
  maxPrice: z.number().int().optional().describe('Rupees'),
  rating: z.number().optional().describe('Minimum average rating'),
  discount: z.number().int().optional().describe('Minimum discount %'),
  inStock: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  color: z
    .string()
    .optional()
    .describe('Comma-separated variant colours (also size, storage, ram, material)'),
  sort: z.enum(PRODUCT_SORTS).optional(),
  page: z.number().int().optional(),
  limit: z.number().int().max(60).optional(),
});

const secured: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];
const idParam = z.object({ id: z.string().describe('ObjectId') });

export function registerCatalogDocs(registry: OpenAPIRegistry): void {
  // ── Public catalogue ──────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/categories',
    tags: ['Catalogue'],
    summary: 'Active category tree',
    responses: {
      200: { description: 'Tree', ...json(successEnvelope(z.array(obj('CategoryNode')))) },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/categories/{slug}',
    tags: ['Catalogue'],
    summary: 'Category detail with breadcrumbs, children and filterable attributes',
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: { description: 'Category', ...json(successEnvelope(obj('CategoryDetail'))) },
      404: err('Not found'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/brands',
    tags: ['Catalogue'],
    summary: 'Active brands',
    responses: {
      200: { description: 'Brands', ...json(successEnvelope(z.array(obj('BrandSummary')))) },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/products',
    tags: ['Catalogue'],
    summary: 'List / search / filter / sort products (paginated)',
    description:
      'Attribute filters: `attr_<key>=v1,v2` (e.g. `attr_network=5G`). Response header `X-Search-Mode`: text | prefix | sku | none.',
    request: { query: listQuery },
    responses: {
      200: { description: 'Page of products', ...json(paginatedEnvelope(productCard)) },
      400: err('Invalid filter'),
      404: err('Unknown category or seller'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/products/facets',
    tags: ['Catalogue'],
    summary:
      'Filter options (brands, price range, attributes, variant options) for a category/search',
    request: { query: z.object({ q: z.string().optional(), category: z.string().optional() }) },
    responses: { 200: { description: 'Facets', ...json(successEnvelope(obj('ProductFacets'))) } },
  });
  registry.registerPath({
    method: 'get',
    path: '/products/cards',
    tags: ['Catalogue'],
    summary: 'Cards for known products (recently viewed), in the order given',
    request: { query: z.object({ slugs: z.string().describe('Comma-separated slugs (max 24)') }) },
    responses: { 200: { description: 'Cards', ...json(successEnvelope(z.array(productCard))) } },
  });
  registry.registerPath({
    method: 'get',
    path: '/products/suggestions',
    tags: ['Catalogue'],
    summary: 'Autocomplete (categories, brands, products)',
    request: { query: z.object({ q: z.string() }) },
    responses: {
      200: {
        description: 'Suggestions',
        ...json(successEnvelope(z.array(obj('SearchSuggestion')))),
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/products/{slug}',
    tags: ['Catalogue'],
    summary: 'Product detail (variants, seller, breadcrumbs)',
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: { description: 'Product', ...json(successEnvelope(obj('ProductDetail'))) },
      404: err('Not found or not active'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/products/{slug}/related',
    tags: ['Catalogue'],
    summary: 'Related products (same category, then parent category)',
    request: { params: z.object({ slug: z.string() }) },
    responses: { 200: { description: 'Products', ...json(successEnvelope(z.array(productCard))) } },
  });

  // ── Seller ────────────────────────────────────────────────────────────────
  const sellerTags = ['Seller'];
  const sellerErrors = {
    401: err('Not signed in'),
    403: err('Not an active seller'),
    404: err('Not found (or not yours)'),
  };
  registry.registerPath({
    method: 'get',
    path: '/seller/products',
    tags: sellerTags,
    security: secured,
    summary: 'Your products',
    request: {
      query: z.object({
        q: z.string().optional(),
        status: z.string().optional(),
        lowStock: z.enum(['true', 'false']).optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      }),
    },
    responses: {
      200: { description: 'Rows', ...json(paginatedEnvelope(obj('SellerProductRow'))) },
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/seller/products',
    tags: sellerTags,
    security: secured,
    summary: 'Create a product with its variants',
    description: 'Prices in paise. Images must first be uploaded via POST /uploads/images.',
    request: { body: json(createProductSchema) },
    responses: {
      201: { description: 'Created', ...json(successEnvelope(obj('SellerProductDetail'))) },
      400: err('Invalid'),
      409: err('SKU in use'),
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/seller/products/{id}',
    tags: sellerTags,
    security: secured,
    summary: 'Your product',
    request: { params: idParam },
    responses: {
      200: { description: 'Product', ...json(successEnvelope(obj('SellerProductDetail'))) },
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/seller/products/{id}',
    tags: sellerTags,
    security: secured,
    summary: 'Update your product',
    request: { params: idParam, body: json(updateProductSchema) },
    responses: {
      200: { description: 'Updated', ...json(successEnvelope(obj('SellerProductDetail'))) },
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/seller/products/{id}',
    tags: sellerTags,
    security: secured,
    summary: 'Remove (archive) your product',
    request: { params: idParam },
    responses: {
      200: { description: 'Archived', ...json(successEnvelope(z.null())) },
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/seller/products/{id}/variants',
    tags: sellerTags,
    security: secured,
    summary: 'Add a variant',
    request: { params: idParam, body: json(variantInputSchema) },
    responses: {
      201: { description: 'Added', ...json(successEnvelope(obj('SellerProductDetail'))) },
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/seller/products/{id}/variants/{variantId}',
    tags: sellerTags,
    security: secured,
    summary: 'Update a variant (price, MRP, SKU, images, active)',
    request: { params: idParam.extend({ variantId: z.string() }), body: json(variantUpdateSchema) },
    responses: {
      200: { description: 'Updated', ...json(successEnvelope(obj('SellerProductDetail'))) },
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/seller/inventory',
    tags: sellerTags,
    security: secured,
    summary: 'Variant stock levels',
    request: {
      query: z.object({
        q: z.string().optional(),
        filter: z.enum(['all', 'low', 'out']).optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      }),
    },
    responses: {
      200: { description: 'Rows', ...json(paginatedEnvelope(obj('InventoryRow'))) },
      ...sellerErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/seller/inventory/{variantId}',
    tags: sellerTags,
    security: secured,
    summary: 'Set or adjust stock',
    description: 'Rejected with 409 if stock would fall below units reserved by pending orders.',
    request: { params: z.object({ variantId: z.string() }), body: json(stockUpdateSchema) },
    responses: {
      200: { description: 'Updated', ...json(successEnvelope(obj('InventoryRow'))) },
      409: err('Below reserved'),
      ...sellerErrors,
    },
  });

  // ── Uploads ───────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/uploads/images',
    tags: ['Uploads'],
    security: secured,
    summary:
      'Upload images (multipart field `images`, max 8 × 5 MB; JPEG/PNG/WebP/AVIF by content)',
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              images: z.array(z.string().describe('binary')),
              purpose: z.enum(['product', 'category', 'brand']).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Uploaded',
        ...json(
          successEnvelope(
            z.array(
              z.object({
                url: z.string(),
                publicId: z.string(),
                width: z.number(),
                height: z.number(),
              }),
            ),
          ),
        ),
      },
      400: err('Not an allowed image'),
      413: err('Too large'),
      503: err('Image storage not configured'),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/uploads/images',
    tags: ['Uploads'],
    security: secured,
    summary: 'Delete one of your uploaded images',
    request: { body: json(imageDeleteSchema) },
    responses: {
      200: { description: 'Deleted', ...json(successEnvelope(z.null())) },
      403: err('Not your image'),
    },
  });

  // ── Admin catalogue ───────────────────────────────────────────────────────
  const adminTags = ['Admin'];
  const adminErrors = { 401: err('Not signed in'), 403: err('Admin role required') };
  registry.registerPath({
    method: 'get',
    path: '/admin/categories',
    tags: adminTags,
    security: secured,
    summary: 'All categories (incl. inactive) with product counts',
    responses: {
      200: { description: 'Categories', ...json(successEnvelope(z.array(obj('AdminCategory')))) },
      ...adminErrors,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/admin/categories',
    tags: adminTags,
    security: secured,
    summary: 'Create category',
    request: { body: json(categoryInputSchema) },
    responses: {
      201: { description: 'Created', ...json(successEnvelope(obj('Created'))) },
      409: err('Slug in use'),
      ...adminErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/admin/categories/{id}',
    tags: adminTags,
    security: secured,
    summary: 'Update / rename / move category (propagates to descendants and products)',
    request: { params: idParam, body: json(categoryUpdateSchema) },
    responses: {
      200: { description: 'Updated', ...json(successEnvelope(obj('Updated'))) },
      ...adminErrors,
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/admin/categories/{id}',
    tags: adminTags,
    security: secured,
    summary: 'Delete an unused category',
    request: { params: idParam },
    responses: {
      200: { description: 'Deleted', ...json(successEnvelope(z.null())) },
      409: err('In use'),
      ...adminErrors,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/admin/brands',
    tags: adminTags,
    security: secured,
    summary: 'Create brand',
    request: { body: json(brandInputSchema) },
    responses: {
      201: { description: 'Created', ...json(successEnvelope(obj('BrandSummary'))) },
      ...adminErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/admin/brands/{id}',
    tags: adminTags,
    security: secured,
    summary: 'Update brand',
    request: { params: idParam, body: json(brandUpdateSchema) },
    responses: {
      200: { description: 'Updated', ...json(successEnvelope(obj('BrandSummary'))) },
      ...adminErrors,
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/admin/brands/{id}',
    tags: adminTags,
    security: secured,
    summary: 'Delete an unused brand',
    request: { params: idParam },
    responses: {
      200: { description: 'Deleted', ...json(successEnvelope(z.null())) },
      409: err('In use'),
      ...adminErrors,
    },
  });
}
