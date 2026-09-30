import { BUSINESS_TYPES, PATTERNS, SELLER_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { addressSnapshotSchema, bps, imageSchema } from '../../database/schemas.js';
import { Schema, model, toJSONWithout } from '../../database/mongoose.js';

/**
 * Payout bank details. The full account number is stored AES-256-GCM encrypted (Phase 7,
 * DATA_ENCRYPTION_KEY) and never selected by default; only the last 4 digits are displayable.
 */
const payoutAccountSchema = new Schema(
  {
    accountHolderName: { type: String, trim: true, maxlength: 100 },
    accountNumberEncrypted: { type: String, select: false },
    accountNumberLast4: { type: String, match: /^\d{4}$/ },
    ifsc: { type: String, trim: true, uppercase: true, match: PATTERNS.ifsc },
    bankName: { type: String, trim: true, maxlength: 100 },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false },
);

const sellerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, match: PATTERNS.slug, maxlength: 90 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    logo: { type: imageSchema, default: null },
    banner: { type: imageSchema, default: null },

    businessType: { type: String, enum: BUSINESS_TYPES, required: true },
    legalName: { type: String, required: true, trim: true, maxlength: 150 },
    gstin: { type: String, trim: true, uppercase: true, match: PATTERNS.gstin },
    pickupAddress: { type: addressSnapshotSchema, required: true },
    supportEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    supportPhone: { type: String, trim: true, match: PATTERNS.indianMobile },
    payoutAccount: { type: payoutAccountSchema, default: () => ({}) },

    status: { type: String, enum: SELLER_STATUSES, default: 'PENDING' },
    statusReason: { type: String, trim: true, maxlength: 500 },
    /** Platform commission on this seller's sales, in basis points (1000 = 10%). */
    commissionBps: bps(1000),

    ratingAvg: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },

    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: toJSONWithout('payoutAccount.accountNumberEncrypted') },
);

sellerSchema.index({ user: 1 }, { unique: true });
sellerSchema.index({ slug: 1 }, { unique: true });
sellerSchema.index({ status: 1, createdAt: -1 });

export type SellerAttrs = InferSchemaType<typeof sellerSchema>;
export type SellerDocument = HydratedDocument<SellerAttrs>;
export const Seller = model('Seller', sellerSchema);
