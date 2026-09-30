import {
  INDIAN_STATE_CODES,
  MAX_AMOUNT_PAISE,
  PATTERNS,
  ROLES,
  TRANSITION_ACTORS,
} from '@zyventa/shared';
import { Schema } from './mongoose.js';

/**
 * Reusable schema fragments. Keeping these in one place guarantees that e.g. every money
 * field has identical integer-paise validation and every address has the same rules.
 */

/** Custom validators also run on null, so optional fields must allow it explicitly. */
const isIntegerOrUnset = (value: unknown) => value == null || Number.isInteger(value);

const moneyBase = {
  type: Number,
  min: [0, 'Amount cannot be negative'] as [number, string],
  max: [MAX_AMOUNT_PAISE, 'Amount is too large'] as [number, string],
  validate: { validator: isIntegerOrUnset, message: 'Amount must be whole paise' },
};

/*
 * Field factories return literal object types (no conditional spreads) so Mongoose's schema
 * type inference sees `required` / `default` and types the path as non-nullable.
 */

/** Required integer paise, 0 … ₹1 crore. Pass `minPaise` for a higher floor. */
export function requiredMoney(minPaise = 0) {
  return {
    ...moneyBase,
    min: [minPaise, `Amount must be at least ${minPaise} paise`] as [number, string],
    required: true as const,
  };
}

/** Integer paise with a default (0 unless given). */
export function money(defaultPaise = 0) {
  return { ...moneyBase, default: defaultPaise };
}

/** Optional integer paise (null when absent), e.g. a coupon's maximum discount. */
export function optionalMoney() {
  return { ...moneyBase, default: null };
}

/** Signed integer paise (ledger entries). */
export function signedMoney() {
  return {
    type: Number,
    required: true as const,
    min: -MAX_AMOUNT_PAISE,
    max: MAX_AMOUNT_PAISE,
    validate: { validator: Number.isInteger, message: 'Amount must be whole paise' },
  };
}

/** Non-negative integer counter (stock, quantities, counts). */
export function count(defaultValue = 0, max = 1_000_000_000) {
  return {
    type: Number,
    min: 0,
    max,
    validate: { validator: Number.isInteger, message: 'Must be a whole number' },
    default: defaultValue,
  };
}

/** Basis points 0 … 10 000 (100%) with a default. */
export function bps(defaultValue: number) {
  return {
    type: Number,
    min: 0,
    max: 10_000,
    validate: { validator: Number.isInteger, message: 'Must be whole basis points' },
    default: defaultValue,
  };
}

export const imageSchema = new Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 2048, match: PATTERNS.imageUrl },
    /** Storage key (Cloudinary public_id) — needed to delete/replace the asset. */
    publicId: { type: String, trim: true, maxlength: 255 },
    alt: { type: String, trim: true, maxlength: 200, default: '' },
    width: { type: Number, min: 1, max: 10_000 },
    height: { type: Number, min: 1, max: 10_000 },
  },
  { _id: false },
);

/** Postal address fields — used as a live Address and as an immutable snapshot on orders. */
export const addressFields = {
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  phone: { type: String, required: true, trim: true, match: PATTERNS.indianMobile },
  line1: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  line2: { type: String, trim: true, maxlength: 120, default: '' },
  landmark: { type: String, trim: true, maxlength: 80, default: '' },
  city: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  state: { type: String, required: true, enum: INDIAN_STATE_CODES },
  pincode: { type: String, required: true, trim: true, match: PATTERNS.pincode },
  country: { type: String, enum: ['IN'], default: 'IN' },
} as const;

export const addressSnapshotSchema = new Schema(addressFields, { _id: false });

/** Who performed an action (status changes, moderation, refunds). `user` is null for SYSTEM. */
export const actorSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: TRANSITION_ACTORS, required: true },
  },
  { _id: false },
);

/** Append-only status history entry for any status enum. */
export function statusHistorySchema(statuses: readonly string[]) {
  return new Schema(
    {
      status: { type: String, enum: statuses, required: true },
      at: { type: Date, required: true, default: Date.now },
      actor: { type: actorSchema, required: true },
      note: { type: String, trim: true, maxlength: 500 },
    },
    { _id: false },
  );
}

export const seoSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 70 },
    description: { type: String, trim: true, maxlength: 170 },
  },
  { _id: false },
);

export const roleEnum = { type: String, enum: ROLES } as const;

/** Validator: array has no duplicate values under `keyOf`. */
export function uniqueBy<T>(keyOf: (item: T) => string, message: string) {
  return {
    validator: (items: T[]) => new Set(items.map(keyOf)).size === items.length,
    message,
  };
}

/** Validator: array length ≤ max. */
export function maxItems(max: number, label: string) {
  return {
    validator: (items: unknown[]) => items.length <= max,
    message: `A maximum of ${max} ${label} is allowed`,
  };
}
