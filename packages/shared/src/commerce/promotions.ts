import { z } from 'zod';
import { paginationQuerySchema } from '../api/pagination.js';
import {
  COUPON_VISIBILITIES,
  DISCOUNT_TYPES,
  type CouponVisibility,
  type DiscountType,
  type PromotionOwner,
} from '../constants/statuses.js';
import { MAX_AMOUNT_PAISE, PATTERNS, objectIdSchema } from '../validation/fields.js';

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PATTERNS.couponCode, 'Coupon codes are 4–20 letters or digits');

const scopeSchema = z
  .object({
    categories: z.array(objectIdSchema).max(100).default([]),
    products: z.array(objectIdSchema).max(500).default([]),
    brands: z.array(objectIdSchema).max(100).default([]),
    sellers: z.array(objectIdSchema).max(100).default([]),
  })
  .strict();
export type PromotionScopeInput = z.infer<typeof scopeSchema>;

const dateSchema = z.coerce.date();
const paise = z.number().int().min(100).max(MAX_AMOUNT_PAISE);

const discountFields = {
  type: z.enum(DISCOUNT_TYPES),
  /** PERCENTAGE → whole percent 1–90; FIXED → paise. */
  value: z.number().int().min(1).max(MAX_AMOUNT_PAISE),
  maxDiscount: paise.nullable().default(null),
  startsAt: dateSchema,
  endsAt: dateSchema,
  isActive: z.boolean().default(true),
};

function checkDiscount(
  v: { type: DiscountType; value: number; startsAt: Date; endsAt: Date },
  ctx: z.RefinementCtx,
) {
  if (v.type === 'PERCENTAGE' && v.value > 90) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percentage cannot exceed 90%' });
  }
  if (v.type === 'FIXED' && v.value < 100) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Fixed discounts start at ₹1' });
  }
  if (v.endsAt <= v.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after start' });
  }
}

const couponObject = z
  .object({
    code: couponCodeSchema,
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).default(''),
    ...discountFields,
    minOrderAmount: z.number().int().min(0).max(MAX_AMOUNT_PAISE).default(0),
    usageLimit: z.number().int().min(1).max(10_000_000).nullable().default(null),
    perUserLimit: z.number().int().min(1).max(100).default(1),
    firstOrderOnly: z.boolean().default(false),
    visibility: z.enum(COUPON_VISIBILITIES).default('PUBLIC'),
    scope: scopeSchema.default({ categories: [], products: [], brands: [], sellers: [] }),
  })
  .strict();

export const couponInputSchema = couponObject.superRefine(checkDiscount);
export type CouponInput = z.infer<typeof couponInputSchema>;
export type CouponFormValues = z.input<typeof couponInputSchema>;

/** Code and counters can't change after creation (redemptions reference them). */
export const couponUpdateSchema = couponObject
  .omit({ code: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;

const offerObject = z
  .object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).default(''),
    ...discountFields,
    priority: z.number().int().min(0).max(100).default(0),
    scope: scopeSchema.default({ categories: [], products: [], brands: [], sellers: [] }),
  })
  .strict();
export const offerInputSchema = offerObject.superRefine(checkDiscount);
export type OfferInput = z.infer<typeof offerInputSchema>;
export type OfferFormValues = z.input<typeof offerInputSchema>;
export const offerUpdateSchema = offerObject
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type OfferUpdateInput = z.infer<typeof offerUpdateSchema>;

export const promotionListQuerySchema = z
  .object({
    status: z.enum(['active', 'scheduled', 'expired', 'disabled']).optional(),
    q: z.string().trim().min(1).max(40).optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type PromotionListQuery = z.output<typeof promotionListQuerySchema>;

export interface PromotionScopeView {
  categories: string[];
  products: string[];
  brands: string[];
  sellers: string[];
}

export interface CouponView {
  id: string;
  code: string;
  title: string;
  description: string;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  firstOrderOnly: boolean;
  visibility: CouponVisibility;
  fundedBy: PromotionOwner;
  isActive: boolean;
  scope: PromotionScopeView;
}

/** What shoppers see in "Available coupons". */
export interface PublicCoupon {
  code: string;
  title: string;
  description: string;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  endsAt: string;
}

export interface OfferView {
  id: string;
  title: string;
  description: string;
  owner: PromotionOwner;
  type: DiscountType;
  value: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  priority: number;
  isActive: boolean;
  scope: PromotionScopeView;
}

/** Human label, e.g. "10% off (up to ₹200)" — amounts formatted by the caller. */
export function describeDiscount(
  type: DiscountType,
  value: number,
  formatMoney: (paise: number) => string,
  maxDiscount?: number | null,
): string {
  if (type === 'FIXED') return `${formatMoney(value)} off`;
  return maxDiscount
    ? `${String(value)}% off (up to ${formatMoney(maxDiscount)})`
    : `${String(value)}% off`;
}
