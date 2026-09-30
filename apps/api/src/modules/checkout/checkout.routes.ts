import {
  IDEMPOTENCY_HEADER,
  cancelInputSchema,
  checkoutInputSchema,
  idParamSchema,
  orderListQuerySchema,
  returnInputSchema,
  verifyPaymentSchema,
  type CancelInput,
  type CheckoutInput,
  type OrderListQuery,
  type ReturnInput,
  type VerifyPaymentInput,
} from '@zyventa/shared';
import { ipKeyGenerator } from 'express-rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import {
  authOf,
  requireVerifiedEmail,
  type AuthMiddleware,
} from '../../middleware/authenticate.js';
import { idempotent } from '../../middleware/idempotency.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { noStore } from '../../utils/no-store.js';
import type { OrderService } from '../orders/order.service.js';
import type { CheckoutService } from './checkout.service.js';

const quoteSchema = checkoutInputSchema.partial().strict();
const shipmentParams = z
  .object({ id: idParamSchema.shape.id, sellerOrderId: idParamSchema.shape.id })
  .strict();
const returnParams = z
  .object({ id: idParamSchema.shape.id, returnId: idParamSchema.shape.id })
  .strict();

/** /api/v1/checkout — quote, place order (idempotent), verify payment. */
export function createCheckoutRouter(deps: {
  auth: AuthMiddleware;
  checkout: CheckoutService;
}): Router {
  const { checkout } = deps;
  const router = Router();
  router.use(noStore, deps.auth.required);
  const userKey = (req: { auth?: { userId: string } | undefined; ip?: string | undefined }) =>
    `user:${req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown')}`;
  const placeLimiter = createRateLimiter({
    windowMs: 10 * 60_000,
    limit: 15,
    key: userKey,
  });
  const verifyLimiter = createRateLimiter({
    windowMs: 10 * 60_000,
    limit: 30,
    key: userKey,
  });

  router.post('/quote', validate({ body: quoteSchema }), async (req, res) => {
    sendSuccess(res, {
      data: await checkout.quote(authOf(req).userId, req.validated.body as Partial<CheckoutInput>),
    });
  });

  router.post(
    '/orders',
    requireVerifiedEmail,
    placeLimiter,
    validate({ body: checkoutInputSchema }),
    idempotent('checkout.place'),
    async (req, res) => {
      const key = req.get(IDEMPOTENCY_HEADER) ?? '';
      const data = await checkout.placeOrder(
        req,
        authOf(req).userId,
        req.validated.body as CheckoutInput,
        key,
      );
      sendSuccess(res, { statusCode: 201, message: 'Order created — complete the payment', data });
    },
  );

  router.post(
    '/verify',
    verifyLimiter,
    validate({ body: verifyPaymentSchema }),
    async (req, res) => {
      const data = await checkout.verify(
        authOf(req).userId,
        req.validated.body as VerifyPaymentInput,
      );
      sendSuccess(res, { message: 'Payment confirmed', data });
    },
  );

  return router;
}

/** /api/v1/orders — the caller's own orders. */
export function createOrderRouter(deps: {
  auth: AuthMiddleware;
  orders: OrderService;
  checkout: CheckoutService;
}): Router {
  const { orders, checkout } = deps;
  const router = Router();
  router.use(noStore, deps.auth.required);

  router.get('/', validate({ query: orderListQuerySchema }), async (req, res) => {
    const result = await orders.list(authOf(req).userId, req.validated.query as OrderListQuery);
    sendSuccess(res, { data: result.items, pagination: result.pagination });
  });

  router.get('/:id', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, { data: await orders.detail(authOf(req).userId, id) });
  });

  router.post('/:id/pay', validate({ params: idParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, { data: await checkout.resumePayment(authOf(req).userId, id) });
  });

  router.post(
    '/:id/cancel',
    validate({ params: idParamSchema, body: cancelInputSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const data = await orders.cancel(
        req,
        authOf(req).userId,
        id,
        req.validated.body as CancelInput,
      );
      sendSuccess(res, { message: 'Cancellation processed', data });
    },
  );

  router.post(
    '/:id/shipments/:sellerOrderId/cancel',
    validate({ params: shipmentParams, body: cancelInputSchema }),
    async (req, res) => {
      const { id, sellerOrderId } = req.validated.params as { id: string; sellerOrderId: string };
      const data = await orders.cancelShipment(
        req,
        authOf(req).userId,
        id,
        sellerOrderId,
        req.validated.body as CancelInput,
      );
      sendSuccess(res, { message: 'Shipment cancelled', data });
    },
  );

  router.post(
    '/:id/returns',
    validate({ params: idParamSchema, body: returnInputSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const data = await orders.requestReturn(
        req,
        authOf(req).userId,
        id,
        req.validated.body as ReturnInput,
      );
      sendSuccess(res, { statusCode: 201, message: 'Return requested', data });
    },
  );

  router.post(
    '/:id/returns/:returnId/cancel',
    validate({ params: returnParams }),
    async (req, res) => {
      const { id, returnId } = req.validated.params as { id: string; returnId: string };
      sendSuccess(res, {
        message: 'Return cancelled',
        data: await orders.cancelReturn(authOf(req).userId, id, returnId),
      });
    },
  );

  return router;
}
