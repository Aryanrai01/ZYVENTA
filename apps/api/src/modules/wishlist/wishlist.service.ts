import { ERROR_CODES, type WishlistView } from '@zyventa/shared';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import {
  PRODUCT_CARD_PROJECTION,
  toProductCard,
  type ProductCardSource,
} from '../products/product.mapper.js';
import { Product } from '../products/product.model.js';
import { WISHLIST_LIMIT, Wishlist } from './wishlist.model.js';

interface WishlistItemDoc {
  product: Types.ObjectId;
  addedAt?: Date | null;
}

export function createWishlistService() {
  async function items(userId: string): Promise<WishlistItemDoc[]> {
    const doc = await Wishlist.findOne({ user: userId }).select('items').lean();
    return doc?.items ?? [];
  }

  return {
    /** Product ids only — drives the heart icons across listings. */
    async ids(userId: string): Promise<string[]> {
      return (await items(userId)).map((i) => i.product.toString());
    },

    async view(userId: string): Promise<WishlistView> {
      const saved = await items(userId);
      const products = await Product.find({
        _id: { $in: saved.map((i) => i.product) },
        status: 'ACTIVE',
      })
        .select(PRODUCT_CARD_PROJECTION)
        .lean<ProductCardSource[]>();
      const byId = new Map(products.map((p) => [p._id.toString(), p]));

      const result: WishlistView['items'] = [];
      for (const item of saved) {
        const product = byId.get(item.product.toString());
        if (product) {
          result.push({
            product: toProductCard(product),
            addedAt: (item.addedAt ?? new Date(0)).toISOString(),
          });
        }
      }
      return { items: result, unavailableCount: saved.length - result.length };
    },

    /** Idempotent: saving an already-saved product succeeds without duplicating it. */
    async add(userId: string, productId: string): Promise<void> {
      const exists = await Product.exists({ _id: productId, status: 'ACTIVE' });
      if (!exists) {
        throw ApiError.notFound('This product is not available', ERROR_CODES.PRODUCT_UNAVAILABLE);
      }
      await Wishlist.updateOne(
        { user: userId },
        { $setOnInsert: { user: userId, items: [] } },
        { upsert: true },
      ).catch((error: unknown) => {
        if ((error as { code?: number }).code !== 11000) throw error;
      });
      // One atomic conditional push: not already present AND below the limit.
      const result = await Wishlist.updateOne(
        {
          user: userId,
          'items.product': { $ne: productId },
          $expr: { $lt: [{ $size: '$items' }, WISHLIST_LIMIT] },
        },
        {
          $push: { items: { $each: [{ product: productId, addedAt: new Date() }], $position: 0 } },
        },
      );
      if (result.modifiedCount === 1) return;
      const already = await Wishlist.exists({ user: userId, 'items.product': productId });
      if (!already) {
        throw ApiError.unprocessable(
          `Your wishlist can hold up to ${String(WISHLIST_LIMIT)} products`,
          ERROR_CODES.WISHLIST_LIMIT_REACHED,
        );
      }
    },

    async remove(userId: string, productId: string): Promise<void> {
      await Wishlist.updateOne({ user: userId }, { $pull: { items: { product: productId } } });
    },
  };
}

export type WishlistService = ReturnType<typeof createWishlistService>;
