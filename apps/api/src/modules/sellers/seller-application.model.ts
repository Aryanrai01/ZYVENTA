import { BUSINESS_TYPES, PATTERNS, SELLER_APPLICATION_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { addressSnapshotSchema, maxItems } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

const applicationDocumentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['GST_CERTIFICATE', 'CANCELLED_CHEQUE', 'BUSINESS_REGISTRATION', 'OTHER'],
      required: true,
    },
    url: { type: String, required: true, match: /^https:\/\//, maxlength: 2048 },
    publicId: { type: String, maxlength: 255 },
  },
  { _id: false },
);

/** A user's request to become a seller. Approval creates the Seller document (audited). */
const sellerApplicationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    businessType: { type: String, enum: BUSINESS_TYPES, required: true },
    legalName: { type: String, required: true, trim: true, maxlength: 150 },
    gstin: { type: String, trim: true, uppercase: true, match: PATTERNS.gstin },
    contactPhone: { type: String, required: true, trim: true, match: PATTERNS.indianMobile },
    pickupAddress: { type: addressSnapshotSchema, required: true },
    intendedCategories: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      default: [],
      validate: maxItems(10, 'categories'),
    },
    documents: {
      type: [applicationDocumentSchema],
      default: [],
      validate: maxItems(5, 'documents'),
    },
    status: { type: String, enum: SELLER_APPLICATION_STATUSES, default: 'PENDING' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

// Admin review queue.
sellerApplicationSchema.index({ status: 1, createdAt: 1 });
sellerApplicationSchema.index({ user: 1, createdAt: -1 });
// A user can have only one pending application at a time.
sellerApplicationSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'user_single_pending' },
);

export type SellerApplicationAttrs = InferSchemaType<typeof sellerApplicationSchema>;
export type SellerApplicationDocument = HydratedDocument<SellerApplicationAttrs>;
export const SellerApplication = model('SellerApplication', sellerApplicationSchema);
