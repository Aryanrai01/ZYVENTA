import type {
  BrandSummary,
  CategoryDetail,
  CategoryNode,
  PublicSettings,
  ProductCard,
  ProductDetail,
  ProductFacets,
  ProductSort,
  SearchSuggestion,
  VariantOptionKey,
} from '@zyventa/shared';
import { apiClient, type ApiResult, type RequestOptions } from '@/lib/api-client';

/** Listing filters as the web app holds them (e.g. parsed from the URL). */
export interface ProductFilters {
  q?: string;
  category?: string;
  brand?: string[];
  seller?: string;
  /** Rupees. */
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  discount?: number;
  inStock?: boolean;
  featured?: boolean;
  options?: Partial<Record<VariantOptionKey, string[]>>;
  attributes?: Record<string, string[]>;
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

/** Serialises filters to the API's query contract (CSV lists, `attr_<key>` attributes). */
export function toProductQuery(
  filters: ProductFilters,
): Record<string, string | number | boolean | undefined> {
  const query: Record<string, string | number | boolean | undefined> = {
    q: filters.q,
    category: filters.category,
    brand: filters.brand?.length ? filters.brand.join(',') : undefined,
    seller: filters.seller,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    rating: filters.rating,
    discount: filters.discount,
    inStock: filters.inStock,
    featured: filters.featured,
    sort: filters.sort,
    page: filters.page,
    limit: filters.limit,
  };
  for (const [key, values] of Object.entries(filters.options ?? {})) {
    if (values.length) query[key] = values.join(',');
  }
  for (const [key, values] of Object.entries(filters.attributes ?? {})) {
    if (values.length) query[`attr_${key}`] = values.join(',');
  }
  return query;
}

/** Server components pass Next.js cache hints; client components omit them. */
type Cache = Pick<RequestOptions, 'next' | 'cache'>;

export const catalogService = {
  categories: async (cache?: Cache) =>
    (await apiClient.get<CategoryNode[]>('/categories', cache)).data,

  category: async (slug: string, cache?: Cache) =>
    (await apiClient.get<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`, cache)).data,

  /** Public platform settings (maintenance banner, free-delivery threshold, support). */
  settings: async (cache?: Cache) => (await apiClient.get<PublicSettings>('/settings', cache)).data,

  brands: async (cache?: Cache) => (await apiClient.get<BrandSummary[]>('/brands', cache)).data,

  products: (filters: ProductFilters, cache?: Cache): Promise<ApiResult<ProductCard[]>> =>
    apiClient.get<ProductCard[]>('/products', { query: toProductQuery(filters), ...cache }),

  facets: async (context: { q?: string; category?: string }, cache?: Cache) =>
    (await apiClient.get<ProductFacets>('/products/facets', { query: context, ...cache })).data,

  suggestions: async (q: string, signal?: AbortSignal) =>
    (
      await apiClient.get<SearchSuggestion[]>('/products/suggestions', {
        query: { q },
        ...(signal ? { signal } : {}),
      })
    ).data,

  product: async (slug: string, cache?: Cache) =>
    (await apiClient.get<ProductDetail>(`/products/${encodeURIComponent(slug)}`, cache)).data,

  related: async (slug: string, cache?: Cache) =>
    (await apiClient.get<ProductCard[]>(`/products/${encodeURIComponent(slug)}/related`, cache))
      .data,
};
