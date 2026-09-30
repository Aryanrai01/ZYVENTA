import { ORDER_PAYMENT_STATUSES, ORDER_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { addressSnapshotSchema, money, statusHistorySchema } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';
import { pricingBreakdownSchema } from './pricing.schema.js';

/**
 * One Order per checkout. It owns payment and totals; fulfilment is tracked per seller on
 * SellerOrder, and line items live in OrderItem.
 */
const orderSchema = new Schema(
  {
    /** Human-facing id, e.g. ZV2609-000123 (see database/counter.ts). */
    orderNumber: { type: String, required: true, match: /^ZV\d{4}-\d{6,}$/ },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contact: {
      email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
      phone: { type: String, required: true, trim: true },
    },
    /** Immutable copy — editing the address book never changes past orders. */
    shippingAddress: { type: addressSnapshotSchema, required: true },

    pricing: { type: pricingBreakdownSchema, required: true },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    coupon: {
      coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', default: null },
      code: { type: String, default: null },
    },
    itemCount: { type: Number, required: true, min: 1 },
    sellerOrderCount: { type: Number, required: true, min: 1 },

    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING_PAYMENT' },
    paymentStatus: { type: String, enum: ORDER_PAYMENT_STATUSES, default: 'PENDING' },
    refundedAmount: money(),
    statusHistory: { type: [statusHistorySchema(ORDER_STATUSES)], default: [] },

    /** Unpaid orders release their stock reservation after this instant. */
    expiresAt: { type: Date, default: null },
    placedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 500 },
    /** Client-supplied Idempotency-Key that created this order. */
    idempotencyKey: { type: String, maxlength: 128 },
  },
  { timestamps: true },
);

orderSchema.pre('validate', function () {
  if (this.refundedAmount > this.pricing.total) {
    this.invalidate('refundedAmount', 'Refunded amount cannot exceed the order total');
  }
});

orderSchema.index({ orderNumber: 1 }, { unique: true });
// "My orders".
orderSchema.index({ user: 1, createdAt: -1 });
// Admin order table filtered by status.
orderSchema.index({ status: 1, createdAt: -1 });
// Reservation-expiry job: only pending orders are indexed.
orderSchema.index(
  { expiresAt: 1 },
  { partialFilterExpression: { status: 'PENDING_PAYMENT' }, name: 'pending_payment_expiry' },
);
// A retried checkout with the same key returns the same order.
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

export type OrderAttrs = InferSchemaType<typeof orderSchema>;
export type OrderDocument = HydratedDocument<OrderAttrs>;
export const Order = model('Order', orderSchema);
