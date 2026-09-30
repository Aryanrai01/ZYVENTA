import { COUPON_VISIBILITIES, DISCOUNT_TYPES, PATTERNS, PROMOTION_OWNERS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { money, optionalMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';
import { promotionScopeSchema } from './promotion-scope.schema.js';

/**
 * Code-based discount entered at checkout. Validation of eligibility (dates, limits, scope,
 * minimum order) happens server-side in the pricing engine; the client only sends the code.
 *
 * `value` semantics: PERCENTAGE → whole percent (1–90); FIXED → paise.
 */
const couponSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, match: PATTERNS.couponCode },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    type: { type: String, enum: DISCOUNT_TYPES, required: true },
    value: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'Value must be a whole number' },
    },
    maxDiscount: optionalMoney(),
    minOrderAmount: money(),
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },

    /** Total redemptions allowed (null = unlimited). */
    usageLimit: { type: Number, min: 1, default: null },
    /** Reserved + consumed redemptions; incremented atomically with a `< usageLimit` guard. */
    usedCount: { type: Number, min: 0, default: 0 },
    perUserLimit: { type: Number, min: 1, max: 100, default: 1 },
    firstOrderOnly: { type: Boolean, default: false },

    scope: { type: promotionScopeSchema, default: () => ({}) },
    fundedBy: { type: String, enum: PROMOTION_OWNERS, default: 'PLATFORM' },
    /** Required when fundedBy = SELLER; such coupons only apply to that seller's items. */
    ownerSeller: { type: Schema.Types.ObjectId, ref: 'Seller', default: null },
    visibility: { type: String, enum: COUPON_VISIBILITIES, default: 'PUBLIC' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

couponSchema.pre('validate', function () {
  if (this.endsAt <= this.startsAt) {
    this.invalidate('endsAt', 'End date must be after the start date');
  }
  if (this.type === 'PERCENTAGE' && this.value > 90) {
    this.invalidate('value', 'Percentage discounts cannot exceed 90%');
  }
  if (this.type === 'FIXED' && this.value < 100) {
    this.invalidate('value', 'Fixed discounts must be at least ₹1 (100 paise)');
  }
  if (this.fundedBy === 'SELLER' && !this.ownerSeller) {
    this.invalidate('ownerSeller', 'Seller-funded coupons need an owning seller');
  }
  if (this.fundedBy === 'PLATFORM' && this.ownerSeller) {
    this.invalidate('ownerSeller', 'Platform coupons cannot have an owning seller');
  }
  if (this.usageLimit != null && this.usedCount > this.usageLimit) {
    this.invalidate('usedCount', 'Usage exceeds the limit');
  }
});

couponSchema.index({ code: 1 }, { unique: true });
// "Available coupons" list for shoppers.
couponSchema.index({ isActive: 1, visibility: 1, endsAt: 1 });
// Seller coupon management.
couponSchema.index({ ownerSeller: 1, createdAt: -1 });

export type CouponAttrs = InferSchemaType<typeof couponSchema>;
export type CouponDocument = HydratedDocument<CouponAttrs>;
export const Coupon = model('Coupon', couponSchema);
