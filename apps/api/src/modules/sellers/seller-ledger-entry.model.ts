import { LEDGER_ENTRY_STATUSES, LEDGER_ENTRY_TYPES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { signedMoney } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/**
 * Double-entry-style record of what the platform owes each seller. Balance = sum(amount) of
 * AVAILABLE entries minus PAID payouts. Entries are never edited — corrections are new
 * ADJUSTMENT rows. SALE credits become AVAILABLE after the return window closes.
 */
const sellerLedgerEntrySchema = new Schema(
  {
    seller: { type: Schema.Types.ObjectId, ref: 'Seller', required: true },
    type: { type: String, enum: LEDGER_ENTRY_TYPES, required: true },
    /** Signed paise: credits positive, debits negative. */
    amount: signedMoney(),
    status: { type: String, enum: LEDGER_ENTRY_STATUSES, default: 'PENDING' },
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    sellerOrder: { type: Schema.Types.ObjectId, ref: 'SellerOrder', default: null },
    refund: { type: Schema.Types.ObjectId, ref: 'Refund', default: null },
    availableAt: { type: Date, default: null },
    payoutReference: { type: String, trim: true, maxlength: 100 },
    note: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

sellerLedgerEntrySchema.index({ seller: 1, createdAt: -1 });
sellerLedgerEntrySchema.index({ seller: 1, status: 1, availableAt: 1 });
// Idempotent order finalisation: at most one SALE and one COMMISSION entry per shipment.
sellerLedgerEntrySchema.index(
  { sellerOrder: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: { $in: ['SALE', 'COMMISSION', 'SELLER_COUPON'] } },
    name: 'seller_order_sale_once',
  },
);

export type SellerLedgerEntryAttrs = InferSchemaType<typeof sellerLedgerEntrySchema>;
export type SellerLedgerEntryDocument = HydratedDocument<SellerLedgerEntryAttrs>;
export const SellerLedgerEntry = model('SellerLedgerEntry', sellerLedgerEntrySchema);
