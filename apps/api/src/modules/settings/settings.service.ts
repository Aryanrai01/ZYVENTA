import type { PlatformSettingsInput, PlatformSettingsView } from '@zyventa/shared';
import type { Request } from 'express';
import type { JsonCache } from '../../utils/cache.js';
import { recordAudit } from '../audit/audit.service.js';
import { PlatformSetting } from './platform-setting.model.js';

export interface ShippingSettings {
  freeShippingThreshold: number;
  flatFeePerShipment: number;
}

/** Defaults match the PlatformSetting schema; used until an admin saves settings. */
export const DEFAULT_SETTINGS: PlatformSettingsView = {
  shipping: { freeShippingThreshold: 49_900, flatFeePerShipment: 4_000 },
  checkout: { paymentWindowMinutes: 15 },
  returns: { defaultWindowDays: 7 },
  commission: { defaultBps: 1000 },
  maintenance: { enabled: false, message: '' },
  support: { email: '', phone: '' },
  updatedAt: null,
};
export const DEFAULT_SHIPPING = DEFAULT_SETTINGS.shipping;

const SETTINGS_KEY = 'settings:platform';

export function createSettingsService(cache: JsonCache) {
  async function all(): Promise<PlatformSettingsView> {
    return cache.wrap(SETTINGS_KEY, 300, async () => {
      const doc = await PlatformSetting.findOne({ key: 'platform' }).lean();
      if (!doc) return DEFAULT_SETTINGS;
      const d = DEFAULT_SETTINGS;
      return {
        shipping: {
          freeShippingThreshold:
            doc.shipping?.freeShippingThreshold ?? d.shipping.freeShippingThreshold,
          flatFeePerShipment: doc.shipping?.flatFeePerShipment ?? d.shipping.flatFeePerShipment,
        },
        checkout: {
          paymentWindowMinutes:
            doc.checkout?.paymentWindowMinutes ?? d.checkout.paymentWindowMinutes,
        },
        returns: {
          defaultWindowDays: doc.returns?.defaultWindowDays ?? d.returns.defaultWindowDays,
        },
        commission: { defaultBps: doc.commission?.defaultBps ?? d.commission.defaultBps },
        maintenance: {
          enabled: doc.maintenance?.enabled ?? false,
          message: doc.maintenance?.message ?? '',
        },
        support: { email: doc.support?.email ?? '', phone: doc.support?.phone ?? '' },
        updatedAt: doc.updatedAt.toISOString(),
      };
    });
  }

  return {
    all,
    async shipping(): Promise<ShippingSettings> {
      return (await all()).shipping;
    },
    async update(req: Request, input: PlatformSettingsInput): Promise<PlatformSettingsView> {
      const set: Record<string, unknown> = { updatedBy: req.auth?.userId };
      for (const [group, values] of Object.entries(input)) {
        for (const [key, value] of Object.entries(values)) set[`${group}.${key}`] = value;
      }
      await PlatformSetting.updateOne(
        { key: 'platform' },
        { $set: set, $setOnInsert: { key: 'platform' } },
        { upsert: true, runValidators: true },
      );
      await cache.invalidate(SETTINGS_KEY);
      await recordAudit(req, {
        action: 'settings.updated',
        resource: 'SETTINGS',
        resourceId: 'platform',
        metadata: input,
        actorRole: 'ADMIN',
      });
      return all();
    },
    invalidate(): Promise<void> {
      return cache.invalidate(SETTINGS_KEY);
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
