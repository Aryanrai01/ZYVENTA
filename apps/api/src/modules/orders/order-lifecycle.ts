import type { SellerOrderStatus, TransitionActor } from '@zyventa/shared';
import type { ClientSession, Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { refreshProductAggregates } from '../products/product-aggregates.js';
import { ProductVariant } from '../products/product-variant.model.js';
import { OrderItem } from './order-item.model.js';
import { Order } from './order.model.js';
import { SellerOrder } from './seller-order.model.js';

export function historyEntry(
  status: string,
  role: TransitionActor,
  userId?: string | null,
  note?: string,
) {
  return {
    status,
    at: new Date(),
    actor: { role, user: userId ? new mongoose.Types.ObjectId(userId) : null },
    ...(note ? { note } : {}),
  };
}

/** Keeps listing fields (inStock, price range) in sync after stock/reservation changes. */
export async function refreshForVariants(
  variantIds: (Types.ObjectId | string)[],
  session: ClientSession,
): Promise<void> {
  const productIds = await ProductVariant.distinct('product', { _id: { $in: variantIds } }).session(
    session,
  );
  for (const productId of productIds) await refreshProductAggregates(productId, session);
}

/** Unpaid order: give back reserved units (guarded so `reserved` never goes negative). */
export async function releaseReservations(
  items: { variant: Types.ObjectId; quantity: number }[],
  session: ClientSession,
): Promise<void> {
  for (const item of items) {
    await ProductVariant.updateOne(
      { _id: item.variant, reserved: { $gte: item.quantity } },
      { $inc: { reserved: -item.quantity } },
      { session },
    );
  }
  await refreshForVariants(
    items.map((i) => i.variant),
    session,
  );
}

/**
 * Paid units coming back (cancellation / received return). Returns variant ids whose
 * available stock went from 0 to > 0, so the caller can trigger back-in-stock alerts.
 */
export async function restock(
  items: { variant: Types.ObjectId; quantity: number }[],
  session: ClientSession,
): Promise<Types.ObjectId[]> {
  const restocked: Types.ObjectId[] = [];
  for (const item of items) {
    const before = await ProductVariant.findOneAndUpdate(
      { _id: item.variant },
      { $inc: { stock: item.quantity } },
      { session, returnDocument: 'before' },
    )
      .select('stock reserved')
      .lean();
    if (before && before.stock - before.reserved <= 0) restocked.push(item.variant);
  }
  await refreshForVariants(
    items.map((i) => i.variant),
    session,
  );
  return restocked;
}

const DONE: SellerOrderStatus[] = [
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
  'REFUND_PENDING',
  'REFUNDED',
];
const CANCELLED_LIKE: SellerOrderStatus[] = ['CANCELLED'];

/**
 * Derives the parent order status from its shipments: COMPLETED once every shipment is
 * finished, CANCELLED when every shipment was cancelled (whether or not refunded yet).
 */
export async function syncOrderStatus(
  orderId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const shipments = await SellerOrder.find({ order: orderId })
    .select('status statusHistory')
    .session(session)
    .lean();
  if (shipments.length === 0) return;
  const wasCancelled = (s: (typeof shipments)[number]) =>
    CANCELLED_LIKE.includes(s.status) ||
    ((s.status === 'REFUND_PENDING' || s.status === 'REFUNDED') &&
      s.statusHistory.some((h) => h.status === 'CANCELLED'));
  const order = await Order.findById(orderId).select('status').session(session);
  if (!order || order.status !== 'CONFIRMED') return;
  if (shipments.every(wasCancelled)) {
    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    order.statusHistory.push(historyEntry('CANCELLED', 'SYSTEM', null, 'All shipments cancelled'));
    await order.save({ session });
  } else if (shipments.every((s) => DONE.includes(s.status))) {
    order.status = 'COMPLETED';
    order.statusHistory.push(historyEntry('COMPLETED', 'SYSTEM'));
    await order.save({ session });
  }
}

export async function itemsOf(sellerOrderId: Types.ObjectId, session: ClientSession) {
  return OrderItem.find({ sellerOrder: sellerOrderId }).session(session);
}
