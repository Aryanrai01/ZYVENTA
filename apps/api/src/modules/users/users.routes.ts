import {
  addressIdParamSchema,
  addressInputSchema,
  addressUpdateSchema,
  notificationPreferencesSchema,
  profileUpdateSchema,
  type AddressInput,
  type AddressUpdateInput,
  type NotificationPreferencesInput,
  type ProfileUpdateInput,
} from '@zyventa/shared';
import { Router } from 'express';
import { authOf, type AuthMiddleware } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { noStore } from '../../utils/no-store.js';
import type { AddressService } from './address.service.js';
import type { ProfileService } from './profile.service.js';

/** /api/v1/users/me — the caller's own profile and preferences. */
export function createProfileRouter(deps: {
  auth: AuthMiddleware;
  profile: ProfileService;
}): Router {
  const { profile } = deps;
  const router = Router();
  router.use(noStore, deps.auth.required);

  router.get('/', async (req, res) => {
    sendSuccess(res, { data: await profile.get(authOf(req).userId) });
  });

  router.patch('/', validate({ body: profileUpdateSchema }), async (req, res) => {
    const data = await profile.update(
      req,
      authOf(req).userId,
      req.validated.body as ProfileUpdateInput,
    );
    sendSuccess(res, { message: 'Profile updated', data });
  });

  router.patch(
    '/notification-preferences',
    validate({ body: notificationPreferencesSchema }),
    async (req, res) => {
      const data = await profile.updatePreferences(
        authOf(req).userId,
        req.validated.body as NotificationPreferencesInput,
      );
      sendSuccess(res, { message: 'Preferences saved', data });
    },
  );

  return router;
}

/** /api/v1/addresses — the caller's address book. */
export function createAddressRouter(deps: {
  auth: AuthMiddleware;
  addresses: AddressService;
}): Router {
  const { addresses } = deps;
  const router = Router();
  router.use(noStore, deps.auth.required);

  router.get('/', async (req, res) => {
    sendSuccess(res, { data: await addresses.list(authOf(req).userId) });
  });

  router.post('/', validate({ body: addressInputSchema }), async (req, res) => {
    const data = await addresses.create(authOf(req).userId, req.validated.body as AddressInput);
    sendSuccess(res, { statusCode: 201, message: 'Address saved', data });
  });

  router.patch(
    '/:id',
    validate({ params: addressIdParamSchema, body: addressUpdateSchema }),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const data = await addresses.update(
        authOf(req).userId,
        id,
        req.validated.body as AddressUpdateInput,
      );
      sendSuccess(res, { message: 'Address updated', data });
    },
  );

  router.post('/:id/default', validate({ params: addressIdParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, {
      message: 'Default address updated',
      data: await addresses.setDefault(authOf(req).userId, id),
    });
  });

  router.delete('/:id', validate({ params: addressIdParamSchema }), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, {
      message: 'Address deleted',
      data: await addresses.remove(authOf(req).userId, id),
    });
  });

  return router;
}
