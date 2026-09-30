import { CART_MAX_LINES, CART_MAX_QUANTITY_PER_LINE, PATTERNS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';
import { maxItems, money, uniqueBy } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

export const CART_LIMITS = {
  lines: CART_MAX_LINES,
  quantityPerLine: CART_MAX_QUANTITY_PER_LINE,
} as const;

const cartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: CART_LIMITS.quantityPerLine,
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    /**
     * Price when added — ONLY used to tell the shopper "price changed since you added this".
     * Checkout always re-reads the live variant price.
     */
    priceAtAdd: money(),
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** One persistent cart per user. Lines are embedded: bounded, always read together. */
const cartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: [
        maxItems(CART_LIMITS.lines, 'cart lines'),
        uniqueBy((i: { variant: Types.ObjectId }) => i.variant.toString(), 'Duplicate cart line'),
      ],
    },
    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
      match: PATTERNS.couponCode,
      default: null,
    },
  },
  { timestamps: true },
);

cartSchema.index({ user: 1 }, { unique: true });

export type CartAttrs = InferSchemaType<typeof cartSchema>;
export type CartDocument = HydratedDocument<CartAttrs>;
export const Cart = model('Cart', cartSchema);
