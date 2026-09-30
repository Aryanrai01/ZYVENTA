import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { Schema, model, toJSONWithout } from '../../database/mongoose.js';

/**
 * One row per issued refresh token. Tokens are rotated on every refresh: the old row gets
 * `revokedAt` + `replacedByHash`, a new row is created in the same `familyId`. Presenting a
 * revoked token of a family revokes the whole family (token-theft detection).
 * Only the SHA-256 hash of the token is stored — a database leak yields no usable tokens.
 */
const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true, minlength: 16, maxlength: 64 },
    tokenHash: { type: String, required: true, minlength: 64, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: [
        'LOGOUT',
        'LOGOUT_ALL',
        'ROTATED',
        'REUSE_DETECTED',
        'PASSWORD_CHANGED',
        'SUSPENDED',
        'ADMIN',
      ],
    },
    replacedByHash: { type: String, default: null },
    lastUsedAt: { type: Date, default: Date.now },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 512 },
  },
  { timestamps: true, toJSON: toJSONWithout('tokenHash', 'replacedByHash') },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ user: 1, revokedAt: 1 });
sessionSchema.index({ familyId: 1 });
// MongoDB deletes rows once the refresh token has expired.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionAttrs = InferSchemaType<typeof sessionSchema>;
export type SessionDocument = HydratedDocument<SessionAttrs>;
export const Session = model('Session', sessionSchema);
