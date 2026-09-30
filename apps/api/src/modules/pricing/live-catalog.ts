import type { VariantOptionKey, VariantOptions } from '@zyventa/shared';
import type { ClientSession } from 'mongoose';
import type { LiveProduct, LiveVariant } from '../cart/cart-pricing.js';
import { Category } from '../categories/category.model.js';
import { toImageView } from '../products/product.mapper.js';
import { ProductVariant } from '../products/product-variant.model.js';
import { Product } from '../products/product.model.js';
import { Seller } from '../sellers/seller.model.js';

export interface LiveProductFull extends LiveProduct {
  categoryPath: string[];
  brandId: string | null;
  gstRateBps: number;
  returnable: boolean;
  returnWindowDays: number;
}

export interface LiveCatalog {
  variants: Map<string, LiveVariant>;
  products: Map<string, LiveProductFull>;
}

function cleanOptions(options: Record<string, unknown> | null | undefined): VariantOptions {
  const out: VariantOptions = {};
  for (const [key, value] of Object.entries(options ?? {})) {
    if (typeof value === 'string' && value.length > 0) out[key as VariantOptionKey] = value;
  }
  return out;
}

const DEFAULT_GST_BPS = 1800;

/**
 * Loads the live state (price, stock, sellability, tax, scope keys) of a set of variants in
 * four indexed queries. Used by the cart, checkout quotes and order placement (with session).
 */
export async function loadLiveCatalog(
  variantIds: string[],
  session?: ClientSession,
): Promise<LiveCatalog> {
  const variants = new Map<string, LiveVariant>();
  const products = new Map<string, LiveProductFull>();
  if (variantIds.length === 0) return { variants, products };

  const variantDocs = await ProductVariant.find({ _id: { $in: variantIds } })
    .select('product sku options price mrp stock reserved isActive images')
    .session(session ?? null)
    .lean();
  const productDocs = await Product.find({
    _id: { $in: [...new Set(variantDocs.map((v) => v.product.toString()))] },
  })
    .select(
      'slug name brandName images status seller category categoryPath brand gstRateBps returnPolicy',
    )
    .session(session ?? null)
    .lean();
  const [sellerDocs, categoryDocs] = await Promise.all([
    Seller.find({ _id: { $in: [...new Set(productDocs.map((p) => p.seller.toString()))] } })
      .select('storeName status')
      .session(session ?? null)
      .lean(),
    Category.find({ _id: { $in: [...new Set(productDocs.map((p) => p.category.toString()))] } })
      .select('gstRateBps')
      .session(session ?? null)
      .lean(),
  ]);
  const sellers = new Map(sellerDocs.map((s) => [s._id.toString(), s]));
  const categoryGst = new Map(categoryDocs.map((c) => [c._id.toString(), c.gstRateBps]));

  for (const p of productDocs) {
    const seller = sellers.get(p.seller.toString());
    products.set(p._id.toString(), {
      id: p._id.toString(),
      slug: p.slug,
      name: p.name,
      brandName: p.brandName,
      sellable: p.status === 'ACTIVE',
      image: toImageView(p.images[0], p.name),
      seller: {
        id: p.seller.toString(),
        storeName: seller?.storeName ?? '',
        active: seller?.status === 'ACTIVE',
      },
      categoryPath: p.categoryPath.map((c) => c.toString()),
      brandId: p.brand ? p.brand.toString() : null,
      gstRateBps: p.gstRateBps ?? categoryGst.get(p.category.toString()) ?? DEFAULT_GST_BPS,
      returnable: p.returnPolicy?.returnable ?? true,
      returnWindowDays: p.returnPolicy?.windowDays ?? 7,
    });
  }
  for (const v of variantDocs) {
    const product = products.get(v.product.toString());
    variants.set(v._id.toString(), {
      id: v._id.toString(),
      productId: v.product.toString(),
      sku: v.sku,
      options: cleanOptions(v.options),
      price: v.price,
      mrp: v.mrp,
      stock: v.stock,
      reserved: v.reserved,
      isActive: v.isActive,
      image: toImageView(v.images[0], product?.name ?? ''),
    });
  }
  return { variants, products };
}
