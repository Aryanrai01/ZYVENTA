import {
  buildPaginationMeta,
  type AdminDashboard,
  type AdminOrderListQuery,
  type AdminProductListQuery,
  type AdminProductRow,
  type AdminReportListQuery,
  type AdminReviewListQuery,
  type AdminReviewRow,
  type AdminSellerListQuery,
  type AdminSellerRow,
  type AdminUserListQuery,
  type AdminUserRow,
  type AuditListQuery,
  type AuditRow,
  type ProductModerationInput,
  type ReportResolutionInput,
  type ReviewModerationInput,
  type SellerStatusUpdate,
  type UserStatusUpdate,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/cache.js';
import { AuditLog } from '../audit/audit-log.model.js';
import { recordAudit } from '../audit/audit.service.js';
import type { PrincipalStore } from '../auth/principal.js';
import type { SessionService } from '../auth/session.service.js';
import { notify } from '../notifications/notification.service.js';
import { OrderItem } from '../orders/order-item.model.js';
import { Order } from '../orders/order.model.js';
import { Payment } from '../payments/payment.model.js';
import { Refund } from '../payments/refund.model.js';
import { Product } from '../products/product.model.js';
import { Report } from '../reports/report.model.js';
import { Review, type ReviewAttrs } from '../reviews/review.model.js';
import { refreshRatings, reviewsWithAuthors } from '../reviews/review.service.js';
import { SellerApplication } from '../sellers/seller-application.model.js';
import { Seller } from '../sellers/seller.model.js';
import { User } from '../users/user.model.js';

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const TZ = 'Asia/Kolkata';
const PAID = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
const SUSPENSION_REASON = 'SELLER_SUSPENDED';

export function createAdminService(deps: {
  principals: PrincipalStore;
  sessions: SessionService;
  onProductChanged: (slug: string) => Promise<void>;
}) {
  const page = (q: { page: number; limit: number }) => ({
    skip: (q.page - 1) * q.limit,
    limit: q.limit,
  });

  async function suspendSellerCatalogue(sellerId: Types.ObjectId, suspend: boolean) {
    // Listings of a suspended seller are hidden, and restored exactly when reactivated.
    const products = suspend
      ? await Product.find({ seller: sellerId, status: 'ACTIVE' }).select('slug').lean()
      : await Product.find({
          seller: sellerId,
          status: 'INACTIVE',
          statusReason: SUSPENSION_REASON,
        })
          .select('slug')
          .lean();
    await Product.updateMany(
      { _id: { $in: products.map((p) => p._id) } },
      suspend
        ? { $set: { status: 'INACTIVE', statusReason: SUSPENSION_REASON } }
        : { $set: { status: 'ACTIVE' }, $unset: { statusReason: 1 } },
    );
    for (const p of products) await deps.onProductChanged(p.slug);
  }

  return {
    // ── Users ─────────────────────────────────────────────────────────────────
    async users(query: AdminUserListQuery) {
      const filter: Record<string, unknown> = { deletedAt: null };
      if (query.q) {
        const re = new RegExp(escapeRegex(query.q), 'i');
        filter.$or = [{ name: re }, { email: re }, { phone: re }];
      }
      if (query.role) filter.roles = query.role;
      if (query.status) filter.status = query.status;
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ]);
      const counts = await Order.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { user: { $in: docs.map((d) => d._id) }, paymentStatus: { $in: PAID } } },
        { $group: { _id: '$user', n: { $sum: 1 } } },
      ]);
      const items: AdminUserRow[] = docs.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        roles: u.roles,
        status: u.status,
        emailVerified: Boolean(u.emailVerifiedAt),
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        orderCount: counts.find((c) => c._id.equals(u._id))?.n ?? 0,
      }));
      return { items, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    async setUserStatus(req: Request, userId: string, input: UserStatusUpdate): Promise<void> {
      if (userId === req.auth?.userId)
        throw ApiError.badRequest('You cannot change your own account status');
      const user = await User.findOne({ _id: userId, deletedAt: null }).select('roles status');
      if (!user) throw ApiError.notFound('User not found');
      if (user.roles.includes('ADMIN') && input.status === 'SUSPENDED') {
        throw ApiError.forbidden('Administrators cannot be suspended here');
      }
      user.status = input.status;
      user.suspendedReason = input.status === 'SUSPENDED' ? input.reason : undefined;
      await user.save();
      if (input.status === 'SUSPENDED') await deps.sessions.endAllForUser(userId, 'SUSPENDED');
      await recordAudit(req, {
        action: `user.${input.status === 'SUSPENDED' ? 'suspended' : 'reactivated'}`,
        resource: 'USER',
        resourceId: userId,
        metadata: { reason: input.reason },
        actorRole: 'ADMIN',
      });
    },

    // ── Sellers ───────────────────────────────────────────────────────────────
    async sellers(query: AdminSellerListQuery) {
      const filter: Record<string, unknown> = {};
      if (query.status) filter.status = query.status;
      if (query.q) {
        const re = new RegExp(escapeRegex(query.q), 'i');
        filter.$or = [{ storeName: re }, { legalName: re }, { gstin: re }];
      }
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        Seller.countDocuments(filter),
        Seller.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ]);
      const [owners, counts] = await Promise.all([
        User.find({ _id: { $in: docs.map((d) => d.user) } })
          .select('name email')
          .lean(),
        Product.aggregate<{ _id: Types.ObjectId; n: number }>([
          { $match: { seller: { $in: docs.map((d) => d._id) }, status: { $ne: 'ARCHIVED' } } },
          { $group: { _id: '$seller', n: { $sum: 1 } } },
        ]),
      ]);
      const items: AdminSellerRow[] = docs.map((s) => {
        const owner = owners.find((o) => o._id.equals(s.user));
        return {
          id: s._id.toString(),
          storeName: s.storeName,
          slug: s.slug,
          legalName: s.legalName,
          gstin: s.gstin ?? null,
          status: s.status,
          statusReason: s.statusReason ?? null,
          commissionBps: s.commissionBps,
          owner: { id: s.user.toString(), name: owner?.name ?? '', email: owner?.email ?? '' },
          productCount: counts.find((c) => c._id.equals(s._id))?.n ?? 0,
          createdAt: s.createdAt.toISOString(),
        };
      });
      return { items, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    async setSellerStatus(
      req: Request,
      sellerId: string,
      input: SellerStatusUpdate,
    ): Promise<void> {
      const seller = await Seller.findById(sellerId);
      if (!seller) throw ApiError.notFound('Seller not found');
      const wasActive = seller.status === 'ACTIVE';
      seller.status = input.status;
      seller.statusReason = input.status === 'ACTIVE' ? undefined : input.reason;
      if (input.commissionBps !== undefined) seller.commissionBps = input.commissionBps;
      await seller.save();
      if (wasActive && input.status !== 'ACTIVE') await suspendSellerCatalogue(seller._id, true);
      if (!wasActive && input.status === 'ACTIVE') await suspendSellerCatalogue(seller._id, false);
      await recordAudit(req, {
        action: 'seller.status_changed',
        resource: 'SELLER',
        resourceId: sellerId,
        metadata: {
          status: input.status,
          reason: input.reason,
          commissionBps: input.commissionBps,
        },
        actorRole: 'ADMIN',
      });
      await notify({
        user: seller.user,
        type: 'SYSTEM',
        title:
          input.status === 'ACTIVE'
            ? 'Your seller account is active'
            : 'Your seller account was suspended',
        body: input.reason ?? '',
        link: '/seller',
      });
    },

    // ── Products ──────────────────────────────────────────────────────────────
    async products(query: AdminProductListQuery) {
      const filter: Record<string, unknown> = {};
      if (query.status) filter.status = query.status;
      if (query.q) filter.name = new RegExp(escapeRegex(query.q), 'i');
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        Product.countDocuments(filter),
        Product.find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .select(
            'name slug images status statusReason isFeatured priceMin seller category soldCount updatedAt',
          )
          .populate<{ category: { name: string } | null }>('category', 'name')
          .lean(),
      ]);
      const sellers = await Seller.find({ _id: { $in: docs.map((d) => d.seller) } })
        .select('storeName')
        .lean();
      const items: AdminProductRow[] = docs.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        slug: p.slug,
        image: p.images[0]?.url ?? null,
        status: p.status,
        statusReason: p.statusReason ?? null,
        isFeatured: p.isFeatured,
        priceMin: p.priceMin,
        seller: {
          id: p.seller.toString(),
          storeName: sellers.find((s) => s._id.equals(p.seller))?.storeName ?? '',
        },
        category: p.category?.name ?? '',
        soldCount: p.soldCount,
        updatedAt: p.updatedAt.toISOString(),
      }));
      return { items, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    async moderateProduct(
      req: Request,
      productId: string,
      input: ProductModerationInput,
    ): Promise<void> {
      const product = await Product.findById(productId);
      if (!product) throw ApiError.notFound('Product not found');
      switch (input.action) {
        case 'BLOCK':
          product.status = 'BLOCKED';
          product.statusReason = input.reason;
          break;
        case 'UNBLOCK':
          if (product.status !== 'BLOCKED') throw ApiError.conflict('Product is not blocked');
          product.status = 'INACTIVE';
          product.statusReason = undefined;
          break;
        case 'FEATURE':
          product.isFeatured = true;
          break;
        case 'UNFEATURE':
          product.isFeatured = false;
          break;
      }
      await product.save();
      await deps.onProductChanged(product.slug);
      await recordAudit(req, {
        action: `product.${input.action.toLowerCase()}`,
        resource: 'PRODUCT',
        resourceId: productId,
        metadata: { reason: input.reason },
        actorRole: 'ADMIN',
      });
      if (input.action === 'BLOCK' || input.action === 'UNBLOCK') {
        const seller = await Seller.findById(product.seller).select('user').lean();
        if (seller) {
          await notify({
            user: seller.user,
            type: 'SYSTEM',
            title:
              input.action === 'BLOCK'
                ? `“${product.name}” was blocked`
                : `“${product.name}” was unblocked`,
            body:
              input.action === 'BLOCK'
                ? (input.reason ?? '')
                : 'You can publish it again from Seller Center.',
            link: `/seller/products/${productId}`,
          });
        }
      }
    },

    // ── Reviews & reports ─────────────────────────────────────────────────────
    async reviews(query: AdminReviewListQuery) {
      const filter: Record<string, unknown> = {};
      if (query.status) filter.status = query.status;
      if (query.reported) filter.reportCount = { $gt: 0 };
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        Review.countDocuments(filter),
        Review.find(filter)
          .sort({ reportCount: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean<(ReviewAttrs & { _id: Types.ObjectId })[]>(),
      ]);
      const [views, products] = await Promise.all([
        reviewsWithAuthors(docs),
        Product.find({ _id: { $in: docs.map((d) => d.product) } })
          .select('name slug')
          .lean(),
      ]);
      const items: AdminReviewRow[] = views.map((v, i) => {
        const d = docs[i];
        const p = products.find((x) => d && x._id.equals(d.product));
        return {
          ...v,
          status: d?.status ?? 'PUBLISHED',
          reportCount: d?.reportCount ?? 0,
          product: { id: p?._id.toString() ?? '', name: p?.name ?? '', slug: p?.slug ?? '' },
        };
      });
      return { items, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    async moderateReview(
      req: Request,
      reviewId: string,
      input: ReviewModerationInput,
    ): Promise<void> {
      const review = await Review.findByIdAndUpdate(
        reviewId,
        {
          $set: {
            status: input.status,
            moderation: {
              actor: { role: 'ADMIN', user: req.auth?.userId },
              reason: input.reason,
              at: new Date(),
            },
          },
        },
        { returnDocument: 'after' },
      ).lean();
      if (!review) throw ApiError.notFound('Review not found');
      await refreshRatings(review.product, review.seller);
      const product = await Product.findById(review.product).select('slug').lean();
      if (product) await deps.onProductChanged(product.slug);
      await recordAudit(req, {
        action: 'review.moderated',
        resource: 'REVIEW',
        resourceId: reviewId,
        metadata: input,
        actorRole: 'ADMIN',
      });
    },

    async reports(query: AdminReportListQuery) {
      const filter: Record<string, unknown> = query.status ? { status: query.status } : {};
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        Report.countDocuments(filter),
        Report.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      ]);
      const reporters = await User.find({ _id: { $in: docs.map((d) => d.reporter) } })
        .select('name email')
        .lean();
      const targets = await Promise.all(
        docs.map(async (d) => {
          if (d.targetType === 'PRODUCT') {
            const p = await Product.findById(d.target).select('name slug').lean();
            return p ? { label: p.name, link: `/products/${p.slug}` } : null;
          }
          if (d.targetType === 'SELLER') {
            const s = await Seller.findById(d.target).select('storeName').lean();
            return s ? { label: s.storeName, link: null } : null;
          }
          const r = await Review.findById(d.target).select('title body').lean();
          return r ? { label: r.title || r.body.slice(0, 80), link: null } : null;
        }),
      );
      return {
        items: docs.map((d, i) => ({
          id: d._id.toString(),
          targetType: d.targetType,
          targetId: d.target.toString(),
          target: targets[i] ?? { label: '(deleted)', link: null },
          reason: d.reason,
          details: d.details,
          status: d.status,
          reporter: reporters.find((u) => u._id.equals(d.reporter))?.email ?? '',
          createdAt: d.createdAt.toISOString(),
          resolution: d.resolution?.action
            ? { action: d.resolution.action, note: d.resolution.note ?? '' }
            : null,
        })),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    async resolveReport(
      req: Request,
      reportId: string,
      input: ReportResolutionInput,
    ): Promise<void> {
      const report = await Report.findById(reportId);
      if (!report) throw ApiError.notFound('Report not found');
      report.status = input.status;
      report.resolution = {
        by: oid(req.auth?.userId ?? ''),
        at: new Date(),
        action: input.action,
        note: input.note,
      };
      await report.save();
      if (input.status === 'RESOLVED') {
        if (input.action === 'PRODUCT_BLOCKED' && report.targetType === 'PRODUCT') {
          await this.moderateProduct(req, report.target.toString(), {
            action: 'BLOCK',
            reason: input.note || 'Reported content',
          });
        }
        if (input.action === 'CONTENT_REMOVED' && report.targetType === 'REVIEW') {
          await this.moderateReview(req, report.target.toString(), {
            status: 'REMOVED',
            reason: input.note,
          });
        }
        if (input.action === 'SELLER_SUSPENDED' && report.targetType === 'SELLER') {
          await this.setSellerStatus(req, report.target.toString(), {
            status: 'SUSPENDED',
            reason: input.note || 'Policy violation',
          });
        }
      }
      await recordAudit(req, {
        action: 'report.resolved',
        resource: 'REPORT',
        resourceId: reportId,
        metadata: input,
        actorRole: 'ADMIN',
      });
    },

    // ── Orders, payments, refunds ─────────────────────────────────────────────
    async orders(query: AdminOrderListQuery) {
      const filter: Record<string, unknown> = {};
      if (query.status) filter.status = query.status;
      if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
      if (query.q) {
        const q = query.q.trim();
        if (/^ZV/i.test(q)) filter.orderNumber = new RegExp(`^${escapeRegex(q.toUpperCase())}`);
        else filter['contact.email'] = new RegExp(`^${escapeRegex(q.toLowerCase())}`);
      }
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        Order.countDocuments(filter),
        Order.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select(
            'orderNumber status paymentStatus pricing itemCount createdAt contact shippingAddress.fullName',
          )
          .lean(),
      ]);
      return {
        items: docs.map((o) => ({
          id: o._id.toString(),
          orderNumber: o.orderNumber,
          status: o.status,
          paymentStatus: o.paymentStatus,
          total: o.pricing.total,
          itemCount: o.itemCount,
          customer: o.shippingAddress.fullName,
          email: o.contact?.email ?? '',
          createdAt: o.createdAt.toISOString(),
        })),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    async payments(query: { status?: string | undefined; page: number; limit: number }) {
      const filter: Record<string, unknown> = query.status ? { status: query.status } : {};
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        Payment.countDocuments(filter),
        Payment.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate<{ order: { orderNumber: string } | null }>('order', 'orderNumber')
          .lean(),
      ]);
      return {
        items: docs.map((p) => ({
          id: p._id.toString(),
          orderId: p.order ? (p.order as unknown as { _id: Types.ObjectId })._id.toString() : '',
          orderNumber: p.order?.orderNumber ?? '',
          razorpayOrderId: p.razorpayOrderId,
          razorpayPaymentId: p.razorpayPaymentId ?? null,
          amount: p.amount,
          amountRefunded: p.amountRefunded,
          status: p.status,
          method: p.method ?? null,
          verifiedVia: p.verifiedVia ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    async refunds(query: { status?: string | undefined; page: number; limit: number }) {
      const filter: Record<string, unknown> = query.status ? { status: query.status } : {};
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        Refund.countDocuments(filter),
        Refund.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate<{ order: { orderNumber: string } | null }>('order', 'orderNumber')
          .lean(),
      ]);
      return {
        items: docs.map((r) => ({
          id: r._id.toString(),
          orderId: r.order ? (r.order as unknown as { _id: Types.ObjectId })._id.toString() : '',
          orderNumber: r.order?.orderNumber ?? '',
          amount: r.amount,
          reason: r.reason,
          status: r.status,
          failureReason: r.failureReason ?? null,
          razorpayRefundId: r.razorpayRefundId ?? null,
          createdAt: r.createdAt.toISOString(),
          processedAt: r.processedAt ? r.processedAt.toISOString() : null,
        })),
        pagination: buildPaginationMeta(query.page, query.limit, total),
      };
    },

    // ── Audit ─────────────────────────────────────────────────────────────────
    async audit(query: AuditListQuery) {
      const filter: Record<string, unknown> = {};
      if (query.resource) filter.resource = query.resource;
      if (query.action) filter.action = new RegExp(`^${escapeRegex(query.action)}`);
      const { skip, limit } = page(query);
      const [total, docs] = await Promise.all([
        AuditLog.countDocuments(filter),
        AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ]);
      const actors = await User.find({
        _id: { $in: docs.flatMap((d) => (d.actor ? [d.actor] : [])) },
      })
        .select('name email')
        .lean();
      const items: AuditRow[] = docs.map((d) => {
        const a = d.actor ? actors.find((u) => u._id.equals(d.actor as Types.ObjectId)) : undefined;
        return {
          id: d._id.toString(),
          action: d.action,
          resource: d.resource,
          resourceId: d.resourceId,
          actor: a ? { id: a._id.toString(), name: a.name, email: a.email } : null,
          actorRole: d.actorRole,
          metadata: (d.metadata ?? {}) as Record<string, unknown>,
          ip: d.ip ?? null,
          createdAt: d.createdAt.toISOString(),
        };
      });
      return { items, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    // ── Dashboard ─────────────────────────────────────────────────────────────
    async dashboard(days: number): Promise<AdminDashboard> {
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const paid = { paymentStatus: { $in: PAID }, placedAt: { $gte: from, $lte: to } };
      const [
        totals,
        series,
        refunds,
        newUsers,
        totalUsers,
        activeSellers,
        pendingApplications,
        openReports,
        flaggedReviews,
        activeProducts,
        topCategories,
        topSellers,
      ] = await Promise.all([
        Order.aggregate<{ gmv: number; orders: number }>([
          { $match: paid },
          { $group: { _id: null, gmv: { $sum: '$pricing.total' }, orders: { $sum: 1 } } },
        ]),
        Order.aggregate<{ _id: string; revenue: number; orders: number }>([
          { $match: paid },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt', timezone: TZ } },
              revenue: { $sum: '$pricing.total' },
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Refund.aggregate<{ amount: number }>([
          { $match: { status: 'PROCESSED', processedAt: { $gte: from } } },
          { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
        User.countDocuments({ createdAt: { $gte: from } }),
        User.countDocuments({ deletedAt: null }),
        Seller.countDocuments({ status: 'ACTIVE' }),
        SellerApplication.countDocuments({ status: 'PENDING' }),
        Report.countDocuments({ status: { $in: ['OPEN', 'UNDER_REVIEW'] } }),
        Review.countDocuments({ status: 'FLAGGED' }),
        Product.countDocuments({ status: 'ACTIVE' }),
        OrderItem.aggregate<{ _id: Types.ObjectId; name: string; revenue: number; units: number }>([
          { $match: { createdAt: { $gte: from }, status: { $ne: 'CANCELLED' } } },
          {
            $lookup: {
              from: 'orders',
              localField: 'order',
              foreignField: '_id',
              as: 'o',
              pipeline: [{ $project: { paymentStatus: 1 } }],
            },
          },
          { $match: { 'o.paymentStatus': { $in: PAID } } },
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'p',
              pipeline: [{ $project: { category: 1 } }],
            },
          },
          { $unwind: '$p' },
          {
            $group: {
              _id: '$p.category',
              revenue: { $sum: '$lineTotal' },
              units: { $sum: '$quantity' },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'categories',
              localField: '_id',
              foreignField: '_id',
              as: 'c',
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $project: {
              revenue: 1,
              units: 1,
              name: { $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, 'Unknown'] },
            },
          },
        ]),
        mongoose.connection
          .collection('sellerorders')
          .aggregate<{ _id: Types.ObjectId; revenue: number; orders: number; storeName: string }>([
            { $match: { paidAt: { $gte: from }, status: { $nin: ['CANCELLED', 'REFUNDED'] } } },
            {
              $group: {
                _id: '$seller',
                revenue: { $sum: { $subtract: ['$pricing.subtotal', '$pricing.couponDiscount'] } },
                orders: { $sum: 1 },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: 'sellers',
                localField: '_id',
                foreignField: '_id',
                as: 's',
                pipeline: [{ $project: { storeName: 1 } }],
              },
            },
            {
              $project: {
                revenue: 1,
                orders: 1,
                storeName: { $ifNull: [{ $arrayElemAt: ['$s.storeName', 0] }, ''] },
              },
            },
          ])
          .toArray(),
      ]);
      const map = new Map(series.map((s) => [s._id, s]));
      const points = [];
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
        points.push({
          date: key,
          orders: map.get(key)?.orders ?? 0,
          revenue: map.get(key)?.revenue ?? 0,
        });
      }
      const gmv = totals[0]?.gmv ?? 0;
      const orders = totals[0]?.orders ?? 0;
      return {
        range: { days, from: from.toISOString(), to: to.toISOString() },
        gmv,
        orders,
        averageOrderValue: orders ? Math.round(gmv / orders) : 0,
        refunds: refunds[0]?.amount ?? 0,
        newUsers,
        totalUsers,
        activeSellers,
        pendingApplications,
        openReports,
        flaggedReviews,
        activeProducts,
        series: points,
        topCategories: topCategories.map((c) => ({
          name: c.name,
          revenue: c.revenue,
          units: c.units,
        })),
        topSellers: topSellers.map((s) => ({
          id: s._id.toString(),
          storeName: s.storeName,
          revenue: s.revenue,
          orders: s.orders,
        })),
      };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
