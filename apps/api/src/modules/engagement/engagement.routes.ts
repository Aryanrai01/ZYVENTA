import {
  notificationListQuerySchema,
  objectIdSchema,
  productCardsQuerySchema,
  reportInputSchema,
  reviewInputSchema,
  reviewListQuerySchema,
  reviewUpdateSchema,
  slugParamSchema,
  stockAlertInputSchema,
  idParamSchema,
  type NotificationListQuery,
  type ProductCardsQuery,
  type ReportInput,
  type ReviewInput,
  type ReviewListQuery,
  type ReviewUpdateInput,
  type StockAlertInput,
} from '@zyventa/shared';
import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import {
  authOf,
  requireVerifiedEmail,
  type AuthMiddleware,
} from '../../middleware/authenticate.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { publicCache } from '../../utils/http-cache.js';
import { noStore } from '../../utils/no-store.js';
import type { PromotionService } from '../coupons/promotion.service.js';
import type { ReviewService } from '../reviews/review.service.js';
import type { EngagementService } from './engagement.service.js';

const readSchema = z.object({ id: z.union([objectIdSchema, z.literal('all')]) }).strict();
const variantParam = z.object({ variantId: objectIdSchema }).strict();
const variantsQuery = z
  .object({
    variants: z
      .string()
      .max(2000)
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(objectIdSchema).min(1).max(100)),
  })
  .strict();

/**
 * Engagement endpoints: notifications, stock alerts, reviews, reports, public coupons and
 * recommendations. Mounted at /api/v1.
 */
export function createEngagementRouter(deps: {
  auth: AuthMiddleware;
  engagement: EngagementService;
  reviews: ReviewService;
  promotions: PromotionService;
}): Router {
  const { auth, engagement, reviews, promotions } = deps;
  const router = Router();
  const writeLimiter = createRateLimiter({
    windowMs: 60 * 60_000,
    limit: 60,
    key: (req) => `user:${req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown')}`,
  });

  // ── Public ────────────────────────────────────────────────────────────────
  router.get('/coupons', async (_req, res) => {
    publicCache(res, 120);
    sendSuccess(res, { data: await promotions.publicCoupons() });
  });

  router.get(
    '/products/:slug/reviews',
    auth.optional,
    validate({ params: slugParamSchema, query: reviewListQuerySchema }),
    async (req, res) => {
      const { slug } = req.validated.params as { slug: string };
      const result = await reviews.list(
        slug,
        req.validated.query as ReviewListQuery,
        req.auth?.userId,
      );
      if (req.auth) res.setHeader('Cache-Control', 'private, no-store');
      else publicCache(res, 60);
      sendSuccess(res, {
        data: { items: result.items, summary: result.summary },
        pagination: result.pagination,
      });
    },
  );

  router.get(
    '/products/:slug/bought-together',
    validate({ params: slugParamSchema }),
    async (req, res) => {
      const { slug } = req.validated.params as { slug: string };
      publicCache(res, 600);
      sendSuccess(res, { data: await engagement.boughtTogether(slug) });
    },
  );

  router.get(
    '/recommendations',
    validate({ query: productCardsQuerySchema.partial() }),
    async (req, res) => {
      const { slugs = [] } = req.validated.query as Partial<ProductCardsQuery>;
      publicCache(res, 300);
      sendSuccess(res, { data: await engagement.recommended(slugs) });
    },
  );

  // ── Signed in ─────────────────────────────────────────────────────────────
  // Auth is applied per route: this router is mounted at /api/v1 root, so a router-level
  // guard would also catch unrelated paths.
  const guard = [noStore, auth.required];

  router.get(
    '/products/:slug/reviews/eligible',
    ...guard,
    validate({ params: slugParamSchema }),
    async (req, res) => {
      const { slug } = req.validated.params as { slug: string };
      sendSuccess(res, { data: await reviews.eligible(authOf(req).userId, slug) });
    },
  );
  router.post(
    '/reviews',
    ...guard,
    requireVerifiedEmail,
    writeLimiter,
    validate({ body: reviewInputSchema }),
    async (req, res) => {
      const data = await reviews.create(authOf(req).userId, req.validated.body as ReviewInput);
      sendSuccess(res, { statusCode: 201, message: 'Thanks for your review!', data });
    },
  );
  router.patch(
    '/reviews/:id',
    ...guard,
    writeLimiter,
    validate({ params: idParamSchema, body: reviewUpdateSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      sendSuccess(res, {
        message: 'Review updated',
        data: await reviews.update(authOf(req).userId, id, req.validated.body as ReviewUpdateInput),
      });
    },
  );
  router.delete('/reviews/:id', ...guard, validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    await reviews.remove(authOf(req).userId, id);
    sendSuccess(res, { message: 'Review deleted', data: null });
  });

  router.post(
    '/reports',
    ...guard,
    writeLimiter,
    validate({ body: reportInputSchema }),
    async (req, res) => {
      await engagement.report(authOf(req).userId, req.validated.body as ReportInput);
      sendSuccess(res, {
        statusCode: 201,
        message: 'Thanks — our team will review this',
        data: null,
      });
    },
  );

  router.get(
    '/notifications',
    ...guard,
    validate({ query: notificationListQuerySchema }),
    async (req, res) => {
      const result = await engagement.notifications(
        authOf(req).userId,
        req.validated.query as NotificationListQuery,
      );
      sendSuccess(res, {
        data: { items: result.items, unread: result.unread },
        pagination: result.pagination,
      });
    },
  );
  router.get('/notifications/unread-count', ...guard, async (req, res) => {
    sendSuccess(res, { data: { unread: await engagement.unreadCount(authOf(req).userId) } });
  });
  router.post('/notifications/read', ...guard, validate({ body: readSchema }), async (req, res) => {
    const { id } = req.validated.body as { id: string };
    sendSuccess(res, { data: { unread: await engagement.markRead(authOf(req).userId, id) } });
  });

  router.get('/stock-alerts', ...guard, async (req, res) => {
    sendSuccess(res, { data: await engagement.myAlerts(authOf(req).userId) });
  });
  router.get(
    '/stock-alerts/status',
    ...guard,
    validate({ query: variantsQuery }),
    async (req, res) => {
      const { variants } = req.validated.query as { variants: string[] };
      sendSuccess(res, { data: await engagement.alertStatus(authOf(req).userId, variants) });
    },
  );
  router.post(
    '/stock-alerts',
    ...guard,
    writeLimiter,
    validate({ body: stockAlertInputSchema }),
    async (req, res) => {
      const { variantId } = req.validated.body as StockAlertInput;
      await engagement.subscribe(authOf(req).userId, variantId);
      sendSuccess(res, {
        statusCode: 201,
        message: 'We’ll let you know when it’s back',
        data: { variantId },
      });
    },
  );
  router.delete(
    '/stock-alerts/:variantId',
    ...guard,
    validate({ params: variantParam }),
    async (req, res) => {
      const { variantId } = req.validated.params as { variantId: string };
      await engagement.unsubscribe(authOf(req).userId, variantId);
      sendSuccess(res, { message: 'Alert removed', data: null });
    },
  );

  return router;
}
