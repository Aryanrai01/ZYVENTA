import { z } from 'zod';
import type { VariantOptions } from '../constants/statuses.js';
import { objectIdSchema } from '../validation/fields.js';
import type { ImageView } from '../catalog/types.js';

/** Mirrors the API's cart limits so forms can validate before a round trip. */
export const CART_MAX_LINES = 50;
export const CART_MAX_QUANTITY_PER_LINE = 10;

const quantitySchema = z
  .number()
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(CART_MAX_QUANTITY_PER_LINE, `You can buy at most ${CART_MAX_QUANTITY_PER_LINE} of an item`);

/**
 * Only identifiers and quantities ever travel from the browser. Prices, stock and totals are
 * always computed by the API from the live catalogue.
 */
export const cartLineInputSchema = z
  .object({ variantId: objectIdSchema, quantity: quantitySchema })
  .strict();
export type CartLineInput = z.infer<typeof cartLineInputSchema>;

export const addCartItemSchema = cartLineInputSchema;
export type AddCartItemInput = CartLineInput;

export const updateCartItemSchema = z.object({ quantity: quantitySchema }).strict();
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

/** Guest cart lines (kept in the browser) — priced by the API, or merged into the account cart at sign-in. */
export const cartLinesSchema = z
  .object({ items: z.array(cartLineInputSchema).max(CART_MAX_LINES) })
  .strict();
export type CartLinesInput = z.infer<typeof cartLinesSchema>;

export const cartVariantParamSchema = z.object({ variantId: objectIdSchema }).strict();

export const CART_LINE_STATUSES = [
  /** Purchasable at the requested quantity. */
  'OK',
  /** Fewer units available than requested: the line counts at `maxQuantity`. */
  'QUANTITY_REDUCED',
  'OUT_OF_STOCK',
  /** Product or variant no longer sold (deleted, inactive, blocked, seller suspended). */
  'UNAVAILABLE',
] as const;
export type CartLineStatus = (typeof CART_LINE_STATUSES)[number];

export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  brandName: string;
  sku: string;
  options: VariantOptions;
  image: ImageView | null;
  seller: { id: string; storeName: string };
  /** Live price, paise. */
  unitPrice: number;
  unitMrp: number;
  /** Quantity the shopper asked for. */
  quantity: number;
  /** Most the shopper may buy right now (0 when not purchasable). */
  maxQuantity: number;
  /** unitPrice × purchasable quantity. */
  lineTotal: number;
  status: CartLineStatus;
  /** Automatic offer already included in unitPrice. */
  offer: { title: string; discountPerUnit: number } | null;
  /** Set when the price differs from the price at the time the item was added. */
  previousUnitPrice: number | null;
  addedAt: string | null;
}

export interface CartShipment {
  seller: { id: string; storeName: string };
  subtotal: number;
  shippingFee: number;
  /** Amount still needed from this seller for free shipping (0 when already free). */
  amountToFreeShipping: number;
}

export interface CartSummary {
  /** Units counted in totals (purchasable lines only). */
  itemCount: number;
  /** Sum of line totals (GST inclusive), paise. */
  subtotal: number;
  /** Sum of MRP × quantity, paise. */
  mrpTotal: number;
  savings: number;
  shippingFee: number;
  /** subtotal + shipping. Coupon discounts are applied at checkout. */
  total: number;
  freeShippingThreshold: number;
}

export interface CartView {
  items: CartLine[];
  shipments: CartShipment[];
  summary: CartSummary;
  /** True when any line needs the shopper's attention before checkout. */
  hasIssues: boolean;
}
