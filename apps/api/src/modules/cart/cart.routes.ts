import {
  addCartItemSchema,
  cartLinesSchema,
  cartVariantParamSchema,
  updateCartItemSchema,
  type CartLineInput,
  type CartLinesInput,
  type UpdateCartItemInput,
} from '@zyventa/shared';
import { ipKeyGenerator } from 'express-rate-limit';
import { Router } from 'express';
import { authOf, type AuthMiddleware } from '../../middleware/authenticate.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { noStore } from '../../utils/no-store.js';
import type { CartService } from './cart.service.js';

/**
 * /api/v1/cart — the account cart (signed in) plus a stateless preview for guest carts.
 * Bodies carry only variant ids and quantities; responses are always server-priced.
 */
export function createCartRouter(deps: { auth: AuthMiddleware; cart: CartService }): Router {
  const { auth, cart } = deps;
  const router = Router();
  router.use(noStore);

  const writeLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 60,
    key: (req) => `user:${req.auth?.userId ?? ipKeyGenerator(req.ip ?? 'unknown')}`,
  });

  router.post(
    '/preview',
    auth.optional,
    writeLimiter,
    validate({ body: cartLinesSchema }),
    async (req, res) => {
      const { items } = req.validated.body as CartLinesInput;
      sendSuccess(res, { data: await cart.preview(items) });
    },
  );

  router.use(auth.required);

  router.get('/', async (req, res) => {
    sendSuccess(res, { data: await cart.view(authOf(req).userId) });
  });

  router.post('/items', writeLimiter, validate({ body: addCartItemSchema }), async (req, res) => {
    const data = await cart.add(authOf(req).userId, req.validated.body as CartLineInput);
    sendSuccess(res, { statusCode: 201, message: 'Added to cart', data });
  });

  router.patch(
    '/items/:variantId',
    writeLimiter,
    validate({ params: cartVariantParamSchema, body: updateCartItemSchema }),
    async (req, res) => {
      const { variantId } = req.validated.params as { variantId: string };
      const { quantity } = req.validated.body as UpdateCartItemInput;
      sendSuccess(res, { data: await cart.setQuantity(authOf(req).userId, variantId, quantity) });
    },
  );

  router.delete(
    '/items/:variantId',
    writeLimiter,
    validate({ params: cartVariantParamSchema }),
    async (req, res) => {
      const { variantId } = req.validated.params as { variantId: string };
      sendSuccess(res, {
        message: 'Removed from cart',
        data: await cart.remove(authOf(req).userId, variantId),
      });
    },
  );

  router.delete('/', writeLimiter, async (req, res) => {
    sendSuccess(res, { message: 'Cart cleared', data: await cart.clear(authOf(req).userId) });
  });

  router.post('/merge', writeLimiter, validate({ body: cartLinesSchema }), async (req, res) => {
    const { items } = req.validated.body as CartLinesInput;
    sendSuccess(res, { data: await cart.merge(authOf(req).userId, items) });
  });

  return router;
}
