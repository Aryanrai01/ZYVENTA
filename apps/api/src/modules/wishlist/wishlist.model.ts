import { WISHLIST_MAX_ITEMS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';
import { maxItems, uniqueBy } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

export const WISHLIST_LIMIT = WISHLIST_MAX_ITEMS;

const wishlistItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    /** Optional: a shopper may save a specific colour/size. */
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const wishlistSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [wishlistItemSchema],
      default: [],
      validate: [
        maxItems(WISHLIST_LIMIT, 'wishlist items'),
        uniqueBy(
          (i: { product: Types.ObjectId; variant?: Types.ObjectId | null }) =>
            `${i.product.toString()}:${i.variant?.toString() ?? '-'}`,
          'Item is already in the wishlist',
        ),
      ],
    },
  },
  { timestamps: true },
);

wishlistSchema.index({ user: 1 }, { unique: true });
// "How many shoppers saved this product" (seller analytics) without scanning every wishlist.
wishlistSchema.index({ 'items.product': 1 });

export type WishlistAttrs = InferSchemaType<typeof wishlistSchema>;
export type WishlistDocument = HydratedDocument<WishlistAttrs>;
export const Wishlist = model('Wishlist', wishlistSchema);
