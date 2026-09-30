import { z } from 'zod';
import { paginationQuerySchema } from '../api/pagination.js';
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  RETURN_REASONS,
  RETURN_STATUSES,
  SELLER_ORDER_STATUSES,
  type OrderItemStatus,
  type OrderPaymentStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type RefundStatus,
  type ReturnReason,
  type ReturnStatus,
  type SellerOrderStatus,
  type VariantOptions,
} from '../constants/statuses.js';
import type { TransitionActor } from '../domain/state-machine.js';
import type { AddressView } from '../shopper/account.js';
import type { CartLineStatus } from '../shopper/cart.js';
import { objectIdSchema } from '../validation/fields.js';
import { couponCodeSchema } from './promotions.js';

// ── Checkout ─────────────────────────────────────────────────────────────────

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, 'Invalid Idempotency-Key');

export const checkoutInputSchema = z
  .object({
    addressId: objectIdSchema,
    couponCode: z.union([couponCodeSchema, z.literal('')]).optional(),
    /**
     * The total the shopper saw. Never used for pricing — if the server's fresh total differs,
     * the order is refused with PRICE_CHANGED so nobody pays an amount they didn't see.
     */
    expectedTotal: z.number().int().min(0).optional(),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const verifyPaymentSchema = z
  .object({
    razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
    razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
    razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export interface QuoteLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  options: VariantOptions;
  seller: { id: string; storeName: string };
  quantity: number;
  status: CartLineStatus;
  unitMrp: number;
  /** Catalogue price before automatic offers. */
  listPrice: number;
  /** Price after the best automatic offer. */
  unitPrice: number;
  offer: { id: string; title: string; discountPerUnit: number } | null;
  lineSubtotal: number;
  couponDiscount: number;
  lineTotal: number;
  gstRateBps: number;
  taxIncluded: number;
}

export interface QuoteShipment {
  seller: { id: string; storeName: string };
  itemCount: number;
  subtotal: number;
  couponDiscount: number;
  shippingFee: number;
  total: number;
}

export interface PricingBreakdown {
  mrpTotal: number;
  subtotal: number;
  couponDiscount: number;
  shippingFee: number;
  taxIncluded: number;
  total: number;
}

export interface CheckoutQuote {
  lines: QuoteLine[];
  shipments: QuoteShipment[];
  pricing: PricingBreakdown;
  /** Savings vs MRP including offers and coupon. */
  savings: number;
  coupon:
    | { code: string; status: 'APPLIED'; discount: number; title: string }
    | { code: string; status: 'INVALID'; message: string }
    | null;
  /** Checkout can proceed only when true (all lines purchasable, total > 0). */
  canPlaceOrder: boolean;
  address: AddressView | null;
}

export interface PaymentInit {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: 'INR';
  razorpayOrderId: string;
  /** Public key id — safe for the browser. The secret never leaves the server. */
  keyId: string;
  expiresAt: string;
  prefill: { name: string; email: string; contact: string };
}

// ── Orders (customer) ───────────────────────────────────────────────────────

export const orderListQuerySchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type OrderListQuery = z.output<typeof orderListQuerySchema>;

export const cancelInputSchema = z
  .object({ reason: z.string().trim().min(3, 'Tell us why').max(500) })
  .strict();
export type CancelInput = z.infer<typeof cancelInputSchema>;

export const returnInputSchema = z
  .object({
    orderItemId: objectIdSchema,
    quantity: z.number().int().min(1).max(10),
    reason: z.enum(RETURN_REASONS),
    comment: z.string().trim().max(1000).default(''),
  })
  .strict();
export type ReturnInput = z.infer<typeof returnInputSchema>;

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: number;
  itemCount: number;
  createdAt: string;
  previewImages: string[];
  previewNames: string[];
  shipmentStatuses: SellerOrderStatus[];
}

export interface StatusEvent<S extends string> {
  status: S;
  at: string;
  actor: TransitionActor;
  note: string | null;
}

export interface OrderItemView {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  sku: string;
  image: string | null;
  options: Record<string, string>;
  quantity: number;
  unitPrice: number;
  unitMrp: number;
  lineSubtotal: number;
  couponDiscount: number;
  lineTotal: number;
  taxIncluded: number;
  gstRateBps: number;
  status: OrderItemStatus;
  refundedAmount: number;
  returnedQuantity: number;
  returnable: boolean;
  returnWindowDays: number;
  isReviewed: boolean;
  /** Whether the customer can request a return right now. */
  canReturn: boolean;
  canReview: boolean;
}

export interface ShipmentView {
  id: string;
  subOrderNumber: string;
  seller: { id: string; storeName: string };
  status: SellerOrderStatus;
  history: StatusEvent<SellerOrderStatus>[];
  pricing: PricingBreakdown;
  items: OrderItemView[];
  tracking: {
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
  returnWindowEndsAt: string | null;
  canCancel: boolean;
}

export interface ReturnView {
  id: string;
  orderItemId: string;
  itemName: string;
  quantity: number;
  reason: ReturnReason;
  comment: string;
  status: ReturnStatus;
  resolutionNote: string | null;
  createdAt: string;
  history: StatusEvent<ReturnStatus>[];
}

export interface RefundView {
  id: string;
  amount: number;
  status: RefundStatus;
  reason: string;
  createdAt: string;
  processedAt: string | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  createdAt: string;
  placedAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  shippingAddress: Omit<AddressView, 'id' | 'label' | 'isDefault'>;
  contact: { email: string; phone: string };
  pricing: PricingBreakdown;
  refundedAmount: number;
  coupon: { code: string } | null;
  shipments: ShipmentView[];
  payment: {
    status: PaymentStatus;
    method: PaymentMethod | null;
    display: string | null;
    capturedAt: string | null;
  } | null;
  refunds: RefundView[];
  returns: ReturnView[];
  canCancel: boolean;
  canPay: boolean;
  customer?: { id: string; name: string; email: string };
}

// ── Seller fulfilment ───────────────────────────────────────────────────────

export const sellerOrderStatusUpdateSchema = z
  .object({
    status: z.enum(SELLER_ORDER_STATUSES),
    note: z.string().trim().max(500).optional(),
    carrier: z.string().trim().min(2).max(60).optional(),
    trackingNumber: z.string().trim().min(3).max(60).optional(),
    trackingUrl: z
      .string()
      .trim()
      .regex(/^https:\/\/\S+$/, 'Use an https:// link')
      .max(500)
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'SHIPPED' && (!v.carrier || !v.trackingNumber)) {
      ctx.addIssue({
        code: 'custom',
        path: ['trackingNumber'],
        message: 'Carrier and tracking number are required to ship',
      });
    }
    if (v.status === 'CANCELLED' && !v.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Give a cancellation reason' });
    }
  });
export type SellerOrderStatusUpdate = z.infer<typeof sellerOrderStatusUpdateSchema>;

export const returnDecisionSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED', 'PICKED_UP', 'RECEIVED']),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'REJECTED' && !v.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Explain why the return is rejected',
      });
    }
  });
export type ReturnDecisionInput = z.infer<typeof returnDecisionSchema>;

export const returnListQuerySchema = z
  .object({
    status: z.enum(RETURN_STATUSES).optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type ReturnListQuery = z.output<typeof returnListQuerySchema>;

export interface SellerOrderRow {
  id: string;
  subOrderNumber: string;
  orderNumber: string;
  status: SellerOrderStatus;
  itemCount: number;
  total: number;
  customerName: string;
  city: string;
  createdAt: string;
  previewImage: string | null;
  previewName: string;
}

export interface SellerOrderDetail extends ShipmentView {
  orderNumber: string;
  orderId: string;
  createdAt: string;
  customerName: string;
  shippingAddress: OrderDetail['shippingAddress'];
  /** Next statuses the seller may choose. */
  nextStatuses: SellerOrderStatus[];
  commissionAmount: number;
  payout: number;
  returns: ReturnView[];
}

export interface SellerReturnRow extends ReturnView {
  subOrderNumber: string;
  sellerOrderId: string;
  customerName: string;
  nextStatuses: ReturnStatus[];
}

export const adminOrderListQuerySchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
    q: z.string().trim().min(1).max(60).optional(),
    page: paginationQuerySchema.shape.page,
    limit: paginationQuerySchema.shape.limit,
  })
  .strict();
export type AdminOrderListQuery = z.output<typeof adminOrderListQuerySchema>;

export const adminRefundSchema = z
  .object({
    amount: z.number().int().min(100),
    note: z.string().trim().min(3).max(500),
  })
  .strict();
export type AdminRefundInput = z.infer<typeof adminRefundSchema>;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAYMENT_FAILED: 'Payment failed',
  EXPIRED: 'Expired',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const SELLER_ORDER_STATUS_LABELS: Record<SellerOrderStatus, string> = {
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  DAMAGED: 'Arrived damaged',
  DEFECTIVE: 'Defective or not working',
  WRONG_ITEM: 'Wrong item delivered',
  NOT_AS_DESCRIBED: 'Not as described',
  SIZE_ISSUE: 'Size or fit issue',
  QUALITY_ISSUE: 'Quality not as expected',
  CHANGED_MIND: 'Changed my mind',
  OTHER: 'Other',
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PICKED_UP: 'Picked up',
  RECEIVED: 'Received',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
};
