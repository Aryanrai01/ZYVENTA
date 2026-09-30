import {
  buildPaginationMeta,
  type FacetValue,
  type PaginationMeta,
  type ProductCard,
  type ProductDetail,
  type ProductFacets,
  type ProductListQuery,
  type SearchSuggestion,
  type VariantOptionKey,
} from '@zyventa/shared';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex, type JsonCache } from '../../utils/cache.js';
import { Brand } from '../brands/brand.model.js';
import type { BrandService } from '../brands/brand.service.js';
import { Category } from '../categories/category.model.js';
import { breadcrumbsOf, type CategoryService } from '../categories/category.service.js';
import { Seller } from '../sellers/seller.model.js';
import {
  buildProductFilter,
  buildProductSort,
  looksLikeSku,
  rupeesToPaise,
  type ResolvedProductQuery,
} from './product-query.js';
import { ProductVariant } from './product-variant.model.js';
import {
  PRODUCT_CARD_PROJECTION,
  toProductCard,
  toProductDetail,
  type ProductCardSource,
} from './product.mapper.js';
import { Product, buildSearchTokens } from './product.model.js';

/** Above this many matching products, variant-option facets are skipped (too costly per request). */
const OPTION_FACET_PRODUCT_LIMIT = 5000;
const productKey = (slug: string) => `product:${slug}`;

export interface ProductListResult {
  items: ProductCard[];
  pagination: PaginationMeta;
  searchMode: 'text' | 'prefix' | 'sku' | 'none';
}

const titleCase = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Public catalogue reads. Only ACTIVE products are ever returned (enforced in the shared
 * filter builder). Products of suspended sellers are set INACTIVE by the admin suspension
 * flow (Phase 9), so they drop out of every listing automatically.
 */
export function createCatalogService(deps: {
  categories: CategoryService;
  brands: BrandService;
  cache: JsonCache;
}) {
  const { categories, brands, cache } = deps;

  async function resolveSearch(q: string | undefined): Promise<ResolvedProductQuery['search']> {
    if (!q) return undefined;
    if (looksLikeSku(q)) {
      const variant = await ProductVariant.findOne({ sku: q.toUpperCase(), isActive: true })
        .select('product')
        .lean();
      if (variant) return { mode: 'ids', ids: [variant.product] };
    }
    return { mode: 'text', q };
  }

  async function resolveQuery(query: ProductListQuery): Promise<ResolvedProductQuery> {
    const resolved: ResolvedProductQuery = {
      minPricePaise: rupeesToPaise(query.minPrice),
      maxPricePaise: rupeesToPaise(query.maxPrice),
      ...(query.rating !== undefined ? { rating: query.rating } : {}),
      ...(query.discount !== undefined ? { discount: query.discount } : {}),
      ...(query.inStock !== undefined ? { inStock: query.inStock } : {}),
      ...(query.featured !== undefined ? { featured: query.featured } : {}),
      attributes: query.attributes,
    };
    if (resolved.minPricePaise === undefined) delete resolved.minPricePaise;
    if (resolved.maxPricePaise === undefined) delete resolved.maxPricePaise;

    const [search, categoryId, brandIds, sellerId] = await Promise.all([
      resolveSearch(query.q),
      query.category ? categories.idForSlug(query.category) : undefined,
      query.brand ? brands.idsForSlugs(query.brand) : undefined,
      query.seller
        ? Seller.findOne({ slug: query.seller, status: 'ACTIVE' }).select('_id').lean()
        : undefined,
    ]);
    if (query.seller && !sellerId) throw ApiError.notFound('Seller not found');

    if (search) resolved.search = search;
    if (categoryId) resolved.categoryId = categoryId;
    if (brandIds) resolved.brandIds = brandIds;
    if (sellerId) resolved.sellerId = sellerId._id;

    const optionEntries = Object.entries(query.options) as [VariantOptionKey, string[]][];
    if (optionEntries.length > 0) {
      const variantFilter: Record<string, unknown> = { isActive: true };
      for (const [key, values] of optionEntries) variantFilter[`options.${key}`] = { $in: values };
      resolved.productIdsFromOptions = await ProductVariant.distinct('product', variantFilter);
    }
    return resolved;
  }

  async function runList(resolved: ResolvedProductQuery, query: ProductListQuery) {
    const filter = buildProductFilter(resolved);
    const mode = resolved.search?.mode ?? 'none';
    const [total, docs] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .select(PRODUCT_CARD_PROJECTION)
        .sort(buildProductSort(query.sort, mode))
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean<ProductCardSource[]>(),
    ]);
    return { total, docs };
  }

  return {
    async list(query: ProductListQuery): Promise<ProductListResult> {
      const resolved = await resolveQuery(query);
      let { total, docs } = await runList(resolved, query);
      let searchMode: ProductListResult['searchMode'] =
        resolved.search?.mode === 'ids' ? 'sku' : (resolved.search?.mode ?? 'none');

      // Full-word text search found nothing: retry as prefix search ("iph" → "iphone").
      if (total === 0 && resolved.search?.mode === 'text') {
        const prefix: ResolvedProductQuery = {
          ...resolved,
          search: { mode: 'prefix', q: resolved.search.q },
        };
        ({ total, docs } = await runList(prefix, query));
        searchMode = 'prefix';
      }

      return {
        items: docs.map(toProductCard),
        pagination: buildPaginationMeta(query.page, query.limit, total),
        searchMode,
      };
    },

    /** Filter options for a category and/or search context (other filters are not applied). */
    async facets(query: Pick<ProductListQuery, 'q' | 'category'>): Promise<ProductFacets> {
      return cache.wrap(`facets:${query.category ?? '*'}:${query.q ?? ''}`, 120, async () => {
        const [search, category] = await Promise.all([
          resolveSearch(query.q),
          query.category ? categories.bySlug(query.category) : undefined,
        ]);
        const context: ResolvedProductQuery = {};
        if (search) context.search = search;
        if (category) context.categoryId = await categories.idForSlug(category.slug);
        let match = buildProductFilter(context);
        if (search?.mode === 'text' && (await Product.countDocuments(match)) === 0) {
          match = buildProductFilter({ ...context, search: { mode: 'prefix', q: search.q } });
        }

        interface FacetResult {
          total: { n: number }[];
          price: { min: number; max: number }[];
          brands: { _id: Types.ObjectId; label: string; count: number }[];
          attributes: { _id: { k: string; v: string }; count: number }[];
          inStock: { n: number }[];
        }
        const [result] = await Product.aggregate<FacetResult>([
          { $match: match },
          {
            $facet: {
              total: [{ $count: 'n' }],
              price: [
                { $group: { _id: null, min: { $min: '$priceMin' }, max: { $max: '$priceMin' } } },
              ],
              brands: [
                { $match: { brand: { $ne: null } } },
                { $group: { _id: '$brand', label: { $first: '$brandName' }, count: { $sum: 1 } } },
                { $sort: { count: -1, label: 1 } },
                { $limit: 30 },
              ],
              attributes: [
                { $unwind: '$attributes' },
                {
                  $group: {
                    _id: { k: '$attributes.key', v: '$attributes.value' },
                    count: { $sum: 1 },
                  },
                },
                { $sort: { count: -1 } },
                { $limit: 300 },
              ],
              inStock: [{ $match: { inStock: true } }, { $count: 'n' }],
            },
          },
        ]);
        const total = result?.total[0]?.n ?? 0;

        const brandSlugs = new Map(
          (
            await Brand.find({ _id: { $in: result?.brands.map((b) => b._id) ?? [] } })
              .select('slug')
              .lean()
          ).map((b) => [b._id.toString(), b.slug]),
        );

        const labels = new Map(category?.filterableAttributes.map((a) => [a.key, a.label]) ?? []);
        const attributeGroups = new Map<string, FacetValue[]>();
        for (const row of result?.attributes ?? []) {
          const list = attributeGroups.get(row._id.k) ?? [];
          list.push({ value: row._id.v, label: row._id.v, count: row.count });
          attributeGroups.set(row._id.k, list);
        }

        let options: ProductFacets['options'] = [];
        if (total > 0 && total <= OPTION_FACET_PRODUCT_LIMIT) {
          const productIds = (await Product.distinct('_id', match)) as Types.ObjectId[];
          const rows = await ProductVariant.aggregate<{
            _id: { k: VariantOptionKey; v: string };
            count: number;
          }>([
            { $match: { product: { $in: productIds }, isActive: true } },
            { $project: { product: 1, opts: { $objectToArray: '$options' } } },
            { $unwind: '$opts' },
            { $match: { 'opts.v': { $type: 'string', $ne: '' } } },
            {
              $group: { _id: { k: '$opts.k', v: '$opts.v' }, products: { $addToSet: '$product' } },
            },
            { $project: { count: { $size: '$products' } } },
            { $sort: { count: -1 } },
            { $limit: 200 },
          ]);
          const grouped = new Map<VariantOptionKey, FacetValue[]>();
          for (const row of rows) {
            const list = grouped.get(row._id.k) ?? [];
            list.push({ value: row._id.v, label: row._id.v, count: row.count });
            grouped.set(row._id.k, list);
          }
          options = [...grouped.entries()].map(([key, values]) => ({ key, values }));
        }

        return {
          total,
          priceRange: result?.price[0]
            ? { min: result.price[0].min, max: result.price[0].max }
            : null,
          brands: (result?.brands ?? []).flatMap((b) => {
            const slug = brandSlugs.get(b._id.toString());
            return slug ? [{ value: slug, label: b.label, count: b.count }] : [];
          }),
          attributes: [...attributeGroups.entries()].map(([key, values]) => ({
            key,
            label: labels.get(key) ?? titleCase(key),
            values,
          })),
          options,
          inStockCount: result?.inStock[0]?.n ?? 0,
        } satisfies ProductFacets;
      });
    },

    async detail(slug: string): Promise<ProductDetail> {
      const detail = await cache.wrap(productKey(slug), 60, async () => {
        const product = await Product.findOne({ slug, status: 'ACTIVE' }).lean();
        if (!product) return null;
        const [variants, seller, category, brand] = await Promise.all([
          ProductVariant.find({ product: product._id, isActive: true })
            .sort({ isDefault: -1, price: 1 })
            .lean(),
          Seller.findOne({ _id: product.seller, status: 'ACTIVE' })
            .select('storeName slug ratingAvg ratingCount')
            .lean(),
          Category.findById(product.category).select('name slug ancestors').lean(),
          product.brand ? Brand.findById(product.brand).select('name slug').lean() : null,
        ]);
        if (!seller || !category || variants.length === 0) return null;
        return toProductDetail(product, variants, {
          breadcrumbs: breadcrumbsOf(category),
          brand: brand ? { name: brand.name, slug: brand.slug } : null,
          seller: {
            id: seller._id.toString(),
            storeName: seller.storeName,
            slug: seller.slug,
            ratingAvg: seller.ratingAvg,
            ratingCount: seller.ratingCount,
          },
        });
      });
      if (!detail) throw ApiError.notFound('Product not found');
      return detail;
    },

    async related(slug: string, limit = 12): Promise<ProductCard[]> {
      const product = await Product.findOne({ slug, status: 'ACTIVE' })
        .select('category categoryPath')
        .lean();
      if (!product) throw ApiError.notFound('Product not found');

      const pick = (
        categoryFilter: Record<string, unknown>,
        exclude: Types.ObjectId[],
        n: number,
      ) =>
        Product.find({ status: 'ACTIVE', _id: { $nin: exclude }, ...categoryFilter })
          .select(PRODUCT_CARD_PROJECTION)
          .sort({ inStock: -1, soldCount: -1, ratingAvg: -1, _id: 1 })
          .limit(n)
          .lean<ProductCardSource[]>();

      const same = await pick({ category: product.category }, [product._id], limit);
      const parentId = product.categoryPath.at(-2);
      const more =
        same.length < limit && parentId
          ? await pick(
              { categoryPath: parentId },
              [product._id, ...same.map((p) => p._id)],
              limit - same.length,
            )
          : [];
      return [...same, ...more].map(toProductCard);
    },

    /** Cards for known slugs (recently viewed), in the requested order; missing ones dropped. */
    async cards(slugs: string[]): Promise<ProductCard[]> {
      const docs = await Product.find({ slug: { $in: slugs }, status: 'ACTIVE' })
        .select(PRODUCT_CARD_PROJECTION)
        .lean<ProductCardSource[]>();
      const bySlug = new Map(docs.map((d) => [d.slug, d]));
      return slugs.flatMap((slug) => {
        const doc = bySlug.get(slug);
        return doc ? [toProductCard(doc)] : [];
      });
    },

    async suggestions(q: string): Promise<SearchSuggestion[]> {
      const tokens = buildSearchTokens(q).slice(0, 6);
      if (tokens.length === 0) return [];
      const namePrefix = new RegExp(`^${escapeRegex(q.trim())}`, 'i');
      const [products, cats, brandDocs] = await Promise.all([
        Product.find({
          status: 'ACTIVE',
          searchTokens: { $all: tokens.map((t) => new RegExp(`^${escapeRegex(t)}`)) },
        })
          .select('name slug')
          .sort({ soldCount: -1, _id: 1 })
          .limit(6)
          .lean(),
        Category.find({ isActive: true, name: namePrefix }).select('name slug').limit(3).lean(),
        Brand.find({ isActive: true, name: namePrefix }).select('name slug').limit(3).lean(),
      ]);
      return [
        ...cats.map((c) => ({ type: 'category' as const, label: c.name, slug: c.slug })),
        ...brandDocs.map((b) => ({ type: 'brand' as const, label: b.name, slug: b.slug })),
        ...products.map((p) => ({ type: 'product' as const, label: p.name, slug: p.slug })),
      ];
    },

    invalidateProduct(slug: string): Promise<void> {
      return cache.invalidate(productKey(slug));
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
