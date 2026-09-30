import { maxItems } from '../../database/schemas.js';
import { Schema } from '../../database/mongoose.js';

const refList = (ref: string, label: string) => ({
  type: [{ type: Schema.Types.ObjectId, ref }],
  default: [],
  validate: maxItems(500, label),
});

/**
 * Where a coupon/offer applies. Every list empty = applies everywhere (platform-wide).
 * Non-empty lists are OR-ed within a dimension and AND-ed across dimensions.
 */
export const promotionScopeSchema = new Schema(
  {
    categories: refList('Category', 'categories'),
    products: refList('Product', 'products'),
    brands: refList('Brand', 'brands'),
    sellers: refList('Seller', 'sellers'),
  },
  { _id: false },
);
