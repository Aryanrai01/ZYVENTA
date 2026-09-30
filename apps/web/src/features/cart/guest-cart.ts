import {
  CART_MAX_LINES,
  CART_MAX_QUANTITY_PER_LINE,
  cartLineInputSchema,
  type CartLineInput,
} from '@zyventa/shared';
import { z } from 'zod';
import { createLocalStore } from '@/lib/local-store';

/**
 * A visitor's cart before sign-in: only variant ids and quantities, kept in this browser.
 * It is priced by the API (`/cart/preview`) and merged into the account cart at sign-in.
 */
export const EMPTY_LINES: CartLineInput[] = [];

export const guestCart = createLocalStore(
  'zv_guest_cart',
  z.array(cartLineInputSchema).max(CART_MAX_LINES),
  EMPTY_LINES,
);

export function addGuestLine(
  lines: CartLineInput[],
  variantId: string,
  quantity: number,
  maxQuantity: number = CART_MAX_QUANTITY_PER_LINE,
): CartLineInput[] {
  const cap = Math.min(maxQuantity, CART_MAX_QUANTITY_PER_LINE);
  const existing = lines.find((l) => l.variantId === variantId);
  if (existing) {
    return lines.map((l) =>
      l === existing ? { ...l, quantity: Math.min(l.quantity + quantity, cap) } : l,
    );
  }
  if (lines.length >= CART_MAX_LINES) return lines;
  return [...lines, { variantId, quantity: Math.min(quantity, cap) }];
}

export function setGuestQuantity(
  lines: CartLineInput[],
  variantId: string,
  quantity: number,
): CartLineInput[] {
  const q = Math.max(1, Math.min(quantity, CART_MAX_QUANTITY_PER_LINE));
  return lines.map((l) => (l.variantId === variantId ? { ...l, quantity: q } : l));
}

export function removeGuestLine(lines: CartLineInput[], variantId: string): CartLineInput[] {
  return lines.filter((l) => l.variantId !== variantId);
}
