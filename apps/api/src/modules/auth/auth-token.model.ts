import { AUTH_TOKEN_TYPES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model, toJSONWithout } from '../../database/mongoose.js';

/** Single-use email-verification and password-reset tokens (hashed, auto-expiring). */
const authTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true, minlength: 64, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONWithout('tokenHash') },
);

authTokenSchema.index({ tokenHash: 1 }, { unique: true });
// Invalidate older tokens of the same type when a new one is issued.
authTokenSchema.index({ user: 1, type: 1, usedAt: 1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthTokenAttrs = InferSchemaType<typeof authTokenSchema>;
export type AuthTokenDocument = HydratedDocument<AuthTokenAttrs>;
export const AuthToken = model('AuthToken', authTokenSchema);
