import {
  adminOrderListQuerySchema,
  adminProductListQuerySchema,
  adminRefundSchema,
  adminReportListQuerySchema,
  adminReviewListQuerySchema,
  adminSellerListQuerySchema,
  adminUserListQuerySchema,
  analyticsRangeSchema,
  applicationDecisionSchema,
  applicationListQuerySchema,
  auditListQuerySchema,
  cancelInputSchema,
  couponInputSchema,
  couponUpdateSchema,
  offerInputSchema,
  offerUpdateSchema,
  paymentListQuerySchema,
  platformSettingsSchema,
  productModerationSchema,
  promotionListQuerySchema,
  refundListQuerySchema,
  reportResolutionSchema,
  returnDecisionSchema,
  returnListQuerySchema,
  reviewModerationSchema,
  sellerOrderStatusUpdateSchema,
  sellerStatusUpdateSchema,
  userStatusUpdateSchema,
  type AdminOrderListQuery,
  type AdminProductListQuery,
  type AdminRefundInput,
  type AdminReportListQuery,
  type AdminReviewListQuery,
  type AdminSellerListQuery,
  type AdminUserListQuery,
  type ApplicationDecisionInput,
  type ApplicationListQuery,
  type AuditListQuery,
  type CancelInput,
  type CouponInput,
  type CouponUpdateInput,
  type OfferInput,
  type OfferUpdateInput,
  type PlatformSettingsInput,
  type ProductModerationInput,
  type PromotionListQuery,
  type ReportResolutionInput,
  type ReturnDecisionInput,
  type ReturnListQuery,
  type ReviewModerationInput,
  type SellerOrderStatusUpdate,
  type SellerStatusUpdate,
  type UserStatusUpdate,
  brandInputSchema,
  brandUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  idParamSchema,
  type BrandInput,
  type BrandUpdateInput,
  type CategoryInput,
  type CategoryUpdateInput,
} from '@zyventa/shared';
import { Router } from 'express';
import { requireRoles, type AuthMiddleware } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import type { BrandService } from '../brands/brand.service.js';
import type { CategoryService } from '../categories/category.service.js';
import type { CheckoutService } from '../checkout/checkout.service.js';
import type { PromotionService } from '../coupons/promotion.service.js';
import type { FulfilmentService } from '../orders/fulfilment.service.js';
import { loadOrderDetail } from '../orders/order-query.js';
import { Order } from '../orders/order.model.js';
import { cancelPaidShipment } from '../orders/order.service.js';
import { SellerOrder } from '../orders/seller-order.model.js';
import type { RefundService } from '../payments/refund.service.js';
import type { SellerApplicationService } from '../sellers/seller-application.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { AdminService } from './admin.service.js';

/**
 * /api/v1/admin — ADMIN role required for every route (checked server-side on each request).
 * Phase 5 adds catalogue management; users, sellers, orders etc. follow in Phase 9.
 */
export function createAdminRouter(deps: {
  auth: AuthMiddleware;
  categories: CategoryService;
  brands: BrandService;
  admin: AdminService;
  applications: SellerApplicationService;
  fulfilment: FulfilmentService;
  promotions: PromotionService;
  refunds: RefundService;
  checkout: CheckoutService;
  settings: SettingsService;
}): Router {
  const { categories, brands, admin, applications, fulfilment, promotions, refunds, settings } =
    deps;
  const platform = { kind: 'PLATFORM' as const };
  const adminScope = { role: 'ADMIN' as const };
  const idOf = (req: { validated: { params?: unknown } }) =>
    (req.validated.params as { id: string }).id;
  const router = Router();
  router.use(deps.auth.required, requireRoles('ADMIN'));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ── Categories ────────────────────────────────────────────────────────────
  router.get('/categories', async (_req, res) => {
    const list = await categories.listAll();
    sendSuccess(res, {
      data: list.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        slug: c.slug,
        parentId: c.parent ? c.parent.toString() : null,
        level: c.level,
        isActive: c.isActive,
        isFeatured: c.isFeatured,
        sortOrder: c.sortOrder,
        gstRateBps: c.gstRateBps,
        productCount: c.productCount,
      })),
    });
  });

  router.post('/categories', validate({ body: categoryInputSchema }), async (req, res) => {
    const c = await categories.create(req, req.validated.body as CategoryInput);
    sendSuccess(res, {
      statusCode: 201,
      message: 'Category created',
      data: { id: c._id.toString(), slug: c.slug },
    });
  });

  router.patch(
    '/categories/:id',
    validate({ params: idParamSchema, body: categoryUpdateSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const c = await categories.update(req, id, req.validated.body as CategoryUpdateInput);
      sendSuccess(res, {
        message: 'Category updated',
        data: { id: c._id.toString(), slug: c.slug },
      });
    },
  );

  router.delete('/categories/:id', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    await categories.remove(req, id);
    sendSuccess(res, { message: 'Category deleted', data: null });
  });

  // ── Brands ────────────────────────────────────────────────────────────────
  router.post('/brands', validate({ body: brandInputSchema }), async (req, res) => {
    sendSuccess(res, {
      statusCode: 201,
      message: 'Brand created',
      data: await brands.create(req, req.validated.body as BrandInput),
    });
  });

  router.patch(
    '/brands/:id',
    validate({ params: idParamSchema, body: brandUpdateSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      sendSuccess(res, {
        message: 'Brand updated',
        data: await brands.update(req, id, req.validated.body as BrandUpdateInput),
      });
    },
  );

  router.delete('/brands/:id', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    await brands.remove(req, id);
    sendSuccess(res, { message: 'Brand deleted', data: null });
  });

  // ── Dashboard ────────────────────────────────────────────────────────────
  router.get('/dashboard', validate({ query: analyticsRangeSchema }), async (req, res) => {
    const { days } = req.validated.query as { days: number };
    sendSuccess(res, { data: await admin.dashboard(days) });
  });

  // ── Users ────────────────────────────────────────────────────────────────
  router.get('/users', validate({ query: adminUserListQuerySchema }), async (req, res) => {
    const r = await admin.users(req.validated.query as AdminUserListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.patch(
    '/users/:id/status',
    validate({ params: idParamSchema, body: userStatusUpdateSchema }),
    async (req, res) => {
      await admin.setUserStatus(req, idOf(req), req.validated.body as UserStatusUpdate);
      sendSuccess(res, { message: 'User updated', data: null });
    },
  );

  // ── Sellers & applications ───────────────────────────────────────────────
  router.get(
    '/seller-applications',
    validate({ query: applicationListQuerySchema }),
    async (req, res) => {
      const r = await applications.list(req.validated.query as ApplicationListQuery);
      sendSuccess(res, { data: r.items, pagination: r.pagination });
    },
  );
  router.post(
    '/seller-applications/:id/decision',
    validate({ params: idParamSchema, body: applicationDecisionSchema }),
    async (req, res) => {
      const data = await applications.decide(
        req,
        idOf(req),
        req.validated.body as ApplicationDecisionInput,
      );
      sendSuccess(res, { message: 'Decision recorded', data });
    },
  );
  router.get('/sellers', validate({ query: adminSellerListQuerySchema }), async (req, res) => {
    const r = await admin.sellers(req.validated.query as AdminSellerListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.patch(
    '/sellers/:id/status',
    validate({ params: idParamSchema, body: sellerStatusUpdateSchema }),
    async (req, res) => {
      await admin.setSellerStatus(req, idOf(req), req.validated.body as SellerStatusUpdate);
      sendSuccess(res, { message: 'Seller updated', data: null });
    },
  );

  // ── Products ─────────────────────────────────────────────────────────────
  router.get('/products', validate({ query: adminProductListQuerySchema }), async (req, res) => {
    const r = await admin.products(req.validated.query as AdminProductListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.post(
    '/products/:id/moderation',
    validate({ params: idParamSchema, body: productModerationSchema }),
    async (req, res) => {
      await admin.moderateProduct(req, idOf(req), req.validated.body as ProductModerationInput);
      sendSuccess(res, { message: 'Product updated', data: null });
    },
  );

  // ── Orders, shipments, returns ───────────────────────────────────────────
  router.get('/orders', validate({ query: adminOrderListQuerySchema }), async (req, res) => {
    const r = await admin.orders(req.validated.query as AdminOrderListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.get('/orders/:id', validate({ params: idParamSchema }), async (req, res) => {
    sendSuccess(res, {
      data: await loadOrderDetail(
        { _id: new mongoose.Types.ObjectId(idOf(req)) },
        { withCustomer: true },
      ),
    });
  });
  router.post(
    '/orders/:id/cancel',
    validate({ params: idParamSchema, body: cancelInputSchema }),
    async (req, res) => {
      const id = idOf(req);
      const { reason } = req.validated.body as CancelInput;
      const order = await Order.findById(id).select('status').lean();
      if (!order) throw ApiError.notFound('Order not found');
      if (order.status === 'PENDING_PAYMENT') {
        await deps.checkout.releaseOrder(
          order._id,
          'CANCELLED',
          { role: 'ADMIN', userId: req.auth?.userId ?? null },
          reason,
        );
      } else {
        const shipments = await SellerOrder.find({
          order: order._id,
          status: { $in: ['CONFIRMED', 'PROCESSING', 'PACKED'] },
        })
          .select('_id')
          .lean();
        if (shipments.length === 0) throw ApiError.conflict('Nothing left to cancel on this order');
        for (const s of shipments) {
          await cancelPaidShipment({
            sellerOrderId: s._id,
            actor: { role: 'ADMIN', userId: req.auth?.userId ?? null },
            reason,
            refunds,
            req,
          });
        }
      }
      sendSuccess(res, {
        message: 'Order cancelled',
        data: await loadOrderDetail({ _id: order._id }, { withCustomer: true }),
      });
    },
  );
  router.post(
    '/orders/:id/refund',
    validate({ params: idParamSchema, body: adminRefundSchema }),
    async (req, res) => {
      const id = idOf(req);
      const input = req.validated.body as AdminRefundInput;
      const order = await Order.findById(id).select('_id').lean();
      if (!order) throw ApiError.notFound('Order not found');
      await refunds.refund({
        orderId: order._id,
        amount: input.amount,
        reason: 'ADMIN_GOODWILL',
        note: input.note,
        actor: { role: 'ADMIN', userId: req.auth?.userId ?? null },
      });
      sendSuccess(res, {
        message: 'Refund started',
        data: await loadOrderDetail({ _id: order._id }, { withCustomer: true }),
      });
    },
  );
  router.patch(
    '/shipments/:id/status',
    validate({ params: idParamSchema, body: sellerOrderStatusUpdateSchema }),
    async (req, res) => {
      const data = await fulfilment.updateStatus(
        req,
        adminScope,
        idOf(req),
        req.validated.body as SellerOrderStatusUpdate,
      );
      sendSuccess(res, { message: 'Shipment updated', data });
    },
  );
  router.get('/returns', validate({ query: returnListQuerySchema }), async (req, res) => {
    const r = await fulfilment.listReturns(adminScope, req.validated.query as ReturnListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.patch(
    '/returns/:id',
    validate({ params: idParamSchema, body: returnDecisionSchema }),
    async (req, res) => {
      const data = await fulfilment.decideReturn(
        req,
        adminScope,
        idOf(req),
        req.validated.body as ReturnDecisionInput,
      );
      sendSuccess(res, { message: 'Return updated', data });
    },
  );

  // ── Payments & refunds ───────────────────────────────────────────────────
  router.get('/payments', validate({ query: paymentListQuerySchema }), async (req, res) => {
    const r = await admin.payments(
      req.validated.query as { status?: string; page: number; limit: number },
    );
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.get('/refunds', validate({ query: refundListQuerySchema }), async (req, res) => {
    const r = await admin.refunds(
      req.validated.query as { status?: string; page: number; limit: number },
    );
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.post('/refunds/:id/retry', validate({ params: idParamSchema }), async (req, res) => {
    await refunds.retry(idOf(req));
    sendSuccess(res, { message: 'Refund resent', data: null });
  });

  // ── Promotions ───────────────────────────────────────────────────────────
  router.get('/coupons', validate({ query: promotionListQuerySchema }), async (req, res) => {
    const r = await promotions.listCoupons(platform, req.validated.query as PromotionListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.post('/coupons', validate({ body: couponInputSchema }), async (req, res) => {
    sendSuccess(res, {
      statusCode: 201,
      message: 'Coupon created',
      data: await promotions.createCoupon(req, platform, req.validated.body as CouponInput),
    });
  });
  router.patch(
    '/coupons/:id',
    validate({ params: idParamSchema, body: couponUpdateSchema }),
    async (req, res) => {
      sendSuccess(res, {
        message: 'Coupon updated',
        data: await promotions.updateCoupon(
          req,
          platform,
          idOf(req),
          req.validated.body as CouponUpdateInput,
        ),
      });
    },
  );
  router.get('/offers', validate({ query: promotionListQuerySchema }), async (req, res) => {
    const r = await promotions.listOffers(platform, req.validated.query as PromotionListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.post('/offers', validate({ body: offerInputSchema }), async (req, res) => {
    sendSuccess(res, {
      statusCode: 201,
      message: 'Offer created',
      data: await promotions.createOffer(req, platform, req.validated.body as OfferInput),
    });
  });
  router.patch(
    '/offers/:id',
    validate({ params: idParamSchema, body: offerUpdateSchema }),
    async (req, res) => {
      sendSuccess(res, {
        message: 'Offer updated',
        data: await promotions.updateOffer(
          req,
          platform,
          idOf(req),
          req.validated.body as OfferUpdateInput,
        ),
      });
    },
  );

  // ── Moderation ───────────────────────────────────────────────────────────
  router.get('/reviews', validate({ query: adminReviewListQuerySchema }), async (req, res) => {
    const r = await admin.reviews(req.validated.query as AdminReviewListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.patch(
    '/reviews/:id',
    validate({ params: idParamSchema, body: reviewModerationSchema }),
    async (req, res) => {
      await admin.moderateReview(req, idOf(req), req.validated.body as ReviewModerationInput);
      sendSuccess(res, { message: 'Review updated', data: null });
    },
  );
  router.get('/reports', validate({ query: adminReportListQuerySchema }), async (req, res) => {
    const r = await admin.reports(req.validated.query as AdminReportListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });
  router.patch(
    '/reports/:id',
    validate({ params: idParamSchema, body: reportResolutionSchema }),
    async (req, res) => {
      await admin.resolveReport(req, idOf(req), req.validated.body as ReportResolutionInput);
      sendSuccess(res, { message: 'Report updated', data: null });
    },
  );

  // ── Settings & audit ─────────────────────────────────────────────────────
  router.get('/settings', async (_req, res) => {
    sendSuccess(res, { data: await settings.all() });
  });
  router.patch('/settings', validate({ body: platformSettingsSchema }), async (req, res) => {
    sendSuccess(res, {
      message: 'Settings saved',
      data: await settings.update(req, req.validated.body as PlatformSettingsInput),
    });
  });
  router.get('/audit-logs', validate({ query: auditListQuerySchema }), async (req, res) => {
    const r = await admin.audit(req.validated.query as AuditListQuery);
    sendSuccess(res, { data: r.items, pagination: r.pagination });
  });

  return router;
}
