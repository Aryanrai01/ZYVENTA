import { PATTERNS, ROLES, USER_STATUSES, type Role } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { imageSchema } from '../../database/schemas.js';
import { Schema, model, toJSONWithout } from '../../database/mongoose.js';

const notificationPreferencesSchema = new Schema(
  {
    orderUpdates: { type: Boolean, default: true },
    stockAlerts: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false },
    securityAlerts: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    /** Stored lowercased; uniqueness is enforced by the index below. */
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    phone: { type: String, trim: true, match: PATTERNS.indianMobile },
    /** Argon2id hash. Never selected unless explicitly requested with `+passwordHash`. */
    passwordHash: { type: String, required: true, select: false },
    roles: {
      type: [{ type: String, enum: ROLES }],
      default: ['USER'],
      validate: {
        validator: (roles: Role[]) => roles.length > 0 && new Set(roles).size === roles.length,
        message: 'User must have at least one unique role',
      },
    },
    status: { type: String, enum: USER_STATUSES, default: 'ACTIVE' },
    suspendedReason: { type: String, trim: true, maxlength: 500 },
    emailVerifiedAt: { type: Date, default: null },
    avatar: { type: imageSchema, default: null },
    notificationPreferences: { type: notificationPreferencesSchema, default: () => ({}) },

    // Security bookkeeping — hidden from default queries.
    failedLoginCount: { type: Number, default: 0, min: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    passwordChangedAt: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: toJSONWithout('passwordHash', 'failedLoginCount', 'lockUntil', 'passwordChangedAt'),
  },
);

userSchema.index({ email: 1 }, { unique: true });
// Admin user table: filter by role/status, newest first.
userSchema.index({ roles: 1, status: 1, createdAt: -1 });
userSchema.index({ phone: 1 }, { sparse: true });

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema);
