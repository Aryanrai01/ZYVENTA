import { GST_RATES_BPS, ORDER_ITEM_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { count, money, requiredMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/** What was sold, frozen at purchase time — later product edits never alter history. */
const itemSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 200 },
    slug: { type: String, required: true, maxlength: 160 },
    sku: { type: String, required: true, maxlength: 64 },
    brandName: { type: String, default: '' },
    image: { type: String, default: null },
    options: { type: Map, of: String, default: {} },
  },
  { _id: false },
);

const orderItemSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    sellerOrder: { type: Schema.Types.ObjectId, ref: 'SellerOrder', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    snapshot: { type: itemSnapshotSchema, required: true },

    quantity: { type: Number, required: true, min: 1, max: 10 },
    unitPrice: requiredMoney(1),
    unitMrp: requiredMoney(1),
    /** unitPrice × quantity */
    lineSubtotal: requiredMoney(),
    /** This line's share of the order coupon (largest-remainder allocation). */
    couponDiscount: money(),
    gstRateBps: { type: Number, enum: GST_RATES_BPS, required: true },
    taxIncluded: money(),
    /** lineSubtotal − couponDiscount — the amount refundable for this line. */
    lineTotal: requiredMoney(),

    returnable: { type: Boolean, default: true },
    returnWindowDays: { type: Number, min: 0, max: 30, default: 7 },

    status: { type: String, enum: ORDER_ITEM_STATUSES, default: 'ACTIVE' },
    refundedAmount: money(),
    returnedQuantity: count(),
    isReviewed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

orderItemSchema.pre('validate', function () {
  if (this.lineSubtotal !== this.unitPrice * this.quantity) {
    this.invalidate('lineSubtotal', 'lineSubtotal must equal unitPrice × quantity');
  }
  if (this.lineTotal !== this.lineSubtotal - this.couponDiscount) {
    this.invalidate('lineTotal', 'lineTotal must equal lineSubtotal − couponDiscount');
  }
  if (this.refundedAmount > this.lineTotal) {
    this.invalidate('refundedAmount', 'Cannot refund more than was paid for the line');
  }
  if (this.returnedQuantity > this.quantity) {
    this.invalidate('returnedQuantity', 'Cannot return more units than were bought');
  }
});

orderItemSchema.index({ order: 1 });
orderItemSchema.index({ sellerOrder: 1 });
// Verified-purchase check for reviews: "has this user bought this product?"
orderItemSchema.index({ user: 1, product: 1 });
// Seller analytics: top products, revenue over time.
orderItemSchema.index({ seller: 1, createdAt: -1 });
// "Frequently bought together" aggregation starts from a product's orders.
orderItemSchema.index({ product: 1, createdAt: -1 });

export type OrderItemAttrs = InferSchemaType<typeof orderItemSchema>;
export type OrderItemDocument = HydratedDocument<OrderItemAttrs>;
export const OrderItem = model('OrderItem', orderItemSchema);
