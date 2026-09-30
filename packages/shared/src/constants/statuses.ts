/**
 * Every status/enum persisted in the database. The API's Mongoose schemas and the web app's
 * badges/filters both import from here, so a value can never exist on one side only.
 */

// ── Sellers ──────────────────────────────────────────────────────────────────
export const SELLER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const SELLER_APPLICATION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type SellerApplicationStatus = (typeof SELLER_APPLICATION_STATUSES)[number];

export const BUSINESS_TYPES = [
  'INDIVIDUAL',
  'PROPRIETORSHIP',
  'PARTNERSHIP',
  'LLP',
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

// ── Catalog ──────────────────────────────────────────────────────────────────
/** DRAFT: seller editing · ACTIVE: listed · INACTIVE: hidden by seller · BLOCKED: hidden by admin · ARCHIVED: soft-deleted */
export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Axes a product may vary on. A product uses up to 3 of them; simple products use none. */
export const VARIANT_OPTION_KEYS = [
  'color',
  'size',
  'storage',
  'ram',
  'material',
  'model',
] as const;
export type VariantOptionKey = (typeof VARIANT_OPTION_KEYS)[number];
export type VariantOptions = Partial<Record<VariantOptionKey, string>>;

// ── Addresses ────────────────────────────────────────────────────────────────
export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

// ── Orders ───────────────────────────────────────────────────────────────────
/** Parent order (one per checkout). Fulfilment detail lives on SellerOrder. */
export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'EXPIRED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

/** Per-seller shipment lifecycle. Transitions are governed by `order-status.ts`. */
export const SELLER_ORDER_STATUSES = [
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUND_PENDING',
  'REFUNDED',
] as const;
export type SellerOrderStatus = (typeof SELLER_ORDER_STATUSES)[number];

export const ORDER_ITEM_STATUSES = [
  'ACTIVE',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

// ── Payments & refunds ───────────────────────────────────────────────────────
export const PAYMENT_STATUSES = [
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  'card',
  'upi',
  'netbanking',
  'wallet',
  'emi',
  'paylater',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** How a payment's success was established — the client callback alone is never trusted. */
export const PAYMENT_VERIFICATION_SOURCES = [
  'CLIENT_CALLBACK',
  'WEBHOOK',
  'RECONCILIATION',
] as const;
export type PaymentVerificationSource = (typeof PAYMENT_VERIFICATION_SOURCES)[number];

export const REFUND_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'PICKED_UP',
  'RECEIVED',
  'REFUNDED',
  'CANCELLED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_REASONS = [
  'DAMAGED',
  'DEFECTIVE',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'SIZE_ISSUE',
  'QUALITY_ISSUE',
  'CHANGED_MIND',
  'OTHER',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

// ── Promotions ───────────────────────────────────────────────────────────────
export const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Who pays for a coupon discount — affects the seller's settlement. */
export const PROMOTION_OWNERS = ['PLATFORM', 'SELLER'] as const;
export type PromotionOwner = (typeof PROMOTION_OWNERS)[number];

export const COUPON_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type CouponVisibility = (typeof COUPON_VISIBILITIES)[number];

export const COUPON_REDEMPTION_STATUSES = ['RESERVED', 'CONSUMED', 'RELEASED'] as const;
export type CouponRedemptionStatus = (typeof COUPON_REDEMPTION_STATUSES)[number];

// ── Reviews & reports ────────────────────────────────────────────────────────
export const REVIEW_STATUSES = ['PUBLISHED', 'FLAGGED', 'HIDDEN', 'REMOVED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REPORT_TARGET_TYPES = ['PRODUCT', 'REVIEW', 'SELLER'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'COUNTERFEIT',
  'PROHIBITED_ITEM',
  'MISLEADING_INFORMATION',
  'OFFENSIVE_CONTENT',
  'SPAM',
  'FRAUD',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// ── Notifications & alerts ───────────────────────────────────────────────────
export const NOTIFICATION_TYPES = [
  'ORDER_CONFIRMED',
  'PAYMENT_SUCCESSFUL',
  'PAYMENT_FAILED',
  'ORDER_SHIPPED',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'REFUND_PROCESSED',
  'RETURN_UPDATE',
  'BACK_IN_STOCK',
  'SELLER_APPROVED',
  'SELLER_REJECTED',
  'NEW_SELLER_ORDER',
  'LOW_STOCK',
  'COUPON_AVAILABLE',
  'SECURITY_ALERT',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const STOCK_ALERT_STATUSES = ['ACTIVE', 'NOTIFIED', 'CANCELLED'] as const;
export type StockAlertStatus = (typeof STOCK_ALERT_STATUSES)[number];

// ── Auth & infrastructure ────────────────────────────────────────────────────
export const AUTH_TOKEN_TYPES = ['EMAIL_VERIFICATION', 'PASSWORD_RESET'] as const;
export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[number];

export const WEBHOOK_EVENT_STATUSES = ['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const IDEMPOTENCY_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const;
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

// ── Seller finance ───────────────────────────────────────────────────────────
/** Amounts are signed paise: SALE is credit (+), COMMISSION/REFUND/PAYOUT are debits (−). */
export const LEDGER_ENTRY_TYPES = [
  'SALE',
  'COMMISSION',
  'SELLER_COUPON',
  'REFUND',
  'PAYOUT',
  'ADJUSTMENT',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_ENTRY_STATUSES = ['PENDING', 'AVAILABLE', 'PAID', 'VOID'] as const;
export type LedgerEntryStatus = (typeof LEDGER_ENTRY_STATUSES)[number];

// ── Audit ────────────────────────────────────────────────────────────────────
export const AUDIT_RESOURCES = [
  'USER',
  'SELLER',
  'SELLER_APPLICATION',
  'PRODUCT',
  'PRODUCT_VARIANT',
  'CATEGORY',
  'BRAND',
  'ORDER',
  'SELLER_ORDER',
  'PAYMENT',
  'REFUND',
  'RETURN',
  'COUPON',
  'OFFER',
  'REVIEW',
  'REPORT',
  'SETTINGS',
] as const;
export type AuditResource = (typeof AUDIT_RESOURCES)[number];
