import { z } from 'zod';
import { paginationQuerySchema } from '../api/pagination.js';
import {
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
  type NotificationType,
  type ReviewStatus,
  type StockAlertStatus,
} from '../constants/statuses.js';
import { objectIdSchema } from '../validation/fields.js';

// ── Reviews ──────────────────────────────────────────────────────────────────

export const reviewInputSchema = z
  .object({
    orderItemId: objectIdSchema,
    rating: z.number().int().min(1, 'Choose a rating').max(5),
    title: z.string().trim().max(120).default(''),
    body: z.string().trim().max(5000).default(''),
  })
  .strict();
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewFormValues = z.input<typeof reviewInputSchema>;

export const reviewUpdateSchema = reviewInputSchema
  .omit({ orderItemId: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type ReviewUpdateInput = z.infer<typeof reviewUpdateSchema>;

export const REVIEW_SORTS = ['newest', 'highest', 'lowest', 'helpful'] as const;
export const reviewListQuerySchema = z
  .object({
    sort: z.enum(REVIEW_SORTS).default('newest'),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    page: paginationQuerySchema.shape.page,
    limit: z.coerce.number().int().min(1).max(30).default(10),
  })
  .strict();
export type ReviewListQuery = z.output<typeof reviewListQuerySchema>;

export const sellerResponseSchema = z.object({ body: z.string().trim().min(2).max(2000) }).strict();

export interface ReviewView {
  id: string;
  rating: number;
  title: string;
  body: string;
  authorName: string;
  isVerifiedPurchase: boolean;
  variantLabel: string | null;
  createdAt: string;
  editedAt: string | null;
  sellerResponse: { body: string; at: string } | null;
  helpfulCount: number;
  isMine?: boolean;
}

export interface RatingSummary {
  average: number;
  count: number;
  /** Counts for 5★ … 1★ (index 0 = 5 stars). */
  distribution: [number, number, number, number, number];
}

export interface AdminReviewRow extends ReviewView {
  status: ReviewStatus;
  reportCount: number;
  product: { id: string; name: string; slug: string };
}

export const reviewModerationSchema = z
  .object({
    status: z.enum(['PUBLISHED', 'HIDDEN', 'REMOVED']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type ReviewModerationInput = z.infer<typeof reviewModerationSchema>;

// ── Reports ──────────────────────────────────────────────────────────────────

export const reportInputSchema = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: objectIdSchema,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(1000).default(''),
  })
  .strict();
export type ReportInput = z.infer<typeof reportInputSchema>;

export const reportResolutionSchema = z
  .object({
    status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']),
    action: z
      .enum(['NONE', 'CONTENT_REMOVED', 'PRODUCT_BLOCKED', 'SELLER_WARNED', 'SELLER_SUSPENDED'])
      .default('NONE'),
    note: z.string().trim().max(1000).default(''),
  })
  .strict();
export type ReportResolutionInput = z.infer<typeof reportResolutionSchema>;

// ── Notifications & stock alerts ────────────────────────────────────────────

export const notificationListQuerySchema = z
  .object({
    unread: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type NotificationListQuery = z.output<typeof notificationListQuerySchema>;

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const stockAlertInputSchema = z.object({ variantId: objectIdSchema }).strict();
export type StockAlertInput = z.infer<typeof stockAlertInputSchema>;

export interface StockAlertView {
  id: string;
  variantId: string;
  status: StockAlertStatus;
  product: { id: string; name: string; slug: string; image: string | null };
  options: Record<string, string>;
  inStock: boolean;
  createdAt: string;
}
