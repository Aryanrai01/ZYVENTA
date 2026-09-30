import {
  discountPercent,
  type Breadcrumb,
  type ImageView,
  type ProductCard,
  type ProductDetail,
  type SellerProductDetail,
  type SellerProductRow,
  type SellerVariantView,
  type VariantOptionKey,
  type VariantOptions,
  type VariantView,
} from '@zyventa/shared';
import type { Types } from 'mongoose';
import { CART_LIMITS } from '../cart/cart.model.js';
import type { ProductVariantAttrs } from './product-variant.model.js';
import type { ProductAttrs } from './product.model.js';

type Id = { _id: Types.ObjectId };
type ProductLean = ProductAttrs & Id;
type VariantLean = ProductVariantAttrs & Id;

interface ImageLike {
  url: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  publicId?: string | null;
}

export function toImageView(
  image: ImageLike | null | undefined,
  fallbackAlt = '',
): ImageView | null {
  if (!image) return null;
  return {
    url: image.url,
    alt: image.alt || fallbackAlt,
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
  };
}

function cleanOptions(
  options: Partial<Record<VariantOptionKey, string | null>> | null | undefined,
): VariantOptions {
  const out: VariantOptions = {};
  for (const [key, value] of Object.entries(options ?? {})) {
    if (typeof value === 'string' && value.length > 0) out[key as VariantOptionKey] = value;
  }
  return out;
}

interface SeoLike {
  title?: string | null;
  description?: string | null;
}

/**
 * Empty sub-documents (`seo: {}`) are dropped by Mongoose's `minimize` on save, so a stored
 * product may have no `seo` at all even though the schema defaults it. Read it defensively.
 */
export function seoOf(seo: SeoLike | null | undefined): { title: string; description: string } {
  return { title: seo?.title ?? '', description: seo?.description ?? '' };
}

const available = (v: Pick<VariantLean, 'stock' | 'reserved'>) => Math.max(0, v.stock - v.reserved);

export type ProductCardSource = Pick<
  ProductLean,
  | '_id'
  | 'slug'
  | 'name'
  | 'brandName'
  | 'images'
  | 'priceMin'
  | 'priceMax'
  | 'mrpAtPriceMin'
  | 'discountPercent'
  | 'ratingAvg'
  | 'ratingCount'
  | 'inStock'
  | 'isFeatured'
>;

/** Fields a card needs — use as a Mongo projection to keep list payloads small. */
export const PRODUCT_CARD_PROJECTION =
  'slug name brandName images priceMin priceMax mrpAtPriceMin discountPercent ratingAvg ratingCount inStock isFeatured';

export function toProductCard(p: ProductCardSource): ProductCard {
  return {
    id: p._id.toString(),
    slug: p.slug,
    name: p.name,
    brandName: p.brandName,
    image: toImageView(p.images[0], p.name),
    price: p.priceMin,
    mrp: p.mrpAtPriceMin,
    discountPercent: discountPercent(p.priceMin, p.mrpAtPriceMin),
    hasPriceRange: p.priceMax > p.priceMin,
    ratingAvg: Math.round(p.ratingAvg * 10) / 10,
    ratingCount: p.ratingCount,
    inStock: p.inStock,
    isFeatured: p.isFeatured,
  };
}

export function toVariantView(v: VariantLean, productName: string): VariantView {
  const free = available(v);
  return {
    id: v._id.toString(),
    sku: v.sku,
    options: cleanOptions(v.options),
    price: v.price,
    mrp: v.mrp,
    discountPercent: discountPercent(v.price, v.mrp),
    inStock: free > 0,
    lowStock: free > 0 && free <= Math.max(v.lowStockThreshold, 1),
    maxQuantity: Math.min(free, CART_LIMITS.quantityPerLine),
    images: v.images.flatMap((img) => toImageView(img, productName) ?? []),
    isDefault: v.isDefault,
  };
}

export function toProductDetail(
  p: ProductLean,
  variants: VariantLean[],
  context: {
    breadcrumbs: Breadcrumb[];
    brand: { name: string; slug: string } | null;
    seller: ProductDetail['seller'];
  },
): ProductDetail {
  const card = toProductCard(p);
  const category = context.breadcrumbs.at(-1) ?? { name: '', slug: '' };
  return {
    ...card,
    shortDescription: p.shortDescription,
    description: p.description,
    images: p.images.flatMap((img) => toImageView(img, p.name) ?? []),
    highlights: p.highlights,
    specifications: p.specifications.map((s) => ({ group: s.group, name: s.name, value: s.value })),
    attributes: p.attributes.map((a) => ({ key: a.key, value: a.value })),
    tags: p.tags,
    variantOptions: p.variantOptions.map((o) => ({ name: o.name, values: o.values })),
    variants: variants.map((v) => toVariantView(v, p.name)),
    category,
    breadcrumbs: context.breadcrumbs,
    brand: context.brand,
    seller: context.seller,
    returnPolicy: {
      returnable: p.returnPolicy?.returnable ?? true,
      windowDays: p.returnPolicy?.windowDays ?? 7,
    },
    warranty: p.warranty,
    seo: {
      title: seoOf(p.seo).title || `${p.name}${p.brandName ? ` by ${p.brandName}` : ''}`,
      description: seoOf(p.seo).description || p.shortDescription || p.name,
    },
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  };
}

// ── Seller-facing ──────────────────────────────────────────────────────────

export function toSellerVariantView(v: VariantLean, productName: string): SellerVariantView {
  return {
    id: v._id.toString(),
    sku: v.sku,
    options: cleanOptions(v.options),
    price: v.price,
    mrp: v.mrp,
    discountPercent: discountPercent(v.price, v.mrp),
    images: v.images.flatMap((img) => toImageView(img, productName) ?? []),
    isDefault: v.isDefault,
    stock: v.stock,
    reserved: v.reserved,
    available: available(v),
    lowStockThreshold: v.lowStockThreshold,
    isActive: v.isActive,
  };
}

export function toSellerProductDetail(
  p: ProductLean,
  variants: VariantLean[],
): SellerProductDetail {
  return {
    id: p._id.toString(),
    slug: p.slug,
    name: p.name,
    status: p.status,
    statusReason: p.statusReason ?? null,
    categoryId: p.category.toString(),
    brandId: p.brand ? p.brand.toString() : null,
    shortDescription: p.shortDescription,
    description: p.description,
    highlights: p.highlights,
    specifications: p.specifications.map((s) => ({ group: s.group, name: s.name, value: s.value })),
    attributes: p.attributes.map((a) => ({ key: a.key, value: a.value })),
    tags: p.tags,
    images: p.images.map((img) => ({
      ...(toImageView(img, p.name) ?? { url: img.url, alt: '' }),
      publicId: img.publicId ?? null,
    })),
    variantOptions: p.variantOptions.map((o) => ({ name: o.name, values: o.values })),
    variants: variants.map((v) => toSellerVariantView(v, p.name)),
    hsnCode: p.hsnCode ?? null,
    gstRateBps: p.gstRateBps ?? null,
    returnPolicy: {
      returnable: p.returnPolicy?.returnable ?? true,
      windowDays: p.returnPolicy?.windowDays ?? 7,
    },
    warranty: p.warranty,
    shipping: {
      ...(p.shipping?.weightGrams ? { weightGrams: p.shipping.weightGrams } : {}),
      ...(p.shipping?.lengthCm ? { lengthCm: p.shipping.lengthCm } : {}),
      ...(p.shipping?.widthCm ? { widthCm: p.shipping.widthCm } : {}),
      ...(p.shipping?.heightCm ? { heightCm: p.shipping.heightCm } : {}),
    },
    seo: seoOf(p.seo),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toSellerProductRow(p: ProductLean, variants: VariantLean[]): SellerProductRow {
  const active = variants.filter((v) => v.isActive);
  return {
    id: p._id.toString(),
    slug: p.slug,
    name: p.name,
    image: toImageView(p.images[0], p.name),
    status: p.status,
    statusReason: p.statusReason ?? null,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    variantCount: active.length,
    totalAvailable: active.reduce((sum, v) => sum + available(v), 0),
    lowStockVariants: active.filter((v) => available(v) <= v.lowStockThreshold).length,
    soldCount: p.soldCount,
    updatedAt: p.updatedAt.toISOString(),
  };
}
