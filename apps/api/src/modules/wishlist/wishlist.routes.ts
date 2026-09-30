import {
  wishlistAddSchema,
  wishlistProductParamSchema,
  type WishlistAddInput,
} from '@zyventa/shared';
import { Router } from 'express';
import { authOf, type AuthMiddleware } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { noStore } from '../../utils/no-store.js';
import type { WishlistService } from './wishlist.service.js';

/** /api/v1/wishlist — signed-in shoppers only; always scoped to the caller. */
export function createWishlistRouter(deps: {
  auth: AuthMiddleware;
  wishlist: WishlistService;
}): Router {
  const { wishlist } = deps;
  const router = Router();
  router.use(noStore, deps.auth.required);

  router.get('/', async (req, res) => {
    sendSuccess(res, { data: await wishlist.view(authOf(req).userId) });
  });

  router.get('/ids', async (req, res) => {
    sendSuccess(res, { data: await wishlist.ids(authOf(req).userId) });
  });

  router.post('/', validate({ body: wishlistAddSchema }), async (req, res) => {
    const { productId } = req.validated.body as WishlistAddInput;
    const userId = authOf(req).userId;
    await wishlist.add(userId, productId);
    sendSuccess(res, {
      statusCode: 201,
      message: 'Saved to wishlist',
      data: await wishlist.ids(userId),
    });
  });

  router.delete(
    '/:productId',
    validate({ params: wishlistProductParamSchema }),
    async (req, res) => {
      const { productId } = req.validated.params as { productId: string };
      const userId = authOf(req).userId;
      await wishlist.remove(userId, productId);
      sendSuccess(res, { message: 'Removed from wishlist', data: await wishlist.ids(userId) });
    },
  );

  return router;
}
