import { RETURN_REASONS, RETURN_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { imageSchema, maxItems, statusHistorySchema } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/** Item-level return. Transitions are governed by `returnStateMachine` in @zyventa/shared. */
const returnRequestSchema = new Schema(
  {
    orderItem: { type: Schema.Types.ObjectId, ref: 'OrderItem', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    sellerOrder: { type: Schema.Types.ObjectId, ref: 'SellerOrder', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', required: true },
    quantity: { type: Number, required: true, min: 1, max: 10 },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
    images: { type: [imageSchema], default: [], validate: maxItems(5, 'images') },
    status: { type: String, enum: RETURN_STATUSES, default: 'REQUESTED' },
    statusHistory: { type: [statusHistorySchema(RETURN_STATUSES)], default: [] },
    resolutionNote: { type: String, trim: true, maxlength: 1000 },
    refund: { type: Schema.Types.ObjectId, ref: 'Refund', default: null },
  },
  { timestamps: true },
);

// Only one open return per order line at a time.
returnRequestSchema.index(
  { orderItem: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['REQUESTED', 'APPROVED', 'PICKED_UP', 'RECEIVED'] },
    },
    name: 'order_item_single_open_return',
  },
);
returnRequestSchema.index({ seller: 1, status: 1, createdAt: -1 });
returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ order: 1 });

export type ReturnRequestAttrs = InferSchemaType<typeof returnRequestSchema>;
export type ReturnRequestDocument = HydratedDocument<ReturnRequestAttrs>;
export const ReturnRequest = model('ReturnRequest', returnRequestSchema);
