import { discountPercent } from '@zyventa/shared';
import type { ClientSession, Types } from 'mongoose';
import { ProductVariant } from './product-variant.model.js';
import { Product } from './product.model.js';

export interface VariantPricingInput {
  price: number;
  mrp: number;
  stock: number;
  reserved: number;
  isActive: boolean;
}

export interface ProductAggregates {
  priceMin: number;
  priceMax: number;
  mrpAtPriceMin: number;
  discountPercent: number;
  inStock: boolean;
  variantCount: number;
}

/**
 * Listing fields derived from a product's variants. Inactive variants are ignored; a product
 * with no active variants shows price 0 and out of stock (it cannot be purchased).
 */
export function computeProductAggregates(
  variants: readonly VariantPricingInput[],
): ProductAggregates {
  const active = variants.filter((v) => v.isActive);
  if (active.length === 0) {
    return {
      priceMin: 0,
      priceMax: 0,
      mrpAtPriceMin: 0,
      discountPercent: 0,
      inStock: false,
      variantCount: 0,
    };
  }

  // Prefer the cheapest in-stock variant for the headline price; fall back to cheapest overall.
  const byPrice = [...active].sort((a, b) => a.price - b.price || b.mrp - a.mrp);
  const headline = byPrice.find((v) => v.stock - v.reserved > 0) ?? byPrice[0];
  if (!headline) throw new Error('unreachable: active variants are non-empty');

  return {
    priceMin: headline.price,
    priceMax: Math.max(...active.map((v) => v.price)),
    mrpAtPriceMin: headline.mrp,
    discountPercent: Math.max(...active.map((v) => discountPercent(v.price, v.mrp))),
    inStock: active.some((v) => v.stock - v.reserved > 0),
    variantCount: active.length,
  };
}

/**
 * Recomputes and stores the aggregates. Called by every variant write (price, stock, status)
 * inside the same transaction, so listings never disagree with the variants.
 */
export async function refreshProductAggregates(
  productId: Types.ObjectId,
  session?: ClientSession,
): Promise<ProductAggregates> {
  const variants = await ProductVariant.find({ product: productId })
    .select('price mrp stock reserved isActive')
    .session(session ?? null)
    .lean();
  const aggregates = computeProductAggregates(variants);
  await Product.updateOne({ _id: productId }, { $set: { ...aggregates } }, { session });
  return aggregates;
}
