import { GST_RATES_BPS, PATTERNS, PRODUCT_STATUSES, VARIANT_OPTION_KEYS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { imageSchema, maxItems, money, seoSchema, uniqueBy } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

export const PRODUCT_LIMITS = {
  images: 10,
  tags: 20,
  highlights: 10,
  specifications: 100,
  attributes: 50,
  variantAxes: 3,
} as const;

/** One axis a product varies on, with its allowed values in display order. */
const variantOptionSchema = new Schema(
  {
    name: { type: String, enum: VARIANT_OPTION_KEYS, required: true },
    values: {
      type: [{ type: String, trim: true, minlength: 1, maxlength: 40 }],
      validate: [
        {
          validator: (v: string[]) => v.length >= 1 && v.length <= 30,
          message: '1–30 values per option',
        },
        uniqueBy((v: string) => v.toLowerCase(), 'Option values must be unique'),
      ],
    },
  },
  { _id: false },
);

/** Attribute pattern: `{ key, value }` rows are indexable for faceted filtering. */
const attributeSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z][a-z0-9_]{1,39}$/,
    },
    value: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { _id: false },
);

const specificationSchema = new Schema(
  {
    group: { type: String, trim: true, maxlength: 60, default: 'General' },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    value: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', required: true },
    /** Leaf category the product is listed in. */
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    /** Ancestors + category — lets "Electronics" match products filed under "Smartphones". */
    categoryPath: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      validate: { validator: (v: unknown[]) => v.length >= 1, message: 'categoryPath is required' },
    },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', default: null },
    /** Denormalised for the text index and cards; kept in sync by the product service. */
    brandName: { type: String, trim: true, maxlength: 60, default: '' },

    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, match: PATTERNS.slug, maxlength: 160 },
    shortDescription: { type: String, trim: true, maxlength: 300, default: '' },
    /** Sanitised HTML (allowlist applied by the product service before saving). */
    description: { type: String, maxlength: 20_000, default: '' },
    highlights: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      default: [],
      validate: maxItems(PRODUCT_LIMITS.highlights, 'highlights'),
    },
    specifications: {
      type: [specificationSchema],
      default: [],
      validate: maxItems(PRODUCT_LIMITS.specifications, 'specifications'),
    },
    attributes: {
      type: [attributeSchema],
      default: [],
      validate: maxItems(PRODUCT_LIMITS.attributes, 'attributes'),
    },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
      default: [],
      validate: [
        maxItems(PRODUCT_LIMITS.tags, 'tags'),
        uniqueBy((t: string) => t, 'Tags must be unique'),
      ],
    },
    images: {
      type: [imageSchema],
      default: [],
      validate: maxItems(PRODUCT_LIMITS.images, 'images'),
    },

    /** Empty for simple products (a single hidden default variant exists). */
    variantOptions: {
      type: [variantOptionSchema],
      default: [],
      validate: [
        maxItems(PRODUCT_LIMITS.variantAxes, 'variant options'),
        uniqueBy((o: { name: string }) => o.name, 'Each variant option can appear once'),
      ],
    },

    // ── Denormalised from variants (recomputed on every variant write) ─────────
    priceMin: money(),
    priceMax: money(),
    /** MRP of the variant that sets priceMin — what a product card shows struck through. */
    mrpAtPriceMin: money(),
    /** Highest discount % across active variants (for "Highest discount" sort/filter). */
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    inStock: { type: Boolean, default: false },
    variantCount: { type: Number, min: 0, default: 0 },

    // ── Denormalised from reviews/orders ──────────────────────────────────────
    ratingAvg: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    /** Units sold (confirmed orders) — drives "Popular" and best-seller sections. */
    soldCount: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: PRODUCT_STATUSES, default: 'DRAFT' },
    statusReason: { type: String, trim: true, maxlength: 500 },
    isFeatured: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },

    // ── Commerce policy ───────────────────────────────────────────────────────
    hsnCode: { type: String, trim: true, match: PATTERNS.hsn },
    /** Overrides the category GST rate when set. */
    gstRateBps: { type: Number, enum: [...GST_RATES_BPS, null], default: null },
    returnPolicy: {
      returnable: { type: Boolean, default: true },
      windowDays: { type: Number, min: 0, max: 30, default: 7 },
    },
    warranty: { type: String, trim: true, maxlength: 200, default: '' },
    shipping: {
      weightGrams: { type: Number, min: 1, max: 100_000 },
      lengthCm: { type: Number, min: 1, max: 500 },
      widthCm: { type: Number, min: 1, max: 500 },
      heightCm: { type: Number, min: 1, max: 500 },
    },
    seo: { type: seoSchema, default: () => ({}) },
    /**
     * Lower-cased words of name/brand/tags, derived on validate. Powers prefix search
     * ("iph" → "iphone") and autocomplete, which MongoDB text indexes cannot do.
     */
    searchTokens: { type: [String], default: [], select: false },
  },
  { timestamps: true },
);

const MAX_SEARCH_TOKENS = 60;

/** Splits text into unique lower-case alphanumeric tokens (accents folded). */
export function buildSearchTokens(
  ...parts: (string | readonly string[] | null | undefined)[]
): string[] {
  const tokens = new Set<string>();
  for (const part of parts.flat()) {
    if (!part) continue;
    const words = part
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    for (const word of words) {
      if (word.length > 0 && word.length <= 40) tokens.add(word);
      if (tokens.size >= MAX_SEARCH_TOKENS) return [...tokens];
    }
  }
  return [...tokens];
}

productSchema.pre('validate', function () {
  this.searchTokens = buildSearchTokens(this.name, this.brandName, this.tags);
  if (this.status === 'ACTIVE' && this.images.length === 0) {
    this.invalidate('images', 'An active product needs at least one image');
  }
  if (this.priceMax < this.priceMin) {
    this.invalidate('priceMax', 'priceMax cannot be lower than priceMin');
  }
  if (!this.categoryPath.some((id) => id.equals(this.category))) {
    this.invalidate('categoryPath', 'categoryPath must include the product category');
  }
});

// ── Indexes (each maps to a concrete query in the catalog/search/dashboard services) ──
productSchema.index({ slug: 1 }, { unique: true });
// Prefix search + autocomplete: anchored, case-sensitive regex on lower-cased tokens uses this index.
productSchema.index({ status: 1, searchTokens: 1 });
productSchema.index(
  { name: 'text', brandName: 'text', tags: 'text', shortDescription: 'text' },
  {
    name: 'product_text_search',
    weights: { name: 10, brandName: 6, tags: 4, shortDescription: 1 },
    default_language: 'english',
  },
);
// Category listing, one index per supported sort (ESR rule: equality → sort → range).
productSchema.index({ status: 1, categoryPath: 1, priceMin: 1 });
productSchema.index({ status: 1, categoryPath: 1, createdAt: -1 });
productSchema.index({ status: 1, categoryPath: 1, soldCount: -1 });
productSchema.index({ status: 1, categoryPath: 1, ratingAvg: -1, ratingCount: -1 });
productSchema.index({ status: 1, categoryPath: 1, discountPercent: -1 });
// Brand pages and brand filter.
productSchema.index({ status: 1, brand: 1, priceMin: 1 });
// Faceted attribute filters.
productSchema.index({ status: 1, 'attributes.key': 1, 'attributes.value': 1 });
// Homepage rails.
productSchema.index({ status: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ status: 1, soldCount: -1 });
// Seller dashboard product table and public seller storefront.
productSchema.index({ seller: 1, status: 1, updatedAt: -1 });

export type ProductAttrs = InferSchemaType<typeof productSchema>;
export type ProductDocument = HydratedDocument<ProductAttrs>;
export const Product = model('Product', productSchema);
