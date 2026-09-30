import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model } from '../../database/mongoose.js';

/** A user's report against a product, review or seller, handled in the admin Reports queue. */
const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
    target: { type: Schema.Types.ObjectId, required: true, refPath: 'targetModel' },
    targetModel: { type: String, enum: ['Product', 'Review', 'Seller'], required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: REPORT_STATUSES, default: 'OPEN' },
    resolution: {
      by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
      action: {
        type: String,
        enum: [
          'NONE',
          'CONTENT_REMOVED',
          'PRODUCT_BLOCKED',
          'SELLER_WARNED',
          'SELLER_SUSPENDED',
          null,
        ],
        default: null,
      },
      note: { type: String, trim: true, maxlength: 1000 },
    },
  },
  { timestamps: true },
);

const TARGET_MODEL = { PRODUCT: 'Product', REVIEW: 'Review', SELLER: 'Seller' } as const;
reportSchema.pre('validate', function () {
  this.targetModel = TARGET_MODEL[this.targetType];
});

// One report per user per target (prevents brigading by repeat submissions).
reportSchema.index({ reporter: 1, targetType: 1, target: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: 1 });
reportSchema.index({ targetType: 1, target: 1, status: 1 });

export type ReportAttrs = InferSchemaType<typeof reportSchema>;
export type ReportDocument = HydratedDocument<ReportAttrs>;
export const Report = model('Report', reportSchema);
