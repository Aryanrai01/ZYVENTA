import type { ProductSort } from '@zyventa/shared';
import type { Types } from 'mongoose';
import { escapeRegex } from '../../utils/cache.js';
import { buildSearchTokens } from './product.model.js';

/**
 * Pure translation of a parsed listing query (plus ids resolved from slugs) into a MongoDB
 * filter and sort. Kept free of I/O so every combination is unit-testable.
 */
export interface ResolvedProductQuery {
  search?:
    | { mode: 'text'; q: string }
    | { mode: 'prefix'; q: string }
    | { mode: 'ids'; ids: Types.ObjectId[] };
  categoryId?: Types.ObjectId;
  brandIds?: Types.ObjectId[];
  sellerId?: Types.ObjectId;
  minPricePaise?: number;
  maxPricePaise?: number;
  rating?: number;
  discount?: number;
  inStock?: boolean;
  featured?: boolean;
  attributes?: Record<string, string[]>;
  /** Products having an active variant with the requested options (resolved via variants). */
  productIdsFromOptions?: Types.ObjectId[];
}

export type MongoFilter = Record<string, unknown>;

export function buildProductFilter(query: ResolvedProductQuery): MongoFilter {
  const and: MongoFilter[] = [{ status: 'ACTIVE' }];

  if (query.search?.mode === 'text') {
    and.push({ $text: { $search: query.search.q } });
  } else if (query.search?.mode === 'prefix') {
    const tokens = buildSearchTokens(query.search.q).slice(0, 6);
    if (tokens.length > 0) {
      and.push({
        searchTokens: { $all: tokens.map((token) => new RegExp(`^${escapeRegex(token)}`)) },
      });
    }
  } else if (query.search?.mode === 'ids') {
    and.push({ _id: { $in: query.search.ids } });
  }

  if (query.categoryId) and.push({ categoryPath: query.categoryId });
  // An explicit brand filter that matched no brands must return nothing, not everything.
  if (query.brandIds) and.push({ brand: { $in: query.brandIds } });
  if (query.sellerId) and.push({ seller: query.sellerId });

  if (query.minPricePaise !== undefined || query.maxPricePaise !== undefined) {
    and.push({
      priceMin: {
        ...(query.minPricePaise !== undefined ? { $gte: query.minPricePaise } : {}),
        ...(query.maxPricePaise !== undefined ? { $lte: query.maxPricePaise } : {}),
      },
    });
  }
  if (query.rating !== undefined) and.push({ ratingAvg: { $gte: query.rating } });
  if (query.discount !== undefined) and.push({ discountPercent: { $gte: query.discount } });
  if (query.inStock !== undefined) and.push({ inStock: query.inStock });
  if (query.featured !== undefined) and.push({ isFeatured: query.featured });

  for (const [key, values] of Object.entries(query.attributes ?? {})) {
    and.push({ attributes: { $elemMatch: { key, value: { $in: values } } } });
  }
  if (query.productIdsFromOptions) and.push({ _id: { $in: query.productIdsFromOptions } });

  return and.length === 1 ? (and[0] ?? {}) : { $and: and };
}

export type MongoSort = Record<string, 1 | -1 | { $meta: 'textScore' }>;

/** Sort spec; `_id` is always the final tie-breaker so pagination is stable. */
export function buildProductSort(
  sort: ProductSort,
  searchMode: 'text' | 'prefix' | 'ids' | 'none',
): MongoSort {
  switch (sort) {
    case 'newest':
      return { createdAt: -1, _id: 1 };
    case 'price_asc':
      return { priceMin: 1, _id: 1 };
    case 'price_desc':
      return { priceMin: -1, _id: 1 };
    case 'rating':
      return { ratingAvg: -1, ratingCount: -1, _id: 1 };
    case 'reviews':
      return { ratingCount: -1, ratingAvg: -1, _id: 1 };
    case 'discount':
      return { discountPercent: -1, soldCount: -1, _id: 1 };
    case 'popular':
      return { soldCount: -1, ratingAvg: -1, _id: 1 };
    case 'relevance':
      return searchMode === 'text'
        ? { score: { $meta: 'textScore' }, soldCount: -1, _id: 1 }
        : { isFeatured: -1, soldCount: -1, createdAt: -1, _id: 1 };
  }
}

/** Heuristic: looks like a SKU (letters+digits, dash/underscore, no spaces). */
export function looksLikeSku(q: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/.test(q) && /\d/.test(q) && /[-_]/.test(q);
}

/** Rupees in the URL → paise in the database. */
export const rupeesToPaise = (rupees: number | undefined) =>
  rupees === undefined ? undefined : rupees * 100;
