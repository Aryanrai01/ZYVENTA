import { z } from 'zod';
import { paginationQuerySchema } from '../api/pagination.js';
import { VARIANT_OPTION_KEYS, type VariantOptionKey } from '../constants/statuses.js';
import { slugSchema } from '../validation/fields.js';

export const PRODUCT_SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'rating',
  'reviews',
  'discount',
  'popular',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  relevance: 'Relevance',
  newest: 'Newest first',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Highest rated',
  reviews: 'Most reviewed',
  discount: 'Biggest discount',
  popular: 'Popular',
};

/** Attribute filters travel as `attr_<key>=v1,v2` (dots are rejected by the API edge guard). */
export const ATTRIBUTE_PARAM_PREFIX = 'attr_';
const ATTRIBUTE_PARAM = /^attr_([a-z][a-z0-9_]{1,39})$/;

const csv = (item: z.ZodString, max: number) =>
  z
    .string()
    .max(1000)
    .transform((value) =>
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).min(1).max(max));

const optionValue = z.string().min(1).max(40);
const booleanParam = z.enum(['true', 'false']).transform((v) => v === 'true');

const baseSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: slugSchema.optional(),
  brand: csv(slugSchema, 20).optional(),
  seller: slugSchema.optional(),
  /** Whole rupees in the URL; converted to paise by the API. */
  minPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  discount: z.coerce.number().int().min(1).max(90).optional(),
  inStock: booleanParam.optional(),
  featured: booleanParam.optional(),
  color: csv(optionValue, 20).optional(),
  size: csv(optionValue, 20).optional(),
  storage: csv(optionValue, 20).optional(),
  ram: csv(optionValue, 20).optional(),
  material: csv(optionValue, 20).optional(),
  sort: z.enum(PRODUCT_SORTS).default('relevance'),
  page: paginationQuerySchema.shape.page,
  limit: paginationQuerySchema.shape.limit,
});

/**
 * Public product listing/search query. Unknown keys are rejected except `attr_<key>`
 * attribute filters, which are collected into `attributes`.
 */
export const productListQuerySchema = baseSchema
  .catchall(z.string().max(500))
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (key in baseSchema.shape) continue;
      if (!ATTRIBUTE_PARAM.test(key)) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Unknown filter' });
      }
    }
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minPrice'],
        message: 'minPrice cannot exceed maxPrice',
      });
    }
  })
  .transform((value) => {
    const attributes: Record<string, string[]> = {};
    const optionFilters: Partial<Record<VariantOptionKey, string[]>> = {};
    const rest: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      const match = ATTRIBUTE_PARAM.exec(key);
      if (match?.[1] && typeof raw === 'string') {
        const values = raw
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .slice(0, 20);
        if (values.length > 0) attributes[match[1]] = values;
      } else if ((VARIANT_OPTION_KEYS as readonly string[]).includes(key) && Array.isArray(raw)) {
        optionFilters[key as VariantOptionKey] = raw;
      } else if (!(VARIANT_OPTION_KEYS as readonly string[]).includes(key)) {
        rest[key] = raw;
      }
    }
    return {
      ...(rest as Omit<z.infer<typeof baseSchema>, VariantOptionKey>),
      attributes,
      options: optionFilters,
    };
  });

export type ProductListQuery = z.output<typeof productListQuerySchema>;
export type ProductListQueryInput = z.input<typeof baseSchema> & Record<`attr_${string}`, string>;

/** Cards for a known list of products (recently viewed), in the order given. */
export const PRODUCT_CARDS_MAX = 24;
export const productCardsQuerySchema = z
  .object({ slugs: csv(slugSchema, PRODUCT_CARDS_MAX) })
  .strict();
export type ProductCardsQuery = z.output<typeof productCardsQuerySchema>;

export const suggestionQuerySchema = z.object({ q: z.string().trim().min(1).max(60) }).strict();

/** Seller's own product table. */
export const sellerProductListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED']).optional(),
    lowStock: booleanParam.optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type SellerProductListQuery = z.output<typeof sellerProductListQuerySchema>;

export const inventoryQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    filter: z.enum(['all', 'low', 'out']).default('all'),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type InventoryQuery = z.output<typeof inventoryQuerySchema>;
