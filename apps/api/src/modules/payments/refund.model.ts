import { REFUND_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { actorSchema, requiredMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

const refundSchema = new Schema(
  {
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    sellerOrder: { type: Schema.Types.ObjectId, ref: 'SellerOrder', default: null },
    orderItems: { type: [{ type: Schema.Types.ObjectId, ref: 'OrderItem' }], default: [] },
    amount: requiredMoney(100),
    reason: {
      type: String,
      enum: ['ORDER_CANCELLED', 'ITEM_RETURNED', 'PAYMENT_AFTER_EXPIRY', 'ADMIN_GOODWILL', 'OTHER'],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: REFUND_STATUSES, default: 'PENDING' },
    /** Sent to Razorpay as the refund receipt — a retried request cannot refund twice. */
    idempotencyKey: { type: String, required: true, maxlength: 64 },
    razorpayRefundId: { type: String, match: /^rfnd_[A-Za-z0-9]+$/, default: null },
    initiatedBy: { type: actorSchema, required: true },
    processedAt: { type: Date, default: null },
    failureReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

refundSchema.index({ idempotencyKey: 1 }, { unique: true });
refundSchema.index(
  { razorpayRefundId: 1 },
  { unique: true, partialFilterExpression: { razorpayRefundId: { $type: 'string' } } },
);
refundSchema.index({ order: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });

export type RefundAttrs = InferSchemaType<typeof refundSchema>;
export type RefundDocument = HydratedDocument<RefundAttrs>;
export const Refund = model('Refund', refundSchema);
