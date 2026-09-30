import {
  buildPaginationMeta,
  type NotificationListQuery,
  type NotificationView,
  type ProductCard,
  type ReportInput,
  type StockAlertView,
} from '@zyventa/shared';
import type { Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import type { JsonCache } from '../../utils/cache.js';
import { Notification } from '../notifications/notification.model.js';
import { OrderItem } from '../orders/order-item.model.js';
import { ProductVariant } from '../products/product-variant.model.js';
import {
  PRODUCT_CARD_PROJECTION,
  toProductCard,
  type ProductCardSource,
} from '../products/product.mapper.js';
import { Product } from '../products/product.model.js';
import { Report } from '../reports/report.model.js';
import { Review } from '../reviews/review.model.js';
import { Seller } from '../sellers/seller.model.js';
import { StockAlert } from '../stock-alerts/stock-alert.model.js';

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const MAX_ACTIVE_ALERTS = 100;

export function createEngagementService(deps: { cache: JsonCache }) {
  return {
    // ── Notifications ─────────────────────────────────────────────────────────
    async notifications(userId: string, query: NotificationListQuery) {
      const filter: Record<string, unknown> = { user: oid(userId) };
      if (query.unread) filter.readAt = null;
      const [total, unread, docs] = await Promise.all([
        Notification.countDocuments(filter),
        Notification.countDocuments({ user: oid(userId), readAt: null }),
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean(),
      ]);
      const items: NotificationView[] = docs.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link ?? null,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      }));
      return { items, unread, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    unreadCount(userId: string): Promise<number> {
      return Notification.countDocuments({ user: oid(userId), readAt: null });
    },

    /** `id` is a notification id or the literal 'all'. */
    async markRead(userId: string, id: string): Promise<number> {
      const filter =
        id === 'all'
          ? { user: oid(userId), readAt: null }
          : { _id: oid(id), user: oid(userId), readAt: null };
      await Notification.updateMany(filter, { $set: { readAt: new Date() } });
      return Notification.countDocuments({ user: oid(userId), readAt: null });
    },

    // ── Stock alerts ──────────────────────────────────────────────────────────
    async subscribe(userId: string, variantId: string): Promise<{ subscribed: true }> {
      const variant = await ProductVariant.findOne({ _id: variantId, isActive: true })
        .select('product stock reserved')
        .lean();
      if (!variant) throw ApiError.notFound('Variant not found');
      const product = await Product.exists({ _id: variant.product, status: 'ACTIVE' });
      if (!product) throw ApiError.notFound('Product not found');
      if (variant.stock - variant.reserved > 0)
        throw ApiError.conflict('This item is in stock — you can buy it now');
      const active = await StockAlert.countDocuments({ user: userId, status: 'ACTIVE' });
      if (active >= MAX_ACTIVE_ALERTS)
        throw ApiError.unprocessable('You have too many active stock alerts');
      await StockAlert.updateOne(
        { user: userId, variant: variantId },
        { $set: { status: 'ACTIVE', product: variant.product, notifiedAt: null } },
        { upsert: true },
      );
      return { subscribed: true };
    },

    async unsubscribe(userId: string, variantId: string): Promise<void> {
      await StockAlert.updateOne(
        { user: userId, variant: variantId },
        { $set: { status: 'CANCELLED' } },
      );
    },

    async alertStatus(userId: string, variantIds: string[]): Promise<string[]> {
      const alerts = await StockAlert.find({
        user: userId,
        variant: { $in: variantIds },
        status: 'ACTIVE',
      })
        .select('variant')
        .lean();
      return alerts.map((a) => a.variant.toString());
    },

    async myAlerts(userId: string): Promise<StockAlertView[]> {
      const alerts = await StockAlert.find({
        user: userId,
        status: { $in: ['ACTIVE', 'NOTIFIED'] },
      })
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean();
      const [variants, products] = await Promise.all([
        ProductVariant.find({ _id: { $in: alerts.map((a) => a.variant) } })
          .select('options stock reserved isActive images')
          .lean(),
        Product.find({ _id: { $in: alerts.map((a) => a.product) } })
          .select('name slug images status')
          .lean(),
      ]);
      return alerts.flatMap((a) => {
        const v = variants.find((x) => x._id.equals(a.variant));
        const p = products.find((x) => x._id.equals(a.product));
        if (!v || !p) return [];
        const options: Record<string, string> = {};
        for (const [k, val] of Object.entries(
          (v.options as Record<string, unknown> | undefined) ?? {},
        ))
          if (typeof val === 'string' && val) options[k] = val;
        return [
          {
            id: a._id.toString(),
            variantId: a.variant.toString(),
            status: a.status,
            product: {
              id: p._id.toString(),
              name: p.name,
              slug: p.slug,
              image: v.images[0]?.url ?? p.images[0]?.url ?? null,
            },
            options,
            inStock: p.status === 'ACTIVE' && v.isActive && v.stock - v.reserved > 0,
            createdAt: a.createdAt.toISOString(),
          },
        ];
      });
    },

    // ── Reports ───────────────────────────────────────────────────────────────
    async report(userId: string, input: ReportInput): Promise<void> {
      const exists =
        input.targetType === 'PRODUCT'
          ? await Product.exists({ _id: input.targetId })
          : input.targetType === 'REVIEW'
            ? await Review.exists({ _id: input.targetId })
            : await Seller.exists({ _id: input.targetId });
      if (!exists) throw ApiError.notFound('Nothing to report');
      try {
        await Report.create({
          reporter: userId,
          targetType: input.targetType,
          target: input.targetId,
          reason: input.reason,
          details: input.details,
        });
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          throw ApiError.conflict('You have already reported this');
        throw error;
      }
      if (input.targetType === 'REVIEW') {
        await Review.updateOne({ _id: input.targetId }, { $inc: { reportCount: 1 } });
        // Three independent reports hide a review until a moderator looks at it.
        await Review.updateOne(
          { _id: input.targetId, status: 'PUBLISHED', reportCount: { $gte: 3 } },
          { $set: { status: 'FLAGGED' } },
        );
      }
    },

    // ── Recommendations ───────────────────────────────────────────────────────
    /** "Frequently bought together": co-purchased in the same orders, most common first. */
    async boughtTogether(slug: string): Promise<ProductCard[]> {
      return deps.cache.wrap(`reco:together:${slug}`, 3600, async () => {
        const product = await Product.findOne({ slug, status: 'ACTIVE' }).select('_id').lean();
        if (!product) return [];
        const orders = await OrderItem.find({ product: product._id, status: { $ne: 'CANCELLED' } })
          .sort({ createdAt: -1 })
          .limit(500)
          .distinct('order');
        const counts = await OrderItem.aggregate<{ _id: Types.ObjectId; n: number }>([
          {
            $match: {
              order: { $in: orders },
              product: { $ne: product._id },
              status: { $ne: 'CANCELLED' },
            },
          },
          { $group: { _id: '$product', n: { $sum: 1 } } },
          { $sort: { n: -1 } },
          { $limit: 8 },
        ]);
        const docs = await Product.find({
          _id: { $in: counts.map((c) => c._id) },
          status: 'ACTIVE',
        })
          .select(PRODUCT_CARD_PROJECTION)
          .lean<ProductCardSource[]>();
        return counts.flatMap((c) => {
          const d = docs.find((x) => x._id.equals(c._id));
          return d ? [toProductCard(d)] : [];
        });
      });
    },

    /**
     * "Recommended for you": popular, well-rated products from the categories of what the
     * shopper viewed recently (slugs from the browser), excluding those products.
     */
    async recommended(slugs: string[]): Promise<ProductCard[]> {
      const seen = await Product.find({ slug: { $in: slugs } })
        .select('_id category')
        .lean();
      const categories = [...new Set(seen.map((s) => s.category.toString()))].slice(0, 6);
      const key = `reco:for:${[...categories].sort().join(',') || 'popular'}`;
      const pool = await deps.cache.wrap(key, 600, async () => {
        const filter: Record<string, unknown> = { status: 'ACTIVE', inStock: true };
        if (categories.length > 0) filter.categoryPath = { $in: categories.map(oid) };
        const docs = await Product.find(filter)
          .sort({ soldCount: -1, ratingAvg: -1 })
          .limit(30)
          .select(PRODUCT_CARD_PROJECTION)
          .lean<ProductCardSource[]>();
        return docs.map(toProductCard);
      });
      const exclude = new Set(seen.map((s) => s._id.toString()));
      return pool.filter((p) => !exclude.has(p.id)).slice(0, 12);
    },
  };
}

export type EngagementService = ReturnType<typeof createEngagementService>;
