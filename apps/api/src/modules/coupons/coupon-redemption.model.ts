import { COUPON_REDEMPTION_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { requiredMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/**
 * Tracks each use of a coupon. RESERVED at order creation, CONSUMED on payment,
 * RELEASED if the order expires/fails — so abandoned checkouts don't burn usage limits.
 */
const couponRedemptionSchema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    code: { type: String, required: true },
    discount: requiredMoney(1),
    status: { type: String, enum: COUPON_REDEMPTION_STATUSES, default: 'RESERVED' },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

couponRedemptionSchema.index({ order: 1 }, { unique: true });
// Per-user limit check: count RESERVED + CONSUMED for (coupon, user).
couponRedemptionSchema.index({ coupon: 1, user: 1, status: 1 });

export type CouponRedemptionAttrs = InferSchemaType<typeof couponRedemptionSchema>;
export type CouponRedemptionDocument = HydratedDocument<CouponRedemptionAttrs>;
export const CouponRedemption = model('CouponRedemption', couponRedemptionSchema);
