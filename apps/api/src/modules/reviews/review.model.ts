import { REVIEW_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { actorSchema, imageSchema, maxItems } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/**
 * Product review tied to a purchased order line (verified purchase). Title/body are stored as
 * plain text — React escapes on render, and the service strips any markup on write.
 */
const reviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderItem: { type: Schema.Types.ObjectId, ref: 'OrderItem', required: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'Rating must be 1–5 stars' },
    },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    body: { type: String, trim: true, maxlength: 5000, default: '' },
    images: { type: [imageSchema], default: [], validate: maxItems(5, 'review images') },
    isVerifiedPurchase: { type: Boolean, default: true },
    status: { type: String, enum: REVIEW_STATUSES, default: 'PUBLISHED' },
    moderation: {
      actor: { type: actorSchema, default: null },
      reason: { type: String, trim: true, maxlength: 500 },
      at: { type: Date, default: null },
    },
    sellerResponse: {
      body: { type: String, trim: true, maxlength: 2000 },
      at: { type: Date, default: null },
    },
    helpfulCount: { type: Number, min: 0, default: 0 },
    reportCount: { type: Number, min: 0, default: 0 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One review per purchased order line.
reviewSchema.index({ orderItem: 1 }, { unique: true });
// Product page: newest / most helpful / by rating.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ product: 1, status: 1, helpfulCount: -1 });
reviewSchema.index({ product: 1, status: 1, rating: 1 });
reviewSchema.index({ user: 1, createdAt: -1 });
// Moderation queue.
reviewSchema.index({ status: 1, reportCount: -1, createdAt: -1 });
reviewSchema.index({ seller: 1, createdAt: -1 });

export type ReviewAttrs = InferSchemaType<typeof reviewSchema>;
export type ReviewDocument = HydratedDocument<ReviewAttrs>;
export const Review = model('Review', reviewSchema);
