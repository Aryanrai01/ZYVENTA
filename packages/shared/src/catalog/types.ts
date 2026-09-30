import type { GstRateBps } from '../constants/india.js';
import type {
  ProductStatus,
  SellerStatus,
  VariantOptionKey,
  VariantOptions,
} from '../constants/statuses.js';

export interface ImageView {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

/** Compact product used in grids, carousels and search results. All money in paise. */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  image: ImageView | null;
  price: number;
  mrp: number;
  discountPercent: number;
  /** True when variants have different prices ("from ₹X"). */
  hasPriceRange: boolean;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
  isFeatured: boolean;
}

export interface VariantView {
  id: string;
  sku: string;
  options: VariantOptions;
  price: number;
  mrp: number;
  discountPercent: number;
  inStock: boolean;
  /** Few left: shown as urgency ("Only 3 left"); exact stock is never exposed. */
  lowStock: boolean;
  /** Max quantity a shopper may add (min of availability and per-line cap). */
  maxQuantity: number;
  images: ImageView[];
  isDefault: boolean;
}

export interface Breadcrumb {
  name: string;
  slug: string;
}

export interface ProductDetail extends Omit<ProductCard, 'image'> {
  shortDescription: string;
  /** Sanitised HTML. */
  description: string;
  images: ImageView[];
  highlights: string[];
  specifications: { group: string; name: string; value: string }[];
  attributes: { key: string; value: string }[];
  tags: string[];
  variantOptions: { name: VariantOptionKey; values: string[] }[];
  variants: VariantView[];
  category: Breadcrumb;
  breadcrumbs: Breadcrumb[];
  brand: { name: string; slug: string } | null;
  seller: { id: string; storeName: string; slug: string; ratingAvg: number; ratingCount: number };
  returnPolicy: { returnable: boolean; windowDays: number };
  warranty: string;
  seo: { title: string; description: string };
  publishedAt: string | null;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  image: ImageView | null;
  level: number;
  children: CategoryNode[];
}

export interface CategoryDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: ImageView | null;
  breadcrumbs: Breadcrumb[];
  children: { id: string; name: string; slug: string }[];
  filterableAttributes: { key: string; label: string; values: string[] }[];
  seo: { title: string; description: string };
}

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  logo: ImageView | null;
  isFeatured: boolean;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

/** Filter options for a listing context (category and/or search query). */
export interface ProductFacets {
  total: number;
  priceRange: { min: number; max: number } | null;
  brands: FacetValue[];
  attributes: { key: string; label: string; values: FacetValue[] }[];
  options: { key: VariantOptionKey; values: FacetValue[] }[];
  inStockCount: number;
}

export interface SearchSuggestion {
  type: 'product' | 'category' | 'brand';
  label: string;
  slug: string;
}

// ── Seller views ────────────────────────────────────────────────────────────

export interface SellerVariantView extends Omit<
  VariantView,
  'lowStock' | 'maxQuantity' | 'inStock'
> {
  stock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface SellerProductRow {
  id: string;
  slug: string;
  name: string;
  image: ImageView | null;
  status: ProductStatus;
  statusReason: string | null;
  priceMin: number;
  priceMax: number;
  variantCount: number;
  totalAvailable: number;
  lowStockVariants: number;
  soldCount: number;
  updatedAt: string;
}

export interface SellerProductDetail {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  statusReason: string | null;
  categoryId: string;
  brandId: string | null;
  shortDescription: string;
  description: string;
  highlights: string[];
  specifications: { group: string; name: string; value: string }[];
  attributes: { key: string; value: string }[];
  tags: string[];
  images: (ImageView & { publicId: string | null })[];
  variantOptions: { name: VariantOptionKey; values: string[] }[];
  variants: SellerVariantView[];
  hsnCode: string | null;
  gstRateBps: GstRateBps | null;
  returnPolicy: { returnable: boolean; windowDays: number };
  warranty: string;
  shipping: { weightGrams?: number; lengthCm?: number; widthCm?: number; heightCm?: number };
  seo: { title: string; description: string };
  createdAt: string;
  updatedAt: string;
}

export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
  options: VariantOptions;
  stock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  isActive: boolean;
  image: ImageView | null;
}

export interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

export interface PublicSellerSummary {
  id: string;
  storeName: string;
  slug: string;
  status: SellerStatus;
}
