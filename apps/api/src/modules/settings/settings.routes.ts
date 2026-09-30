import type { PublicSettings } from '@zyventa/shared';
import { Router } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { publicCache } from '../../utils/http-cache.js';
import type { SettingsService } from './settings.service.js';

/** Public, non-sensitive platform settings: storefront banner, delivery threshold, support. */
export function createSettingsRouter(deps: { settings: SettingsService }): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const s = await deps.settings.all();
    const data: PublicSettings = {
      shipping: s.shipping,
      maintenance: s.maintenance,
      support: s.support,
    };
    publicCache(res, 60);
    sendSuccess(res, { data });
  });
  return router;
}
