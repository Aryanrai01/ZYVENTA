import { CART_MAX_LINES, ERROR_CODES, type CartLineInput, type CartView } from '@zyventa/shared';
import type { Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import type { PromotionService } from '../coupons/promotion.service.js';
import { loadLiveCatalog, type LiveCatalog } from '../pricing/live-catalog.js';
import { bestOffer } from '../pricing/pricing-engine.js';
import type { SettingsService } from '../settings/settings.service.js';
import { lineStatus, priceCart, type LiveVariant, type StoredLine } from './cart-pricing.js';
import { CART_LIMITS, Cart } from './cart.model.js';

interface CartItemDoc {
  product: Types.ObjectId;
  variant: Types.ObjectId;
  quantity: number;
  priceAtAdd?: number | null;
  addedAt?: Date | null;
}

const MAX_WRITE_ATTEMPTS = 3;

type LiveWithOffers = LiveCatalog & {
  offers: Map<string, { title: string; discountPerUnit: number }>;
};

function toStored(items: CartItemDoc[]): StoredLine[] {
  return items.map((i) => ({
    variantId: i.variant.toString(),
    quantity: i.quantity,
    priceAtAdd: i.priceAtAdd ?? null,
    addedAt: i.addedAt ?? null,
  }));
}

/** Combines duplicate guest lines and caps each at the per-line limit. */
function normaliseLines(lines: CartLineInput[]): CartLineInput[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }
  return [...merged].map(([variantId, quantity]) => ({
    variantId,
    quantity: Math.min(quantity, CART_LIMITS.quantityPerLine),
  }));
}

function assertPurchasable(quantity: number, live: LiveCatalog, variantId: string): LiveVariant {
  const variant = live.variants.get(variantId);
  const product = variant ? live.products.get(variant.productId) : undefined;
  const { status, maxQuantity } = lineStatus(quantity, variant, product);
  if (status === 'UNAVAILABLE' || !variant) {
    throw ApiError.notFound('This item is no longer available', ERROR_CODES.PRODUCT_UNAVAILABLE);
  }
  if (status === 'OUT_OF_STOCK') {
    throw ApiError.conflict('This item is out of stock', ERROR_CODES.OUT_OF_STOCK);
  }
  if (status === 'QUANTITY_REDUCED') {
    throw ApiError.conflict(
      maxQuantity === CART_LIMITS.quantityPerLine
        ? `You can buy at most ${String(maxQuantity)} of this item`
        : `Only ${String(maxQuantity)} left in stock`,
      ERROR_CODES.INSUFFICIENT_STOCK,
    );
  }
  return variant;
}

/**
 * Persistent, server-priced cart. The browser only ever sends variant ids and quantities;
 * all prices, availability and totals come from the live catalogue on every read.
 */
export function createCartService(deps: {
  settings: SettingsService;
  promotions: PromotionService;
}) {
  const { settings, promotions } = deps;

  /** Live catalogue with the best automatic offer already applied to each variant's price. */
  async function loadLive(variantIds: string[]): Promise<LiveWithOffers> {
    const [live, activeOffers] = await Promise.all([
      loadLiveCatalog(variantIds),
      promotions.activeOffers(),
    ]);
    const offers = new Map<string, { title: string; discountPerUnit: number }>();
    for (const variant of live.variants.values()) {
      const product = live.products.get(variant.productId);
      if (!product) continue;
      const best = bestOffer(
        {
          categoryPath: product.categoryPath,
          productId: product.id,
          brandId: product.brandId,
          sellerId: product.seller.id,
          listPrice: variant.price,
        },
        activeOffers,
      );
      if (best) {
        offers.set(variant.id, { title: best.rule.title, discountPerUnit: best.discountPerUnit });
        variant.price -= best.discountPerUnit;
      }
    }
    return { ...live, offers };
  }

  async function getOrCreate(userId: string) {
    try {
      return await Cart.findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { user: userId, items: [] } },
        { upsert: true, returnDocument: 'after' },
      )
        .select('items __v')
        .lean()
        .orFail();
    } catch (error) {
      // Two first-writes racing on the unique `user` index: the loser simply reads.
      if ((error as { code?: number }).code === 11000) {
        return Cart.findOne({ user: userId }).select('items __v').lean().orFail();
      }
      throw error;
    }
  }

  /**
   * Optimistic read-modify-write: the write only lands if nobody changed the cart since it
   * was read (`__v` guard), so two tabs can't silently overwrite each other.
   */
  async function mutate(
    userId: string,
    change: (items: CartItemDoc[]) => Promise<CartItemDoc[]>,
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const cart = await getOrCreate(userId);
      const version = (cart as { __v?: number }).__v ?? 0;
      const next = await change(cart.items);
      const result = await Cart.updateOne(
        { _id: cart._id, __v: version },
        { $set: { items: next }, $inc: { __v: 1 } },
        { runValidators: true },
      );
      if (result.matchedCount === 1) return;
    }
    throw ApiError.conflict('Your cart was updated elsewhere. Please try again.');
  }

  async function price(stored: StoredLine[]): Promise<CartView> {
    const [live, shipping] = await Promise.all([
      loadLive(stored.map((l) => l.variantId)),
      settings.shipping(),
    ]);
    const view = priceCart(stored, live.variants, live.products, shipping);
    return {
      ...view,
      items: view.items.map((item) => ({
        ...item,
        offer: live.offers.get(item.variantId) ?? null,
      })),
    };
  }

  async function view(userId: string): Promise<CartView> {
    const cart = await Cart.findOne({ user: userId }).select('items').lean();
    return price(toStored((cart?.items ?? []) as CartItemDoc[]));
  }

  return {
    view,

    /** Prices a guest cart held in the browser. Nothing is stored. */
    preview(lines: CartLineInput[]): Promise<CartView> {
      return price(normaliseLines(lines).map((l) => ({ ...l, priceAtAdd: null, addedAt: null })));
    },

    /** Adds units of a variant (or more of an existing line). */
    async add(userId: string, input: CartLineInput): Promise<CartView> {
      await mutate(userId, async (items) => {
        const existing = items.find((i) => i.variant.toString() === input.variantId);
        const quantity = (existing?.quantity ?? 0) + input.quantity;
        if (!existing && items.length >= CART_MAX_LINES) {
          throw ApiError.unprocessable(
            `Your cart can hold up to ${String(CART_MAX_LINES)} different items`,
            ERROR_CODES.CART_LIMIT_REACHED,
          );
        }
        const live = await loadLive([input.variantId]);
        const variant = assertPurchasable(quantity, live, input.variantId);
        if (existing) {
          return items.map((i) =>
            i === existing ? { ...i, quantity, priceAtAdd: variant.price } : i,
          );
        }
        return [
          ...items,
          {
            product: new mongoose.Types.ObjectId(variant.productId),
            variant: new mongoose.Types.ObjectId(variant.id),
            quantity,
            priceAtAdd: variant.price,
            addedAt: new Date(),
          },
        ];
      });
      return view(userId);
    },

    /** Sets a line's quantity. Also acknowledges any price change on that line. */
    async setQuantity(userId: string, variantId: string, quantity: number): Promise<CartView> {
      await mutate(userId, async (items) => {
        const existing = items.find((i) => i.variant.toString() === variantId);
        if (!existing) throw ApiError.notFound('This item is not in your cart');
        const live = await loadLive([variantId]);
        const variant = assertPurchasable(quantity, live, variantId);
        return items.map((i) =>
          i === existing ? { ...i, quantity, priceAtAdd: variant.price } : i,
        );
      });
      return view(userId);
    },

    async remove(userId: string, variantId: string): Promise<CartView> {
      await Cart.updateOne(
        { user: userId },
        { $pull: { items: { variant: variantId } }, $inc: { __v: 1 } },
      );
      return view(userId);
    },

    async clear(userId: string): Promise<CartView> {
      await Cart.updateOne({ user: userId }, { $set: { items: [] }, $inc: { __v: 1 } });
      return view(userId);
    },

    /**
     * Folds a guest cart into the account cart after sign-in. Never fails on individual
     * lines: unavailable items are skipped and quantities clamp to what can be bought.
     */
    async merge(userId: string, lines: CartLineInput[]): Promise<CartView> {
      const guest = normaliseLines(lines);
      if (guest.length > 0) {
        await mutate(userId, async (items) => {
          const live = await loadLive(guest.map((l) => l.variantId));
          const next = [...items];
          for (const line of guest) {
            const index = next.findIndex((i) => i.variant.toString() === line.variantId);
            const current = index >= 0 ? next[index] : undefined;
            const variant = live.variants.get(line.variantId);
            const product = variant ? live.products.get(variant.productId) : undefined;
            const wanted = Math.max(current?.quantity ?? 0, line.quantity);
            const { status, maxQuantity } = lineStatus(wanted, variant, product);
            if (!variant || status === 'UNAVAILABLE' || status === 'OUT_OF_STOCK') continue;
            const quantity = Math.min(wanted, maxQuantity);
            if (current) {
              next[index] = { ...current, quantity };
            } else if (next.length < CART_MAX_LINES) {
              next.push({
                product: new mongoose.Types.ObjectId(variant.productId),
                variant: new mongoose.Types.ObjectId(variant.id),
                quantity,
                priceAtAdd: variant.price,
                addedAt: new Date(),
              });
            }
          }
          return next;
        });
      }
      return view(userId);
    },
  };
}

export type CartService = ReturnType<typeof createCartService>;
