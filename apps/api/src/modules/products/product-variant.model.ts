import { PATTERNS, VARIANT_OPTION_KEYS, type VariantOptions } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { count, imageSchema, maxItems, requiredMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

const optionValue = { type: String, trim: true, maxlength: 40 } as const;

/** One property per VARIANT_OPTION_KEYS entry (explicit so Mongoose can infer types). */
const optionsSchema = new Schema(
  {
    color: optionValue,
    size: optionValue,
    storage: optionValue,
    ram: optionValue,
    material: optionValue,
    model: optionValue,
  } satisfies Record<(typeof VARIANT_OPTION_KEYS)[number], typeof optionValue>,
  { _id: false },
);

/**
 * Canonical key of a variant's option combination, e.g. `color=black|storage=128 gb`.
 * Unique per product, so the same combination can't be created twice.
 */
export function buildOptionsKey(options: VariantOptions | null | undefined): string {
  if (!options) return 'default';
  const parts = VARIANT_OPTION_KEYS.flatMap((key) => {
    const value = options[key]?.trim().toLowerCase();
    return value ? [`${key}=${value}`] : [];
  });
  return parts.length > 0 ? parts.join('|') : 'default';
}

/**
 * Sellable unit. Holds price, stock and reservations.
 *
 * Stock model:  available = stock − reserved
 *  - checkout reserves:  updateOne({ _id, $expr: stock − reserved ≥ qty }, { $inc: { reserved: qty } })
 *  - payment confirms:   $inc { stock: −qty, reserved: −qty }
 *  - expiry releases:    $inc { reserved: −qty }
 * These conditional atomic updates (inside transactions) are what prevent overselling.
 */
const productVariantSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    /** Denormalised owner — every seller query filters on it (ownership / IDOR guard). */
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', required: true },
    sku: { type: String, required: true, trim: true, uppercase: true, match: PATTERNS.sku },
    options: { type: optionsSchema, default: () => ({}) },
    optionsKey: { type: String, required: true, maxlength: 400 },

    price: requiredMoney(100),
    mrp: requiredMoney(100),

    stock: count(0, 1_000_000),
    reserved: count(0, 1_000_000),
    lowStockThreshold: count(5, 10_000),

    images: { type: [imageSchema], default: [], validate: maxItems(8, 'variant images') },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    virtuals: {
      available: {
        get(this: { stock: number; reserved: number }) {
          return Math.max(0, this.stock - this.reserved);
        },
      },
    },
  },
);

productVariantSchema.pre('validate', function () {
  if (this.price > this.mrp) {
    this.invalidate('price', 'Selling price cannot exceed MRP');
  }
  if (this.reserved > this.stock) {
    this.invalidate('stock', 'Stock cannot be lower than units reserved by pending orders');
  }
  this.optionsKey = buildOptionsKey(this.options as VariantOptions | null);
});

productVariantSchema.index({ sku: 1 }, { unique: true });
productVariantSchema.index({ product: 1, optionsKey: 1 }, { unique: true });
// Product page / aggregate recomputation: active variants of a product by price.
productVariantSchema.index({ product: 1, isActive: 1, price: 1 });
// Seller inventory screen and low-stock report.
productVariantSchema.index({ seller: 1, stock: 1 });

export type ProductVariantAttrs = InferSchemaType<typeof productVariantSchema>;
export type ProductVariantDocument = HydratedDocument<ProductVariantAttrs>;
export const ProductVariant = model('ProductVariant', productVariantSchema);
