import { PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_VERIFICATION_SOURCES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { money, requiredMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/**
 * A Razorpay payment attempt for an Order (an order may have several attempts).
 * No card numbers, CVV or full VPA are ever stored — only non-sensitive display metadata.
 */
const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['RAZORPAY'], default: 'RAZORPAY' },
    razorpayOrderId: { type: String, required: true, match: /^order_[A-Za-z0-9]+$/ },
    razorpayPaymentId: { type: String, match: /^pay_[A-Za-z0-9]+$/, default: null },

    /** Must equal the Order total at creation; re-verified against Razorpay on capture. */
    amount: requiredMoney(100),
    currency: { type: String, enum: ['INR'], default: 'INR' },
    amountRefunded: money(),
    status: { type: String, enum: PAYMENT_STATUSES, default: 'CREATED' },
    method: { type: String, enum: [...PAYMENT_METHODS, null], default: null },
    display: {
      cardNetwork: { type: String, maxlength: 30 },
      cardLast4: { type: String, match: /^\d{4}$/ },
      bank: { type: String, maxlength: 60 },
      wallet: { type: String, maxlength: 60 },
    },
    verifiedVia: { type: String, enum: [...PAYMENT_VERIFICATION_SOURCES, null], default: null },
    capturedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    errorCode: { type: String, maxlength: 100 },
    errorDescription: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

paymentSchema.pre('validate', function () {
  if (this.amountRefunded > this.amount) {
    this.invalidate('amountRefunded', 'Refunded amount cannot exceed the captured amount');
  }
});

paymentSchema.index({ razorpayOrderId: 1 }, { unique: true });
// One Payment per Razorpay payment id — duplicate verify/webhook deliveries can't double-count.
paymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } },
);
paymentSchema.index({ order: 1, createdAt: -1 });
// Admin payments table and reconciliation.
paymentSchema.index({ status: 1, createdAt: -1 });

export type PaymentAttrs = InferSchemaType<typeof paymentSchema>;
export type PaymentDocument = HydratedDocument<PaymentAttrs>;
export const Payment = model('Payment', paymentSchema);
