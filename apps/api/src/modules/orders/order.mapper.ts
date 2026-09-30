import {
  SELLER_ORDER_SHIPPED_STATES,
  sellerOrderStateMachine,
  type OrderDetail,
  type OrderItemView,
  type PricingBreakdown,
  type RefundView,
  type ReturnView,
  type SellerOrderStatus,
  type ShipmentView,
  type StatusEvent,
  type TransitionActor,
} from '@zyventa/shared';
import type { Types } from 'mongoose';
import type { PaymentAttrs } from '../payments/payment.model.js';
import type { RefundAttrs } from '../payments/refund.model.js';
import type { OrderItemAttrs } from './order-item.model.js';
import type { OrderAttrs } from './order.model.js';
import type { ReturnRequestAttrs } from './return-request.model.js';
import type { SellerOrderAttrs } from './seller-order.model.js';

type Id = { _id: Types.ObjectId };
export type OrderLean = OrderAttrs & Id;
export type SellerOrderLean = SellerOrderAttrs & Id;
export type OrderItemLean = OrderItemAttrs & Id;
export type PaymentLean = PaymentAttrs & Id;
export type RefundLean = RefundAttrs & Id;
export type ReturnLean = ReturnRequestAttrs & Id;

interface HistoryLike {
  status: string;
  at: Date;
  actor: { role: TransitionActor };
  note?: string | null;
}

export function toHistory<S extends string>(history: HistoryLike[]): StatusEvent<S>[] {
  return history.map((h) => ({
    status: h.status as S,
    at: h.at.toISOString(),
    actor: h.actor.role,
    note: h.note ?? null,
  }));
}

export function toPricing(p: PricingBreakdown): PricingBreakdown {
  return {
    mrpTotal: p.mrpTotal,
    subtotal: p.subtotal,
    couponDiscount: p.couponDiscount,
    shippingFee: p.shippingFee,
    taxIncluded: p.taxIncluded,
    total: p.total,
  };
}

const OPEN_RETURN = new Set(['REQUESTED', 'APPROVED', 'PICKED_UP', 'RECEIVED']);

export function toItemView(
  item: OrderItemLean,
  shipment: Pick<SellerOrderLean, 'status' | 'returnWindowEndsAt'>,
  openReturnItemIds: Set<string>,
  now = new Date(),
): OrderItemView {
  const delivered = shipment.status === 'DELIVERED' || shipment.status === 'RETURN_REQUESTED';
  const withinWindow = Boolean(shipment.returnWindowEndsAt && shipment.returnWindowEndsAt > now);
  const remaining = item.quantity - item.returnedQuantity;
  const options: Record<string, string> = {};
  const raw = item.snapshot.options as unknown;
  const entries =
    raw instanceof Map
      ? [...(raw as Map<string, string>).entries()]
      : Object.entries((raw as Record<string, string> | null) ?? {});
  for (const [k, v] of entries) if (v) options[k] = v;
  return {
    id: item._id.toString(),
    productId: item.product.toString(),
    variantId: item.variant.toString(),
    name: item.snapshot.name,
    slug: item.snapshot.slug,
    sku: item.snapshot.sku,
    image: item.snapshot.image ?? null,
    options,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitMrp: item.unitMrp,
    lineSubtotal: item.lineSubtotal,
    couponDiscount: item.couponDiscount,
    lineTotal: item.lineTotal,
    taxIncluded: item.taxIncluded,
    gstRateBps: item.gstRateBps,
    status: item.status,
    refundedAmount: item.refundedAmount,
    returnedQuantity: item.returnedQuantity,
    returnable: item.returnable,
    returnWindowDays: item.returnWindowDays,
    isReviewed: item.isReviewed,
    canReturn:
      delivered &&
      withinWindow &&
      item.returnable &&
      remaining > 0 &&
      item.status !== 'CANCELLED' &&
      !openReturnItemIds.has(item._id.toString()),
    canReview:
      !item.isReviewed &&
      ['DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'REFUND_PENDING', 'REFUNDED'].includes(
        shipment.status,
      ),
  };
}

export function customerCanCancel(status: SellerOrderStatus): boolean {
  return sellerOrderStateMachine.canTransition(status, 'CANCELLED', 'CUSTOMER');
}

export function toShipmentView(
  so: SellerOrderLean,
  items: OrderItemLean[],
  storeName: string,
  openReturnItemIds: Set<string>,
): ShipmentView {
  return {
    id: so._id.toString(),
    subOrderNumber: so.subOrderNumber,
    seller: { id: so.seller.toString(), storeName },
    status: so.status,
    history: toHistory<SellerOrderStatus>(so.statusHistory),
    pricing: toPricing(so.pricing),
    items: items.map((i) => toItemView(i, so, openReturnItemIds)),
    tracking: trackingOf(so),
    returnWindowEndsAt: so.returnWindowEndsAt ? so.returnWindowEndsAt.toISOString() : null,
    canCancel: Boolean(so.paidAt) && customerCanCancel(so.status),
  };
}

interface ShipmentLike {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
}

/** `shipment` starts as `{}`, which Mongoose minimises away on save — read it defensively. */
function trackingOf(so: SellerOrderLean): ShipmentView['tracking'] {
  const shipment = so.shipment as ShipmentLike | undefined;
  return {
    carrier: shipment?.carrier ?? null,
    trackingNumber: shipment?.trackingNumber ?? null,
    trackingUrl: shipment?.trackingUrl ?? null,
    shippedAt: shipment?.shippedAt ? shipment.shippedAt.toISOString() : null,
    deliveredAt: shipment?.deliveredAt ? shipment.deliveredAt.toISOString() : null,
  };
}

export function toReturnView(r: ReturnLean, itemName: string): ReturnView {
  return {
    id: r._id.toString(),
    orderItemId: r.orderItem.toString(),
    itemName,
    quantity: r.quantity,
    reason: r.reason,
    comment: r.comment,
    status: r.status,
    resolutionNote: r.resolutionNote ?? null,
    createdAt: r.createdAt.toISOString(),
    history: toHistory(r.statusHistory as HistoryLike[]),
  };
}

export function toRefundView(r: RefundLean): RefundView {
  return {
    id: r._id.toString(),
    amount: r.amount,
    status: r.status,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    processedAt: r.processedAt ? r.processedAt.toISOString() : null,
  };
}

export function openReturnIds(returns: ReturnLean[]): Set<string> {
  return new Set(
    returns.filter((r) => OPEN_RETURN.has(r.status)).map((r) => r.orderItem.toString()),
  );
}

export function paymentDisplay(p: PaymentLean | null): OrderDetail['payment'] {
  if (!p) return null;
  const d = p.display;
  const display = d?.cardLast4
    ? `${d.cardNetwork ?? 'Card'} •••• ${d.cardLast4}`
    : (d?.bank ?? d?.wallet ?? null);
  return {
    status: p.status,
    method: p.method ?? null,
    display,
    capturedAt: p.capturedAt ? p.capturedAt.toISOString() : null,
  };
}

export function toOrderDetail(input: {
  order: OrderLean;
  sellerOrders: SellerOrderLean[];
  items: OrderItemLean[];
  payment: PaymentLean | null;
  refunds: RefundLean[];
  returns: ReturnLean[];
  storeNames: Map<string, string>;
  customer?: { id: string; name: string; email: string };
}): OrderDetail {
  const { order, sellerOrders, items, payment, refunds, returns, storeNames } = input;
  const openReturns = openReturnIds(returns);
  const itemNames = new Map(items.map((i) => [i._id.toString(), i.snapshot.name]));
  const shipments = sellerOrders.map((so) =>
    toShipmentView(
      so,
      items.filter((i) => i.sellerOrder.equals(so._id)),
      storeNames.get(so.seller.toString()) ?? '',
      openReturns,
    ),
  );
  const a = order.shippingAddress;
  const now = new Date();
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt.toISOString(),
    placedAt: order.placedAt ? order.placedAt.toISOString() : null,
    expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    cancelReason: order.cancelReason ?? null,
    shippingAddress: {
      fullName: a.fullName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      landmark: a.landmark,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      country: 'IN',
    },
    contact: { email: order.contact?.email ?? '', phone: order.contact?.phone ?? '' },
    pricing: toPricing(order.pricing),
    refundedAmount: order.refundedAmount,
    coupon: order.coupon?.code ? { code: order.coupon.code } : null,
    shipments,
    payment: paymentDisplay(payment),
    refunds: refunds.map(toRefundView),
    returns: returns.map((r) => toReturnView(r, itemNames.get(r.orderItem.toString()) ?? '')),
    canCancel:
      order.status === 'PENDING_PAYMENT' ||
      (order.status === 'CONFIRMED' && shipments.some((s) => s.canCancel)),
    canPay: order.status === 'PENDING_PAYMENT' && Boolean(order.expiresAt && order.expiresAt > now),
    ...(input.customer ? { customer: input.customer } : {}),
  };
}

export { SELLER_ORDER_SHIPPED_STATES };
