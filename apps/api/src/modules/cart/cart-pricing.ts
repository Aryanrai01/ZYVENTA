import type {
  CartLine,
  CartLineStatus,
  CartShipment,
  CartView,
  ImageView,
  VariantOptions,
} from '@zyventa/shared';
import { CART_LIMITS } from './cart.model.js';
import type { ShippingSettings } from '../settings/settings.service.js';

/**
 * Pure cart pricing. Every amount the shopper sees is derived here from LIVE catalogue data
 * (never from anything the browser sent), so it can be unit-tested exhaustively. Checkout
 * (Phase 8) re-runs the same rules inside its transaction.
 */
export interface StoredLine {
  variantId: string;
  quantity: number;
  priceAtAdd: number | null;
  addedAt: Date | null;
}

export interface LiveVariant {
  id: string;
  productId: string;
  sku: string;
  options: VariantOptions;
  price: number;
  mrp: number;
  stock: number;
  reserved: number;
  isActive: boolean;
  image: ImageView | null;
}

export interface LiveProduct {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  sellable: boolean;
  image: ImageView | null;
  seller: { id: string; storeName: string; active: boolean };
}

export function lineStatus(
  requested: number,
  variant: LiveVariant | undefined,
  product: LiveProduct | undefined,
): { status: CartLineStatus; maxQuantity: number } {
  if (!variant || !product || !variant.isActive || !product.sellable || !product.seller.active) {
    return { status: 'UNAVAILABLE', maxQuantity: 0 };
  }
  const available = Math.max(0, variant.stock - variant.reserved);
  const maxQuantity = Math.min(available, CART_LIMITS.quantityPerLine);
  if (maxQuantity === 0) return { status: 'OUT_OF_STOCK', maxQuantity: 0 };
  if (requested > maxQuantity) return { status: 'QUANTITY_REDUCED', maxQuantity };
  return { status: 'OK', maxQuantity };
}

/** Flat fee per seller shipment, waived when that seller's subtotal reaches the threshold. */
export function shippingFor(subtotal: number, settings: ShippingSettings): number {
  if (subtotal <= 0) return 0;
  return subtotal >= settings.freeShippingThreshold ? 0 : settings.flatFeePerShipment;
}

export function priceCart(
  stored: StoredLine[],
  variants: Map<string, LiveVariant>,
  products: Map<string, LiveProduct>,
  settings: ShippingSettings,
): CartView {
  const items: CartLine[] = [];
  const bySeller = new Map<string, CartShipment>();
  let itemCount = 0;
  let subtotal = 0;
  let mrpTotal = 0;

  for (const line of stored) {
    const variant = variants.get(line.variantId);
    const product = variant ? products.get(variant.productId) : undefined;
    const { status, maxQuantity } = lineStatus(line.quantity, variant, product);
    const purchasable = status === 'OK' || status === 'QUANTITY_REDUCED';
    const units = purchasable ? Math.min(line.quantity, maxQuantity) : 0;
    const unitPrice = variant?.price ?? line.priceAtAdd ?? 0;
    const unitMrp = variant?.mrp ?? unitPrice;
    const lineTotal = unitPrice * units;

    const seller = product
      ? { id: product.seller.id, storeName: product.seller.storeName }
      : { id: '', storeName: '' };

    items.push({
      variantId: line.variantId,
      productId: variant?.productId ?? '',
      slug: product?.slug ?? '',
      name: product?.name ?? 'Item no longer available',
      brandName: product?.brandName ?? '',
      sku: variant?.sku ?? '',
      options: variant?.options ?? {},
      image: variant?.image ?? product?.image ?? null,
      seller,
      unitPrice,
      unitMrp,
      quantity: line.quantity,
      maxQuantity,
      lineTotal,
      status,
      offer: null,
      previousUnitPrice:
        variant && line.priceAtAdd !== null && line.priceAtAdd !== variant.price
          ? line.priceAtAdd
          : null,
      addedAt: line.addedAt ? line.addedAt.toISOString() : null,
    });

    if (units > 0) {
      itemCount += units;
      subtotal += lineTotal;
      mrpTotal += unitMrp * units;
      const shipment = bySeller.get(seller.id) ?? {
        seller,
        subtotal: 0,
        shippingFee: 0,
        amountToFreeShipping: 0,
      };
      shipment.subtotal += lineTotal;
      bySeller.set(seller.id, shipment);
    }
  }

  const shipments = [...bySeller.values()].map((s) => ({
    ...s,
    shippingFee: shippingFor(s.subtotal, settings),
    amountToFreeShipping: Math.max(0, settings.freeShippingThreshold - s.subtotal),
  }));
  const shippingFee = shipments.reduce((sum, s) => sum + s.shippingFee, 0);

  return {
    items,
    shipments,
    summary: {
      itemCount,
      subtotal,
      mrpTotal,
      savings: Math.max(0, mrpTotal - subtotal),
      shippingFee,
      total: subtotal + shippingFee,
      freeShippingThreshold: settings.freeShippingThreshold,
    },
    hasIssues: items.some((i) => i.status !== 'OK' || i.previousUnitPrice !== null),
  };
}
