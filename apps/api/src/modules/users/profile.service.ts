import type {
  NotificationPreferencesInput,
  ProfileUpdateInput,
  ProfileView,
} from '@zyventa/shared';
import type { Request } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { recordAudit } from '../audit/audit.service.js';
import { toAuthUser } from './user.mapper.js';
import { User } from './user.model.js';

const PROFILE_FIELDS =
  'name email phone roles status emailVerifiedAt avatar createdAt notificationPreferences';

export function createProfileService() {
  async function load(userId: string): Promise<ProfileView> {
    const user = await User.findOne({ _id: userId, deletedAt: null }).select(PROFILE_FIELDS).lean();
    if (!user) throw ApiError.notFound('Account not found');
    const prefs = user.notificationPreferences;
    return {
      ...(await toAuthUser(user)),
      notificationPreferences: {
        orderUpdates: prefs.orderUpdates,
        stockAlerts: prefs.stockAlerts,
        promotions: prefs.promotions,
        securityAlerts: true,
      },
    };
  }

  return {
    get: load,

    /** Name and phone only — email changes need re-verification and are not offered here. */
    async update(req: Request, userId: string, input: ProfileUpdateInput): Promise<ProfileView> {
      const set: Record<string, string> = {};
      const unset: Record<string, 1> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.phone !== undefined) {
        if (input.phone === '') unset.phone = 1;
        else set.phone = input.phone;
      }
      const result = await User.updateOne(
        { _id: userId, deletedAt: null },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { runValidators: true },
      );
      if (result.matchedCount === 0) throw ApiError.notFound('Account not found');
      await recordAudit(req, {
        action: 'user.profile_updated',
        resource: 'USER',
        resourceId: userId,
        metadata: { fields: Object.keys(input) },
        actorRole: 'CUSTOMER',
      });
      return load(userId);
    },

    async updatePreferences(
      userId: string,
      input: NotificationPreferencesInput,
    ): Promise<ProfileView> {
      const set = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [`notificationPreferences.${key}`, value]),
      );
      const result = await User.updateOne({ _id: userId, deletedAt: null }, { $set: set });
      if (result.matchedCount === 0) throw ApiError.notFound('Account not found');
      return load(userId);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
