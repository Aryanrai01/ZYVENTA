import {
  analyticsRangeSchema,
  couponInputSchema,
  couponUpdateSchema,
  offerInputSchema,
  offerUpdateSchema,
  payoutAccountInputSchema,
  promotionListQuerySchema,
  returnDecisionSchema,
  returnListQuerySchema,
  sellerOrderListQuerySchema,
  sellerOrderStatusUpdateSchema,
  sellerProfileUpdateSchema,
  sellerResponseSchema,
  paginationQuerySchema,
  type CouponInput,
  type CouponUpdateInput,
  type OfferInput,
  type OfferUpdateInput,
  type PayoutAccountInput,
  type PromotionListQuery,
  type ReturnDecisionInput,
  type ReturnListQuery,
  type SellerOrderListQuery,
  type SellerOrderStatusUpdate,
  type SellerProfileUpdateInput,
  createProductSchema,
  idParamSchema,
  inventoryQuerySchema,
  productVariantParamSchema,
  sellerProductListQuerySchema,
  stockUpdateSchema,
  updateProductSchema,
  variantIdParamSchema,
  variantInputSchema,
  variantUpdateSchema,
  type CreateProductInput,
  type InventoryQuery,
  type SellerProductListQuery,
  type StockUpdateInput,
  type UpdateProductInput,
  type VariantInput,
  type VariantUpdateInput,
} from '@zyventa/shared';
import { Router, type Request } from 'express';
import { requireActiveSeller, type AuthMiddleware } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import type { PromotionService } from '../coupons/promotion.service.js';
import type { FulfilmentService } from '../orders/fulfilment.service.js';
import type { InventoryService } from '../products/inventory.service.js';
import type { SellerProductService } from '../products/seller-product.service.js';
import type { ReviewService } from '../reviews/review.service.js';
import type { SellerProfileService } from './seller-profile.service.js';

/** The seller id ALWAYS comes from the authenticated principal, never from the request. */
function sellerIdOf(req: Request): string {
  const id = req.auth?.sellerId;
  if (!id) throw ApiError.forbidden('An active seller account is required');
  return id;
}

/**
 * /api/v1/seller — every route: signed in → SELLER role with ACTIVE profile → ownership
 * enforced inside the services by scoping every query to `sellerIdOf(req)`.
 */
export function createSellerRouter(deps: {
  auth: AuthMiddleware;
  products: SellerProductService;
  inventory: InventoryService;
  profile: SellerProfileService;
  fulfilment: FulfilmentService;
  promotions: PromotionService;
  reviews: ReviewService;
}): Router {
  const { products, inventory, profile, fulfilment, promotions, reviews } = deps;
  const scope = (req: Request) => ({ role: 'SELLER' as const, sellerId: sellerIdOf(req) });
  const owner = (req: Request) => ({ kind: 'SELLER' as const, sellerId: sellerIdOf(req) });
  const router = Router();
  router.use(deps.auth.required, requireActiveSeller);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/products', validate({ query: sellerProductListQuerySchema }), async (req, res) => {
    const result = await products.list(
      sellerIdOf(req),
      req.validated.query as SellerProductListQuery,
    );
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });

  router.post('/products', validate({ body: createProductSchema }), async (req, res) => {
    const product = await products.create(
      req,
      sellerIdOf(req),
      req.validated.body as CreateProductInput,
    );
    sendSuccess(res, { statusCode: 201, message: 'Product created', data: product });
  });

  router.get('/products/:id', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, { data: await products.get(sellerIdOf(req), id) });
  });

  router.patch(
    '/products/:id',
    validate({ params: idParamSchema, body: updateProductSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const product = await products.update(
        req,
        sellerIdOf(req),
        id,
        req.validated.body as UpdateProductInput,
      );
      sendSuccess(res, { message: 'Product updated', data: product });
    },
  );

  router.delete('/products/:id', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    await products.archive(req, sellerIdOf(req), id);
    sendSuccess(res, { message: 'Product removed', data: null });
  });

  router.post(
    '/products/:id/variants',
    validate({ params: idParamSchema, body: variantInputSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const product = await products.addVariant(
        req,
        sellerIdOf(req),
        id,
        req.validated.body as VariantInput,
      );
      sendSuccess(res, { statusCode: 201, message: 'Variant added', data: product });
    },
  );

  router.patch(
    '/products/:id/variants/:variantId',
    validate({ params: productVariantParamSchema, body: variantUpdateSchema }),
    async (req, res) => {
      const { id, variantId } = req.validated.params as { id: string; variantId: string };
      const product = await products.updateVariant(
        req,
        sellerIdOf(req),
        id,
        variantId,
        req.validated.body as VariantUpdateInput,
      );
      sendSuccess(res, { message: 'Variant updated', data: product });
    },
  );

  router.get('/inventory', validate({ query: inventoryQuerySchema }), async (req, res) => {
    const result = await inventory.list(sellerIdOf(req), req.validated.query as InventoryQuery);
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });

  router.patch(
    '/inventory/:variantId',
    validate({ params: variantIdParamSchema, body: stockUpdateSchema }),
    async (req, res) => {
      const { variantId } = req.validated.params as { variantId: string };
      const row = await inventory.updateStock(
        req,
        sellerIdOf(req),
        variantId,
        req.validated.body as StockUpdateInput,
      );
      sendSuccess(res, { message: 'Stock updated', data: row });
    },
  );

  // ── Profile, payouts, dashboard ─────────────────────────────────────────
  router.get('/profile', async (req, res) => {
    sendSuccess(res, { data: await profile.get(sellerIdOf(req)) });
  });
  router.patch('/profile', validate({ body: sellerProfileUpdateSchema }), async (req, res) => {
    const data = await profile.update(
      req,
      sellerIdOf(req),
      req.validated.body as SellerProfileUpdateInput,
    );
    sendSuccess(res, { message: 'Store profile updated', data });
  });
  router.put('/payout-account', validate({ body: payoutAccountInputSchema }), async (req, res) => {
    const data = await profile.setPayoutAccount(
      req,
      sellerIdOf(req),
      req.validated.body as PayoutAccountInput,
    );
    sendSuccess(res, { message: 'Bank details saved', data });
  });
  router.get('/dashboard', validate({ query: analyticsRangeSchema }), async (req, res) => {
    const { days } = req.validated.query as { days: number };
    sendSuccess(res, { data: await profile.dashboard(sellerIdOf(req), days) });
  });

  // ── Orders & returns ────────────────────────────────────────────────────
  router.get('/orders', validate({ query: sellerOrderListQuerySchema }), async (req, res) => {
    const result = await fulfilment.list(scope(req), req.validated.query as SellerOrderListQuery);
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });
  router.get('/orders/:id', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, { data: await fulfilment.detail(scope(req), id) });
  });
  router.patch(
    '/orders/:id/status',
    validate({ params: idParamSchema, body: sellerOrderStatusUpdateSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const data = await fulfilment.updateStatus(
        req,
        scope(req),
        id,
        req.validated.body as SellerOrderStatusUpdate,
      );
      sendSuccess(res, { message: 'Order updated', data });
    },
  );
  router.get('/returns', validate({ query: returnListQuerySchema }), async (req, res) => {
    const result = await fulfilment.listReturns(scope(req), req.validated.query as ReturnListQuery);
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });
  router.patch(
    '/returns/:id',
    validate({ params: idParamSchema, body: returnDecisionSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const data = await fulfilment.decideReturn(
        req,
        scope(req),
        id,
        req.validated.body as ReturnDecisionInput,
      );
      sendSuccess(res, { message: 'Return updated', data });
    },
  );

  // ── Promotions (seller-funded, scoped to own catalogue) ─────────────────
  router.get('/coupons', validate({ query: promotionListQuerySchema }), async (req, res) => {
    const result = await promotions.listCoupons(
      owner(req),
      req.validated.query as PromotionListQuery,
    );
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });
  router.post('/coupons', validate({ body: couponInputSchema }), async (req, res) => {
    const data = await promotions.createCoupon(req, owner(req), req.validated.body as CouponInput);
    sendSuccess(res, { statusCode: 201, message: 'Coupon created', data });
  });
  router.patch(
    '/coupons/:id',
    validate({ params: idParamSchema, body: couponUpdateSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const data = await promotions.updateCoupon(
        req,
        owner(req),
        id,
        req.validated.body as CouponUpdateInput,
      );
      sendSuccess(res, { message: 'Coupon updated', data });
    },
  );
  router.get('/offers', validate({ query: promotionListQuerySchema }), async (req, res) => {
    const result = await promotions.listOffers(
      owner(req),
      req.validated.query as PromotionListQuery,
    );
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });
  router.post('/offers', validate({ body: offerInputSchema }), async (req, res) => {
    const data = await promotions.createOffer(req, owner(req), req.validated.body as OfferInput);
    sendSuccess(res, { statusCode: 201, message: 'Offer created', data });
  });
  router.patch(
    '/offers/:id',
    validate({ params: idParamSchema, body: offerUpdateSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const data = await promotions.updateOffer(
        req,
        owner(req),
        id,
        req.validated.body as OfferUpdateInput,
      );
      sendSuccess(res, { message: 'Offer updated', data });
    },
  );

  // ── Reviews ─────────────────────────────────────────────────────────────
  router.get('/reviews', validate({ query: paginationQuerySchema.strict() }), async (req, res) => {
    const { page, limit } = req.validated.query as { page: number; limit: number };
    const result = await reviews.sellerReviews(sellerIdOf(req), page, limit);
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });
  router.put(
    '/reviews/:id/response',
    validate({ params: idParamSchema, body: sellerResponseSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const { body } = req.validated.body as { body: string };
      sendSuccess(res, {
        message: 'Response published',
        data: await reviews.respond(sellerIdOf(req), id, body),
      });
    },
  );

  return router;
}
