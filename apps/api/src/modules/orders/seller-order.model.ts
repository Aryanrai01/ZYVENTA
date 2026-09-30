import { SELLER_ORDER_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { bps, money, statusHistorySchema } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';
import { pricingBreakdownSchema } from './pricing.schema.js';

const shipmentSchema = new Schema(
  {
    carrier: { type: String, trim: true, maxlength: 60 },
    trackingNumber: { type: String, trim: true, maxlength: 60 },
    trackingUrl: { type: String, trim: true, maxlength: 500, match: /^https:\/\// },
    estimatedDeliveryAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * The part of an order fulfilled by one seller. Status changes go ONLY through the order
 * service, which checks `sellerOrderStateMachine` and appends to `statusHistory`.
 */
const sellerOrderSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    /** Parent number + seller index, e.g. ZV2609-000123-2. */
    subOrderNumber: { type: String, required: true, match: /^ZV\d{4}-\d{6,}-\d{1,2}$/ },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', required: true },

    status: { type: String, enum: SELLER_ORDER_STATUSES, default: 'CONFIRMED' },
    statusHistory: { type: [statusHistorySchema(SELLER_ORDER_STATUSES)], default: [] },

    pricing: { type: pricingBreakdownSchema, required: true },
    /** Commission snapshot at order time (seller rate may change later). */
    commissionBps: bps(0),
    commissionAmount: money(),
    itemCount: { type: Number, required: true, min: 1 },

    shipment: { type: shipmentSchema, default: () => ({}) },
    /** Latest date a return may be requested (set on delivery from the item policies). */
    returnWindowEndsAt: { type: Date, default: null },
    /** Set when the parent order is paid. Sellers only ever see paid shipments. */
    paidAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

sellerOrderSchema.index({ subOrderNumber: 1 }, { unique: true });
// Seller order queue filtered by status.
sellerOrderSchema.index({ seller: 1, status: 1, createdAt: -1 });
// Seller analytics over time.
sellerOrderSchema.index({ seller: 1, createdAt: -1 });
sellerOrderSchema.index({ order: 1 });
sellerOrderSchema.index({ status: 1, updatedAt: -1 });

export type SellerOrderAttrs = InferSchemaType<typeof sellerOrderSchema>;
export type SellerOrderDocument = HydratedDocument<SellerOrderAttrs>;
export const SellerOrder = model('SellerOrder', sellerOrderSchema);
