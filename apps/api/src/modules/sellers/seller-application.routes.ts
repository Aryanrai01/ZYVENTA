import { sellerApplicationInputSchema, type SellerApplicationInput } from '@zyventa/shared';
import { Router } from 'express';
import {
  authOf,
  requireVerifiedEmail,
  type AuthMiddleware,
} from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { noStore } from '../../utils/no-store.js';
import type { SellerApplicationService } from './seller-application.service.js';

/** /api/v1/seller-applications — any signed-in user may apply to sell (verified email). */
export function createSellerApplicationRouter(deps: {
  auth: AuthMiddleware;
  applications: SellerApplicationService;
}): Router {
  const { applications } = deps;
  const router = Router();
  router.use(noStore, deps.auth.required);

  router.get('/me', async (req, res) => {
    sendSuccess(res, { data: await applications.mine(authOf(req).userId) });
  });

  router.post(
    '/',
    requireVerifiedEmail,
    validate({ body: sellerApplicationInputSchema }),
    async (req, res) => {
      const data = await applications.apply(
        authOf(req).userId,
        req.validated.body as SellerApplicationInput,
      );
      sendSuccess(res, { statusCode: 201, message: 'Application submitted', data });
    },
  );

  router.delete('/me', async (req, res) => {
    await applications.withdraw(authOf(req).userId);
    sendSuccess(res, { message: 'Application withdrawn', data: null });
  });

  return router;
}
