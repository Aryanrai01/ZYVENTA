import { NOTIFICATION_TYPES, PATTERNS } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model } from '../../database/mongoose.js';

export const NOTIFICATION_RETENTION_DAYS = 180;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 500, default: '' },
    /** Relative in-app path only — prevents notifications becoming open redirects. */
    link: { type: String, trim: true, maxlength: 300, match: PATTERNS.internalPath, default: null },
    /** Small, string-only context (e.g. orderNumber) for rendering; no sensitive data. */
    meta: { type: Map, of: { type: String, maxlength: 200 }, default: {} },
    readAt: { type: Date, default: null },
    /**
     * Dedupe key for notifications that must be sent once, e.g. `back-in-stock:<variant>:<cycle>`.
     */
    dedupeKey: { type: String, maxlength: 200, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Bell dropdown / unread badge: a user's unread first, newest first.
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 },
);

export type NotificationAttrs = InferSchemaType<typeof notificationSchema>;
export type NotificationDocument = HydratedDocument<NotificationAttrs>;
export const Notification = model('Notification', notificationSchema);
