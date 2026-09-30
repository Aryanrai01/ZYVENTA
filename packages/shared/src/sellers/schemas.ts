import { z } from 'zod';
import { paginationQuerySchema } from '../api/pagination.js';
import {
  BUSINESS_TYPES,
  SELLER_APPLICATION_STATUSES,
  SELLER_ORDER_STATUSES,
  type BusinessType,
  type SellerApplicationStatus,
  type SellerStatus,
} from '../constants/statuses.js';
import type { IndianStateCode } from '../constants/india.js';
import { addressInputSchema } from '../shopper/account.js';
import { PATTERNS, emailSchema, indianMobileSchema, objectIdSchema } from '../validation/fields.js';
import type { ImageView } from '../catalog/types.js';

/** Pickup address: an address without address-book fields. */
export const pickupAddressSchema = addressInputSchema.omit({ label: true, isDefault: true });
export type PickupAddressInput = z.infer<typeof pickupAddressSchema>;

const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PATTERNS.gstin, 'Enter a valid 15-character GSTIN');

export const sellerApplicationInputSchema = z
  .object({
    storeName: z.string().trim().min(2, 'Use at least 2 characters').max(80),
    businessType: z.enum(BUSINESS_TYPES),
    legalName: z.string().trim().min(2).max(150),
    /** Optional only for individuals selling GST-exempt goods. */
    gstin: z.union([gstinSchema, z.literal('')]).default(''),
    contactPhone: indianMobileSchema,
    pickupAddress: pickupAddressSchema,
    intendedCategories: z.array(objectIdSchema).max(10).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.businessType !== 'INDIVIDUAL' && !v.gstin) {
      ctx.addIssue({
        code: 'custom',
        path: ['gstin'],
        message: 'GSTIN is required for businesses',
      });
    }
  });
export type SellerApplicationInput = z.infer<typeof sellerApplicationInputSchema>;
export type SellerApplicationFormValues = z.input<typeof sellerApplicationInputSchema>;

export interface SellerApplicationView {
  id: string;
  storeName: string;
  businessType: BusinessType;
  legalName: string;
  gstin: string | null;
  contactPhone: string;
  pickupAddress: PickupAddressInput & { state: IndianStateCode };
  status: SellerApplicationStatus;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  applicant?: { id: string; name: string; email: string };
}

export const sellerProfileUpdateSchema = z
  .object({
    description: z.string().trim().max(2000),
    supportEmail: z.union([emailSchema, z.literal('')]),
    supportPhone: z.union([indianMobileSchema, z.literal('')]),
    logo: z
      .object({
        url: z.string().regex(PATTERNS.imageUrl),
        publicId: z.string().max(255).optional(),
      })
      .strict()
      .nullable(),
    pickupAddress: pickupAddressSchema,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type SellerProfileUpdateInput = z.infer<typeof sellerProfileUpdateSchema>;

export const payoutAccountInputSchema = z
  .object({
    accountHolderName: z.string().trim().min(2).max(100),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, 'Account numbers have 9–18 digits'),
    ifsc: z.string().trim().toUpperCase().regex(PATTERNS.ifsc, 'Enter a valid IFSC'),
    bankName: z.string().trim().min(2).max(100),
  })
  .strict();
export type PayoutAccountInput = z.infer<typeof payoutAccountInputSchema>;

export interface SellerProfileView {
  id: string;
  storeName: string;
  slug: string;
  description: string;
  logo: ImageView | null;
  businessType: BusinessType;
  legalName: string;
  gstin: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  pickupAddress: PickupAddressInput;
  status: SellerStatus;
  statusReason: string | null;
  commissionBps: number;
  ratingAvg: number;
  ratingCount: number;
  /** Only the last 4 digits ever leave the server. */
  payoutAccount: {
    accountHolderName: string;
    accountNumberLast4: string;
    ifsc: string;
    bankName: string;
  } | null;
  approvedAt: string | null;
}

export const sellerOrderListQuerySchema = z
  .object({
    status: z.enum(SELLER_ORDER_STATUSES).optional(),
    q: z.string().trim().min(1).max(40).optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type SellerOrderListQuery = z.output<typeof sellerOrderListQuerySchema>;

export const analyticsRangeSchema = z
  .object({ days: z.coerce.number().int().min(7).max(365).default(30) })
  .strict();

export interface TimeSeriesPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface SellerDashboard {
  range: { days: number; from: string; to: string };
  revenue: number;
  orders: number;
  unitsSold: number;
  averageOrderValue: number;
  ordersByStatus: Partial<Record<(typeof SELLER_ORDER_STATUSES)[number], number>>;
  pendingReturns: number;
  products: { active: number; draft: number; inactive: number; blocked: number };
  lowStockVariants: number;
  outOfStockVariants: number;
  series: TimeSeriesPoint[];
  topProducts: { productId: string; name: string; slug: string; units: number; revenue: number }[];
  balance: { pending: number; available: number; paidOut: number };
}

export const applicationDecisionSchema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('APPROVE'),
      commissionBps: z.number().int().min(0).max(5000).optional(),
    })
    .strict(),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(5).max(1000) }).strict(),
]);
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>;

export const applicationListQuerySchema = z
  .object({
    status: z.enum(SELLER_APPLICATION_STATUSES).optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type ApplicationListQuery = z.output<typeof applicationListQuerySchema>;
