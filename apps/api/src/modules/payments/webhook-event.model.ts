import { WEBHOOK_EVENT_STATUSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model } from '../../database/mongoose.js';

const RETENTION_SECONDS = 90 * 24 * 60 * 60;

/**
 * Dedupe log for inbound webhooks. Inserting the provider's event id first (unique index)
 * turns duplicate deliveries and replays into no-ops. Only ids needed for reconciliation are
 * kept — never the full payload (it can contain customer contact details).
 */
const webhookEventSchema = new Schema(
  {
    provider: { type: String, enum: ['RAZORPAY'], required: true },
    eventId: { type: String, required: true, maxlength: 100 },
    type: { type: String, required: true, maxlength: 100 },
    status: { type: String, enum: WEBHOOK_EVENT_STATUSES, default: 'RECEIVED' },
    entityIds: {
      razorpayOrderId: { type: String, default: null },
      razorpayPaymentId: { type: String, default: null },
      razorpayRefundId: { type: String, default: null },
    },
    processedAt: { type: Date, default: null },
    error: { type: String, maxlength: 1000 },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ status: 1, receivedAt: -1 });
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

export type WebhookEventAttrs = InferSchemaType<typeof webhookEventSchema>;
export type WebhookEventDocument = HydratedDocument<WebhookEventAttrs>;
export const WebhookEvent = model('WebhookEvent', webhookEventSchema);
