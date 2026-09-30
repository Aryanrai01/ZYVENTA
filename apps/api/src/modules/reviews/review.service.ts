import {
  ERROR_CODES,
  buildPaginationMeta,
  type RatingSummary,
  type ReviewInput,
  type ReviewListQuery,
  type ReviewUpdateInput,
  type ReviewView,
  type SellerOrderStatus,
} from '@zyventa/shared';
import type { ClientSession, Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { stripHtml } from '../products/sanitize.js';
import { OrderItem } from '../orders/order-item.model.js';
import { SellerOrder } from '../orders/seller-order.model.js';
import { Product } from '../products/product.model.js';
import { Seller } from '../sellers/seller.model.js';
import { User } from '../users/user.model.js';
import { Review, type ReviewAttrs } from './review.model.js';

type ReviewLean = ReviewAttrs & { _id: Types.ObjectId };
const REVIEWABLE: SellerOrderStatus[] = [
  'DELIVERED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUND_PENDING',
  'REFUNDED',
];
const oid = (id: string) => new mongoose.Types.ObjectId(id);

/** "Aarav S." — reviewers are shown by first name and initial only. */
function displayName(name: string): string {
  const [first = 'Customer', last] = name.trim().split(/\s+/);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export function toReviewView(
  r: ReviewLean,
  authorName: string,
  variantLabel: string | null,
  viewerId?: string,
): ReviewView {
  return {
    id: r._id.toString(),
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: displayName(authorName),
    isVerifiedPurchase: r.isVerifiedPurchase,
    variantLabel,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt ? r.editedAt.toISOString() : null,
    sellerResponse:
      r.sellerResponse?.body && r.sellerResponse.at
        ? { body: r.sellerResponse.body, at: r.sellerResponse.at.toISOString() }
        : null,
    helpfulCount: r.helpfulCount,
    ...(viewerId ? { isMine: r.user.toString() === viewerId } : {}),
  };
}

/** Recomputes a product's and its seller's rating from published reviews. */
export async function refreshRatings(
  productId: Types.ObjectId,
  sellerId: Types.ObjectId,
  session?: ClientSession,
): Promise<void> {
  const [productStats] = await Review.aggregate<{ avg: number; n: number }>([
    { $match: { product: productId, status: 'PUBLISHED' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]).session(session ?? null);
  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        ratingAvg: Math.round((productStats?.avg ?? 0) * 100) / 100,
        ratingCount: productStats?.n ?? 0,
      },
    },
    session ? { session } : {},
  );
  const [sellerStats] = await Review.aggregate<{ avg: number; n: number }>([
    { $match: { seller: sellerId, status: 'PUBLISHED' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]).session(session ?? null);
  await Seller.updateOne(
    { _id: sellerId },
    {
      $set: {
        ratingAvg: Math.round((sellerStats?.avg ?? 0) * 100) / 100,
        ratingCount: sellerStats?.n ?? 0,
      },
    },
    session ? { session } : {},
  );
}

async function withAuthors(docs: ReviewLean[], viewerId?: string): Promise<ReviewView[]> {
  const [users, items] = await Promise.all([
    User.find({ _id: { $in: docs.map((d) => d.user) } })
      .select('name')
      .lean(),
    OrderItem.find({ _id: { $in: docs.map((d) => d.orderItem) } })
      .select('snapshot.options')
      .lean(),
  ]);
  const names = new Map(users.map((u) => [u._id.toString(), u.name]));
  const variants = new Map(
    items.map((i) => {
      const raw = i.snapshot.options as unknown;
      const values =
        raw instanceof Map
          ? [...(raw as Map<string, string>).values()]
          : Object.values((raw as Record<string, string> | null) ?? {});
      return [i._id.toString(), values.filter(Boolean).join(' · ') || null];
    }),
  );
  return docs.map((d) =>
    toReviewView(
      d,
      names.get(d.user.toString()) ?? 'Customer',
      variants.get(d.orderItem.toString()) ?? null,
      viewerId,
    ),
  );
}

/**
 * Verified-purchase reviews: one per purchased order line, only after delivery. Text is
 * stored as plain text (markup stripped); ratings are recomputed from PUBLISHED reviews.
 */
export function createReviewService(deps: { onProductChanged: (slug: string) => Promise<void> }) {
  async function productBySlug(slug: string) {
    const product = await Product.findOne({ slug, status: 'ACTIVE' })
      .select('_id slug seller')
      .lean();
    if (!product) throw ApiError.notFound('Product not found');
    return product;
  }

  return {
    async list(slug: string, query: ReviewListQuery, viewerId?: string) {
      const product = await productBySlug(slug);
      const filter: Record<string, unknown> = { product: product._id, status: 'PUBLISHED' };
      if (query.rating) filter.rating = query.rating;
      const sort: Record<string, 1 | -1> =
        query.sort === 'highest'
          ? { rating: -1, createdAt: -1 }
          : query.sort === 'lowest'
            ? { rating: 1, createdAt: -1 }
            : query.sort === 'helpful'
              ? { helpfulCount: -1, createdAt: -1 }
              : { createdAt: -1 };
      const [total, docs, dist] = await Promise.all([
        Review.countDocuments(filter),
        Review.find(filter)
          .sort(sort)
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean<ReviewLean[]>(),
        Review.aggregate<{ _id: number; n: number }>([
          { $match: { product: product._id, status: 'PUBLISHED' } },
          { $group: { _id: '$rating', n: { $sum: 1 } } },
        ]),
      ]);
      const counts = [5, 4, 3, 2, 1].map(
        (star) => dist.find((d) => d._id === star)?.n ?? 0,
      ) as RatingSummary['distribution'];
      const count = counts.reduce((a, b) => a + b, 0);
      const summary: RatingSummary = {
        average: count
          ? Math.round((counts.reduce((sum, n, i) => sum + n * (5 - i), 0) / count) * 10) / 10
          : 0,
        count,
        distribution: counts,
      };
      return {
        items: await withAuthors(docs, viewerId),
        summary,
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    /** Order lines of this product the user may still review. */
    async eligible(
      userId: string,
      slug: string,
    ): Promise<{ orderItemId: string; label: string }[]> {
      const product = await productBySlug(slug);
      const items = await OrderItem.find({ user: userId, product: product._id, isReviewed: false })
        .select('sellerOrder snapshot createdAt')
        .lean();
      const shipments = await SellerOrder.find({
        _id: { $in: items.map((i) => i.sellerOrder) },
        status: { $in: REVIEWABLE },
      })
        .select('_id')
        .lean();
      const ok = new Set(shipments.map((s) => s._id.toString()));
      return items
        .filter((i) => ok.has(i.sellerOrder.toString()))
        .map((i) => ({
          orderItemId: i._id.toString(),
          label: `Bought ${i.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        }));
    },

    async create(userId: string, input: ReviewInput): Promise<ReviewView> {
      const created = await mongoose.connection.transaction(async (session) => {
        const item = await OrderItem.findOne({ _id: input.orderItemId, user: userId }).session(
          session,
        );
        if (!item) throw ApiError.notFound('Purchase not found');
        const so = await SellerOrder.findById(item.sellerOrder)
          .select('status')
          .session(session)
          .lean();
        if (!so || !REVIEWABLE.includes(so.status)) {
          throw new ApiError(
            409,
            ERROR_CODES.REVIEW_NOT_ALLOWED,
            'You can review this item after it is delivered',
          );
        }
        if (item.isReviewed) throw ApiError.conflict('You have already reviewed this purchase');
        const [review] = await Review.create(
          [
            {
              product: item.product,
              variant: item.variant,
              seller: item.seller,
              user: userId,
              orderItem: item._id,
              rating: input.rating,
              title: stripHtml(input.title),
              body: stripHtml(input.body),
              isVerifiedPurchase: true,
            },
          ],
          { session },
        );
        item.isReviewed = true;
        await item.save({ session });
        await refreshRatings(item.product, item.seller, session);
        return { review, slug: item.snapshot.slug };
      });
      if (!created.review) throw new Error('Review not created');
      await deps.onProductChanged(created.slug);
      const [view] = await withAuthors([created.review.toObject()], userId);
      if (!view) throw new Error('Review not mapped');
      return view;
    },

    async update(userId: string, id: string, input: ReviewUpdateInput): Promise<ReviewView> {
      const review = await Review.findOne({
        _id: id,
        user: userId,
        status: { $in: ['PUBLISHED', 'FLAGGED'] },
      });
      if (!review) throw ApiError.notFound('Review not found');
      if (input.rating !== undefined) review.rating = input.rating;
      if (input.title !== undefined) review.title = stripHtml(input.title);
      if (input.body !== undefined) review.body = stripHtml(input.body);
      review.editedAt = new Date();
      await review.save();
      await refreshRatings(review.product, review.seller);
      const product = await Product.findById(review.product).select('slug').lean();
      if (product) await deps.onProductChanged(product.slug);
      const [view] = await withAuthors([review.toObject()], userId);
      if (!view) throw new Error('Review not mapped');
      return view;
    },

    async remove(userId: string, id: string): Promise<void> {
      const review = await Review.findOneAndDelete({ _id: id, user: userId });
      if (!review) throw ApiError.notFound('Review not found');
      await OrderItem.updateOne({ _id: review.orderItem }, { $set: { isReviewed: false } });
      await refreshRatings(review.product, review.seller);
      const product = await Product.findById(review.product).select('slug').lean();
      if (product) await deps.onProductChanged(product.slug);
    },

    /** Seller's public reply to a review of one of their products. */
    async respond(sellerId: string, id: string, body: string): Promise<ReviewView> {
      const review = await Review.findOneAndUpdate(
        { _id: id, seller: oid(sellerId) },
        { $set: { sellerResponse: { body: stripHtml(body), at: new Date() } } },
        { returnDocument: 'after' },
      ).lean<ReviewLean>();
      if (!review) throw ApiError.notFound('Review not found');
      const [view] = await withAuthors([review]);
      if (!view) throw new Error('Review not mapped');
      return view;
    },

    async sellerReviews(sellerId: string, page: number, limit: number) {
      const filter = { seller: oid(sellerId), status: 'PUBLISHED' as const };
      const [total, docs] = await Promise.all([
        Review.countDocuments(filter),
        Review.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean<ReviewLean[]>(),
      ]);
      const products = await Product.find({ _id: { $in: docs.map((d) => d.product) } })
        .select('name slug')
        .lean();
      const views = await withAuthors(docs);
      return {
        items: views.map((v, i) => {
          const p = products.find((x) => x._id.equals(docs[i]?.product));
          return {
            ...v,
            product: { id: p?._id.toString() ?? '', name: p?.name ?? '', slug: p?.slug ?? '' },
          };
        }),
        pagination: buildPaginationMeta(page, limit, total),
      };
    },
  };
}

export { withAuthors as reviewsWithAuthors };
export type ReviewService = ReturnType<typeof createReviewService>;
