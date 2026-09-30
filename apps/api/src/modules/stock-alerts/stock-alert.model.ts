import { STOCK_ALERT_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model } from '../../database/mongoose.js';

/**
 * "Notify me when available". When a variant's available stock goes 0 → >0, a job
 * atomically flips ACTIVE alerts to NOTIFIED (so each subscriber is notified exactly once
 * per restock) and sends notifications. Re-subscribing sets the alert back to ACTIVE.
 */
const stockAlertSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    status: { type: String, enum: STOCK_ALERT_STATUSES, default: 'ACTIVE' },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One alert per user per variant (toggle on/off updates the same row).
stockAlertSchema.index({ user: 1, variant: 1 }, { unique: true });
// Restock fan-out: all active subscribers of a variant.
stockAlertSchema.index({ variant: 1, status: 1 });
stockAlertSchema.index({ user: 1, status: 1, updatedAt: -1 });

export type StockAlertAttrs = InferSchemaType<typeof stockAlertSchema>;
export type StockAlertDocument = HydratedDocument<StockAlertAttrs>;
export const StockAlert = model('StockAlert', stockAlertSchema);
