import { IDEMPOTENCY_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model } from './mongoose.js';

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Stores the outcome of non-idempotent POSTs (checkout, payment verify, refunds) keyed by the
 * client's `Idempotency-Key`. A retry with the same key replays the stored response; the same
 * key with a different body (requestHash mismatch) is rejected with 422.
 */
const idempotencyKeySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Logical operation, e.g. `checkout.create`. */
    scope: { type: String, required: true, maxlength: 60 },
    key: { type: String, required: true, minlength: 8, maxlength: 128, match: /^[A-Za-z0-9_-]+$/ },
    requestHash: { type: String, required: true, minlength: 64, maxlength: 64 },
    status: { type: String, enum: IDEMPOTENCY_STATUSES, default: 'IN_PROGRESS' },
    responseStatus: { type: Number, min: 100, max: 599, default: null },
    // Mixed: replayed verbatim; only ever contains our own response envelope.
    responseBody: { type: Schema.Types.Mixed, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000),
    },
  },
  { timestamps: true },
);

idempotencyKeySchema.index({ user: 1, scope: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IdempotencyKeyAttrs = InferSchemaType<typeof idempotencyKeySchema>;
export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKeyAttrs>;
export const IdempotencyKey = model('IdempotencyKey', idempotencyKeySchema);
