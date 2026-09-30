import { z } from 'zod';

/**
 * Field-level rules shared by API validation, Mongoose schemas and web forms.
 * Regexes are exported for Mongoose `match`; zod schemas for request/forms.
 */
export const PATTERNS = {
  /** 24-hex MongoDB ObjectId. */
  objectId: /^[a-f\d]{24}$/i,
  /** Lowercase URL slug: words separated by single hyphens. */
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /** Indian mobile number, 10 digits, without country code. */
  indianMobile: /^[6-9]\d{9}$/,
  /** Indian PIN code (first digit non-zero). */
  pincode: /^[1-9]\d{5}$/,
  /** 15-character GSTIN: state code, PAN, entity no., 'Z', checksum. */
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  /** IFSC: 4 letters bank code, 0, 6 alphanumeric branch code. */
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  /** Stock-keeping unit: uppercase alphanumerics, dash, underscore. */
  sku: /^[A-Z0-9][A-Z0-9_-]{2,63}$/,
  /** Coupon code: uppercase alphanumerics. */
  couponCode: /^[A-Z0-9]{4,20}$/,
  /** HSN/SAC code for GST: 4, 6 or 8 digits. */
  hsn: /^(?:\d{4}|\d{6}|\d{8})$/,
  /** In-app link target: relative path only (prevents open redirects from notifications). */
  internalPath: /^\/(?!\/)[\w\-./?=&%#]*$/,
  /** Image URL: https, or a bundled placeholder served by the web app. */
  imageUrl: /^(?:https:\/\/[^\s]+|\/placeholders\/[\w-]+\.(?:svg|png|jpg|webp))$/,
} as const;

export const objectIdSchema = z.string().regex(PATTERNS.objectId, 'Invalid id');
export const slugSchema = z.string().min(2).max(160).regex(PATTERNS.slug, 'Invalid slug');
export const indianMobileSchema = z
  .string()
  .trim()
  .regex(PATTERNS.indianMobile, 'Enter a valid 10-digit mobile number');
export const pincodeSchema = z
  .string()
  .trim()
  .regex(PATTERNS.pincode, 'Enter a valid 6-digit PIN code');
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email'));

/** Money is integer paise. Upper bound (₹1 crore) guards against overflow and typos. */
export const MAX_AMOUNT_PAISE = 1_000_000_000;
export const paiseSchema = z
  .number()
  .int('Amount must be in whole paise')
  .min(0)
  .max(MAX_AMOUNT_PAISE);

/** Passwords: length over complexity (NIST 800-63B), with a minimal mix requirement. */
export const PASSWORD_MIN_LENGTH = 8;
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const adminPasswordSchema = passwordSchema.min(
  ADMIN_PASSWORD_MIN_LENGTH,
  `Admin passwords need at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
);

/** Lowercase, hyphenated slug from arbitrary text (ASCII fold, max 120 chars). */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}
