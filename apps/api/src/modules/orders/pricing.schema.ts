import { money } from '../../database/schemas.js';
import { Schema } from '../../database/mongoose.js';

/**
 * Price breakdown stored on Order and SellerOrder — always computed by the server-side
 * PricingService, never accepted from a client.
 *
 *   total = subtotal − couponDiscount + shippingFee
 *   taxIncluded is informational: prices are GST-inclusive (MRP convention).
 */
export const pricingBreakdownSchema = new Schema(
  {
    /** Σ mrp × qty — basis for "You save ₹…". */
    mrpTotal: money(),
    /** Σ unit price × qty (unit price already includes any automatic offer). */
    subtotal: money(),
    couponDiscount: money(),
    shippingFee: money(),
    taxIncluded: money(),
    total: money(),
  },
  { _id: false },
);

pricingBreakdownSchema.pre('validate', function () {
  const expected = this.subtotal - this.couponDiscount + this.shippingFee;
  if (this.total !== expected) {
    this.invalidate(
      'total',
      `total must equal subtotal − couponDiscount + shippingFee (${expected})`,
    );
  }
  if (this.couponDiscount > this.subtotal) {
    this.invalidate('couponDiscount', 'Discount cannot exceed the subtotal');
  }
});
