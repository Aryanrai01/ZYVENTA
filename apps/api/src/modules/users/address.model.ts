import { ADDRESS_LABELS, MAX_ADDRESSES } from '@zyventa/shared';
import type { HydratedDocument, InferSchemaType } from 'mongoose';
import { addressFields } from '../../database/schemas.js';
import { Schema, model } from '../../database/mongoose.js';

/** Upper bound enforced by the address service. */
export const MAX_ADDRESSES_PER_USER = MAX_ADDRESSES;

const addressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, enum: ADDRESS_LABELS, default: 'HOME' },
    ...addressFields,
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Address book listing: default first, then most recently edited.
addressSchema.index({ user: 1, isDefault: -1, updatedAt: -1 });
// At most one default address per user, enforced by the database.
addressSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { isDefault: true }, name: 'user_single_default' },
);

export type AddressAttrs = InferSchemaType<typeof addressSchema>;
export type AddressDocument = HydratedDocument<AddressAttrs>;
export const Address = model('Address', addressSchema);
