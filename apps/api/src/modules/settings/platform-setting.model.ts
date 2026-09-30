import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { bps, money } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/**
 * Admin-editable platform configuration, stored as a single typed document (`key: 'platform'`)
 * rather than loose key/value rows, so every setting is validated.
 */
const platformSettingSchema = new Schema(
  {
    key: { type: String, enum: ['platform'], default: 'platform' },
    shipping: {
      /** Orders whose seller-subtotal reaches this ship free (paise). */
      freeShippingThreshold: money(49_900),
      /** Fee charged per seller shipment below the threshold (paise). */
      flatFeePerShipment: money(4_000),
    },
    checkout: {
      /** Minutes an unpaid order holds its stock reservation. */
      paymentWindowMinutes: { type: Number, min: 5, max: 60, default: 15 },
      maxQuantityPerItem: { type: Number, min: 1, max: 10, default: 10 },
    },
    returns: {
      defaultWindowDays: { type: Number, min: 0, max: 30, default: 7 },
    },
    commission: {
      defaultBps: bps(1000),
    },
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true, maxlength: 300, default: '' },
    },
    support: {
      email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
      phone: { type: String, trim: true, maxlength: 20, default: '' },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

platformSettingSchema.index({ key: 1 }, { unique: true });

export type PlatformSettingAttrs = InferSchemaType<typeof platformSettingSchema>;
export type PlatformSettingDocument = HydratedDocument<PlatformSettingAttrs>;
export const PlatformSetting = model('PlatformSetting', platformSettingSchema);
