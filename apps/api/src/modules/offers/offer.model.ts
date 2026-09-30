import { DISCOUNT_TYPES, PROMOTION_OWNERS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { optionalMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';
import { promotionScopeSchema } from '../coupons/promotion-scope.schema.js';

/**
 * Automatic, time-boxed discount (a "sale") applied to item prices without a code.
 * Rule: each cart line gets at most ONE offer — the one giving the largest discount
 * (ties broken by `priority`). Coupons then apply on top, at order level.
 */
const offerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    owner: { type: String, enum: PROMOTION_OWNERS, required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', default: null },
    type: { type: String, enum: DISCOUNT_TYPES, required: true },
    /** PERCENTAGE → whole percent (1–90); FIXED → paise off per unit. */
    value: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'Value must be a whole number' },
    },
    maxDiscount: optionalMoney(),
    scope: { type: promotionScopeSchema, default: () => ({}) },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    priority: { type: Number, min: 0, max: 100, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

offerSchema.pre('validate', function () {
  if (this.endsAt <= this.startsAt)
    this.invalidate('endsAt', 'End date must be after the start date');
  if (this.type === 'PERCENTAGE' && this.value > 90) {
    this.invalidate('value', 'Percentage offers cannot exceed 90%');
  }
  if (this.owner === 'SELLER' && !this.seller) {
    this.invalidate('seller', 'Seller offers need an owning seller');
  }
});

// Pricing engine: currently running offers.
offerSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
offerSchema.index({ seller: 1, isActive: 1, endsAt: -1 });
offerSchema.index({ 'scope.products': 1 });
offerSchema.index({ 'scope.categories': 1 });

export type OfferAttrs = InferSchemaType<typeof offerSchema>;
export type OfferDocument = HydratedDocument<OfferAttrs>;
export const Offer = model('Offer', offerSchema);
