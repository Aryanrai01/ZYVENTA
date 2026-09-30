import { z } from 'zod';
import { paginationQuerySchema } from '../api/pagination.js';
import { ROLES, type Role, type UserStatus } from '../constants/roles.js';
import {
  AUDIT_RESOURCES,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  PRODUCT_STATUSES,
  REPORT_STATUSES,
  REVIEW_STATUSES,
  SELLER_STATUSES,
  type ProductStatus,
  type SellerStatus,
} from '../constants/statuses.js';
import { MAX_AMOUNT_PAISE } from '../validation/fields.js';
import type { TimeSeriesPoint } from '../sellers/schemas.js';

const page = paginationQuerySchema.shape.page;
const limit = paginationQuerySchema.shape.limit;
const search = z.string().trim().min(1).max(80).optional();

export const adminUserListQuerySchema = z
  .object({
    q: search,
    role: z.enum(ROLES).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    page,
    limit,
  })
  .strict();
export type AdminUserListQuery = z.output<typeof adminUserListQuerySchema>;

export const userStatusUpdateSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'SUSPENDED' && !v.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason for suspension' });
    }
  });
export type UserStatusUpdate = z.infer<typeof userStatusUpdateSchema>;

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: Role[];
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  orderCount: number;
}

export const adminSellerListQuerySchema = z
  .object({ q: search, status: z.enum(SELLER_STATUSES).optional(), page, limit })
  .strict();
export type AdminSellerListQuery = z.output<typeof adminSellerListQuerySchema>;

export const sellerStatusUpdateSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
    reason: z.string().trim().max(500).optional(),
    commissionBps: z.number().int().min(0).max(5000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status !== 'ACTIVE' && !v.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason' });
    }
  });
export type SellerStatusUpdate = z.infer<typeof sellerStatusUpdateSchema>;

export interface AdminSellerRow {
  id: string;
  storeName: string;
  slug: string;
  legalName: string;
  gstin: string | null;
  status: SellerStatus;
  statusReason: string | null;
  commissionBps: number;
  owner: { id: string; name: string; email: string };
  productCount: number;
  createdAt: string;
}

export const adminProductListQuerySchema = z
  .object({ q: search, status: z.enum(PRODUCT_STATUSES).optional(), page, limit })
  .strict();
export type AdminProductListQuery = z.output<typeof adminProductListQuerySchema>;

export const productModerationSchema = z
  .object({
    action: z.enum(['BLOCK', 'UNBLOCK', 'FEATURE', 'UNFEATURE']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action === 'BLOCK' && !v.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason for blocking' });
    }
  });
export type ProductModerationInput = z.infer<typeof productModerationSchema>;

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  status: ProductStatus;
  statusReason: string | null;
  isFeatured: boolean;
  priceMin: number;
  seller: { id: string; storeName: string };
  category: string;
  soldCount: number;
  updatedAt: string;
}

export const adminReviewListQuerySchema = z
  .object({
    status: z.enum(REVIEW_STATUSES).optional(),
    reported: z.enum(['true']).optional(),
    page,
    limit,
  })
  .strict();
export type AdminReviewListQuery = z.output<typeof adminReviewListQuerySchema>;

export const adminReportListQuerySchema = z
  .object({ status: z.enum(REPORT_STATUSES).optional(), page, limit })
  .strict();
export type AdminReportListQuery = z.output<typeof adminReportListQuerySchema>;

export const auditListQuerySchema = z
  .object({
    resource: z.enum(AUDIT_RESOURCES).optional(),
    action: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z_.]+$/)
      .optional(),
    page,
    limit,
  })
  .strict();
export type AuditListQuery = z.output<typeof auditListQuerySchema>;

export interface AuditRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  actor: { id: string; name: string; email: string } | null;
  actorRole: string;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export const paymentListQuerySchema = z
  .object({ status: z.enum(PAYMENT_STATUSES).optional(), page, limit })
  .strict();
export const refundListQuerySchema = z
  .object({ status: z.enum(REFUND_STATUSES).optional(), page, limit })
  .strict();

export const platformSettingsSchema = z
  .object({
    shipping: z
      .object({
        freeShippingThreshold: z.number().int().min(0).max(MAX_AMOUNT_PAISE),
        flatFeePerShipment: z.number().int().min(0).max(100_000),
      })
      .strict(),
    checkout: z.object({ paymentWindowMinutes: z.number().int().min(5).max(60) }).strict(),
    returns: z.object({ defaultWindowDays: z.number().int().min(0).max(30) }).strict(),
    commission: z.object({ defaultBps: z.number().int().min(0).max(5000) }).strict(),
    maintenance: z.object({ enabled: z.boolean(), message: z.string().trim().max(300) }).strict(),
    support: z
      .object({
        email: z.union([z.email(), z.literal('')]),
        phone: z.string().trim().max(20),
      })
      .strict(),
  })
  .partial()
  .strict();
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;

export interface PlatformSettingsView {
  shipping: { freeShippingThreshold: number; flatFeePerShipment: number };
  checkout: { paymentWindowMinutes: number };
  returns: { defaultWindowDays: number };
  commission: { defaultBps: number };
  maintenance: { enabled: boolean; message: string };
  support: { email: string; phone: string };
  updatedAt: string | null;
}

/** Settings safe to expose publicly (GET /settings). */
export type PublicSettings = Pick<PlatformSettingsView, 'shipping' | 'maintenance' | 'support'>;

export interface AdminDashboard {
  range: { days: number; from: string; to: string };
  gmv: number;
  orders: number;
  averageOrderValue: number;
  refunds: number;
  newUsers: number;
  totalUsers: number;
  activeSellers: number;
  pendingApplications: number;
  openReports: number;
  flaggedReviews: number;
  activeProducts: number;
  series: TimeSeriesPoint[];
  topCategories: { name: string; revenue: number; units: number }[];
  topSellers: { id: string; storeName: string; revenue: number; orders: number }[];
}
