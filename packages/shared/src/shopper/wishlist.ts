import { z } from 'zod';
import type { ProductCard } from '../catalog/types.js';
import { objectIdSchema } from '../validation/fields.js';

export const WISHLIST_MAX_ITEMS = 200;

export const wishlistAddSchema = z.object({ productId: objectIdSchema }).strict();
export type WishlistAddInput = z.infer<typeof wishlistAddSchema>;

export const wishlistProductParamSchema = z.object({ productId: objectIdSchema }).strict();

export interface WishlistItem {
  product: ProductCard;
  addedAt: string;
}

export interface WishlistView {
  items: WishlistItem[];
  /** Saved products no longer on sale (hidden from `items`). */
  unavailableCount: number;
}
