import {
  PATTERNS,
  PRODUCT_SORTS,
  VARIANT_OPTION_KEYS,
  type ProductSort,
  type VariantOptionKey,
} from '@zyventa/shared';
import type { ProductFilters } from '@/services/catalog.service';

/**
 * URL ⇄ filter state for listing pages. The URL is the single source of truth, so filtered
 * views are shareable, bookmarkable and work with the back button. Parsing is lenient:
 * unknown or malformed params (utm tags, hand-edited values) are dropped instead of failing
 * the page; the API validates strictly anyway.
 */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 24;
const ATTRIBUTE_PARAM = /^attr_([a-z][a-z0-9_]{1,39})$/;
const MAX_LIST = 20;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function csv(value: string | undefined, pattern?: RegExp): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 60 && (!pattern || pattern.test(v)))
    .slice(0, MAX_LIST);
  return items.length > 0 ? items : undefined;
}

function int(value: string | undefined, min: number, max: number): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
}

/** Keys that define the listing context rather than a user-applied filter. */
type Context = Pick<ProductFilters, 'q' | 'category'>;

export function parseFilters(params: SearchParamsRecord, context: Context = {}): ProductFilters {
  const filters: ProductFilters = { ...context, page: 1, limit: PAGE_SIZE };

  const q = first(params.q)?.trim().slice(0, 100);
  if (q && !context.q) filters.q = q;

  const brand = csv(first(params.brand), PATTERNS.slug);
  if (brand) filters.brand = brand;
  const seller = first(params.seller);
  if (seller && PATTERNS.slug.test(seller)) filters.seller = seller;

  const minPrice = int(first(params.minPrice), 0, 10_000_000);
  const maxPrice = int(first(params.maxPrice), 0, 10_000_000);
  if (minPrice !== undefined) filters.minPrice = minPrice;
  if (maxPrice !== undefined && (minPrice === undefined || maxPrice >= minPrice)) {
    filters.maxPrice = maxPrice;
  }

  const rating = int(first(params.rating), 1, 5);
  if (rating !== undefined) filters.rating = rating;
  const discount = int(first(params.discount), 1, 90);
  if (discount !== undefined) filters.discount = discount;
  if (first(params.inStock) === 'true') filters.inStock = true;
  if (first(params.featured) === 'true') filters.featured = true;

  const sort = first(params.sort);
  if (sort && (PRODUCT_SORTS as readonly string[]).includes(sort)) {
    filters.sort = sort as ProductSort;
  }
  const page = int(first(params.page), 1, 1000);
  if (page !== undefined) filters.page = page;

  const options: Partial<Record<VariantOptionKey, string[]>> = {};
  for (const key of VARIANT_OPTION_KEYS) {
    const values = csv(first(params[key]));
    if (values) options[key] = values;
  }
  if (Object.keys(options).length > 0) filters.options = options;

  const attributes: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(params)) {
    const match = ATTRIBUTE_PARAM.exec(key);
    const values = match?.[1] ? csv(first(raw)) : undefined;
    if (match?.[1] && values) attributes[match[1]] = values;
  }
  if (Object.keys(attributes).length > 0) filters.attributes = attributes;

  return filters;
}

/**
 * Filters → URL search string for the listing page. Context keys that are part of the path
 * (the category slug) are omitted; page 1 and default sort are left out for clean URLs.
 */
export function filtersToSearch(
  filters: ProductFilters,
  omit: (keyof ProductFilters)[] = [],
): string {
  const params = new URLSearchParams();
  const skip = new Set<string>(omit);
  const put = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === '' || value === false || skip.has(key)) return;
    params.set(key, String(value));
  };
  put('q', filters.q);
  put('category', filters.category);
  put('brand', filters.brand?.join(','));
  put('seller', filters.seller);
  put('minPrice', filters.minPrice);
  put('maxPrice', filters.maxPrice);
  put('rating', filters.rating);
  put('discount', filters.discount);
  put('inStock', filters.inStock);
  put('featured', filters.featured);
  for (const [key, values] of Object.entries(filters.options ?? {})) {
    if (values.length) put(key, values.join(','));
  }
  for (const [key, values] of Object.entries(filters.attributes ?? {})) {
    if (values.length) put(`attr_${key}`, values.join(','));
  }
  if (filters.sort && filters.sort !== 'relevance') put('sort', filters.sort);
  if (filters.page && filters.page > 1) put('page', filters.page);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** Number of user-applied filters (for the mobile "Filters (3)" button). */
export function activeFilterCount(filters: ProductFilters): number {
  let count = 0;
  if (filters.brand?.length) count += filters.brand.length;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) count += 1;
  if (filters.rating !== undefined) count += 1;
  if (filters.discount !== undefined) count += 1;
  if (filters.inStock) count += 1;
  if (filters.featured) count += 1;
  for (const values of Object.values(filters.options ?? {})) count += values.length;
  for (const values of Object.values(filters.attributes ?? {})) count += values.length;
  return count;
}

/** Returns a copy of a list-filter record with `key` set, or removed when empty. */
export function withList<R extends Partial<Record<string, string[]>>>(
  record: R | undefined,
  key: string,
  values: string[] | undefined,
): R | undefined {
  const next: Partial<Record<string, string[]>> = { ...record };
  if (values?.length) next[key] = values;
  else Reflect.deleteProperty(next, key);
  return Object.keys(next).length > 0 ? (next as R) : undefined;
}

/** Toggles one value in a list filter (brand, options, attributes). */
export function toggleValue(list: string[] | undefined, value: string): string[] | undefined {
  const current = list ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return next.length > 0 ? next : undefined;
}
