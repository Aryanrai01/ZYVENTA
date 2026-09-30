import {
  ERROR_CODES,
  buildPaginationMeta,
  sellerOrderStateMachine,
  type CancelInput,
  type OrderDetail,
  type OrderListItem,
  type OrderListQuery,
  type ReturnInput,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { recordAudit } from '../audit/audit.service.js';
import type { CheckoutService } from '../checkout/checkout.service.js';
import { notify } from '../notifications/notification.service.js';
import type { RefundService } from '../payments/refund.service.js';
import { notifyBackInStock } from '../stock-alerts/back-in-stock.js';
import { SellerLedgerEntry } from '../sellers/seller-ledger-entry.model.js';
import { Seller } from '../sellers/seller.model.js';
import { historyEntry, restock, syncOrderStatus } from './order-lifecycle.js';
import { OrderItem } from './order-item.model.js';
import { loadOrderDetail } from './order-query.js';
import { Order } from './order.model.js';
import { ReturnRequest } from './return-request.model.js';
import { SellerOrder } from './seller-order.model.js';

const oid = (id: string) => new mongoose.Types.ObjectId(id);

/**
 * Cancels one paid shipment: items back to stock, shipment → CANCELLED → REFUND_PENDING,
 * then a refund for what was paid for it (items − coupon share + its shipping fee).
 * Shared by customer, seller and admin cancellations.
 */
export async function cancelPaidShipment(input: {
  sellerOrderId: Types.ObjectId;
  actor: { role: 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SYSTEM'; userId: string | null };
  reason: string;
  refunds: RefundService;
  req?: Request | null;
}): Promise<void> {
  const outcome = await mongoose.connection.transaction(async (session) => {
    const so = await SellerOrder.findById(input.sellerOrderId).session(session);
    if (!so?.paidAt) throw ApiError.notFound('Shipment not found');
    if (!sellerOrderStateMachine.canTransition(so.status, 'CANCELLED', input.actor.role)) {
      throw new ApiError(
        409,
        ERROR_CODES.INVALID_TRANSITION,
        'This shipment can no longer be cancelled',
      );
    }
    const items = await OrderItem.find({ sellerOrder: so._id, status: 'ACTIVE' }).session(session);
    const restocked = await restock(
      items.map((i) => ({ variant: i.variant, quantity: i.quantity })),
      session,
    );
    await OrderItem.updateMany(
      { _id: { $in: items.map((i) => i._id) } },
      { $set: { status: 'CANCELLED' } },
      { session },
    );
    so.status = 'CANCELLED';
    so.cancelReason = input.reason;
    so.statusHistory.push(
      historyEntry('CANCELLED', input.actor.role, input.actor.userId, input.reason),
    );
    const refundAmount =
      items.reduce((s, i) => s + i.lineTotal - i.refundedAmount, 0) + so.pricing.shippingFee;
    if (refundAmount > 0) {
      so.status = 'REFUND_PENDING';
      so.statusHistory.push(historyEntry('REFUND_PENDING', 'SYSTEM'));
    }
    await so.save({ session });
    // Seller entries for this shipment will never be earned.
    await SellerLedgerEntry.updateMany(
      {
        sellerOrder: so._id,
        type: { $in: ['SALE', 'COMMISSION', 'SELLER_COUPON'] },
        status: 'PENDING',
      },
      { $set: { status: 'VOID' } },
      { session },
    );
    await syncOrderStatus(so.order, session);
    if (input.req) {
      await recordAudit(
        input.req,
        {
          action: 'seller_order.cancelled',
          resource: 'SELLER_ORDER',
          resourceId: so._id.toString(),
          metadata: { reason: input.reason, refundAmount },
          actorRole: input.actor.role,
        },
        session,
      );
    }
    return {
      so,
      refundAmount,
      restocked,
      itemAmounts: items.map((i) => ({ itemId: i._id, amount: i.lineTotal - i.refundedAmount })),
    };
  });

  for (const variant of outcome.restocked) void notifyBackInStock(variant);
  const { so } = outcome;
  if (outcome.refundAmount > 0) {
    await input.refunds.refund({
      orderId: so.order,
      sellerOrderId: so._id,
      orderItemIds: outcome.itemAmounts.map((a) => a.itemId),
      itemAmounts: outcome.itemAmounts.filter((a) => a.amount > 0),
      amount: outcome.refundAmount,
      reason: 'ORDER_CANCELLED',
      note: input.reason,
      actor: input.actor,
      idempotencyKey: `cancel_${so._id.toString()}`,
    });
  }
  await notify({
    user: so.user,
    type: 'ORDER_CANCELLED',
    title: `Shipment ${so.subOrderNumber} cancelled`,
    body: outcome.refundAmount > 0 ? 'Your refund has been started.' : input.reason,
    link: `/orders/${so.order.toString()}`,
    dedupeKey: `cancelled:${so._id.toString()}`,
  });
  if (input.actor.role !== 'SELLER') {
    const seller = await Seller.findById(so.seller).select('user').lean();
    if (seller) {
      await notify({
        user: seller.user,
        type: 'ORDER_CANCELLED',
        title: `Order ${so.subOrderNumber} was cancelled`,
        body: input.reason,
        link: `/seller/orders/${so._id.toString()}`,
        dedupeKey: `seller-cancelled:${so._id.toString()}`,
      });
    }
  }
}

export function createOrderService(deps: { checkout: CheckoutService; refunds: RefundService }) {
  return {
    async list(userId: string, query: OrderListQuery) {
      const filter = { user: oid(userId), ...(query.status ? { status: query.status } : {}) };
      const [total, orders] = await Promise.all([
        Order.countDocuments(filter),
        Order.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .select('orderNumber status paymentStatus pricing itemCount createdAt')
          .lean(),
      ]);
      const ids = orders.map((o) => o._id);
      const [items, shipments] = await Promise.all([
        OrderItem.find({ order: { $in: ids } })
          .select('order snapshot.name snapshot.image')
          .lean(),
        SellerOrder.find({ order: { $in: ids } })
          .select('order status')
          .lean(),
      ]);
      const list: OrderListItem[] = orders.map((o) => {
        const own = items.filter((i) => i.order.equals(o._id));
        return {
          id: o._id.toString(),
          orderNumber: o.orderNumber,
          status: o.status,
          paymentStatus: o.paymentStatus,
          total: o.pricing.total,
          itemCount: o.itemCount,
          createdAt: o.createdAt.toISOString(),
          previewImages: own
            .slice(0, 4)
            .flatMap((i) => (i.snapshot.image ? [i.snapshot.image] : [])),
          previewNames: own.slice(0, 3).map((i) => i.snapshot.name),
          shipmentStatuses: shipments.filter((s) => s.order.equals(o._id)).map((s) => s.status),
        };
      });
      return { items: list, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    detail(userId: string, orderId: string): Promise<OrderDetail> {
      return loadOrderDetail({ _id: oid(orderId), user: oid(userId) });
    },

    /** Cancels an unpaid order, or every still-cancellable shipment of a paid one. */
    async cancel(
      req: Request,
      userId: string,
      orderId: string,
      input: CancelInput,
    ): Promise<OrderDetail> {
      const order = await Order.findOne({ _id: orderId, user: userId }).lean();
      if (!order) throw ApiError.notFound('Order not found');
      if (order.status === 'PENDING_PAYMENT') {
        await deps.checkout.releaseOrder(
          order._id,
          'CANCELLED',
          { role: 'CUSTOMER', userId },
          input.reason,
        );
      } else if (order.status === 'CONFIRMED') {
        const shipments = await SellerOrder.find({ order: order._id }).select('status').lean();
        const cancellable = shipments.filter((s) =>
          sellerOrderStateMachine.canTransition(s.status, 'CANCELLED', 'CUSTOMER'),
        );
        if (cancellable.length === 0) {
          throw new ApiError(
            409,
            ERROR_CODES.INVALID_TRANSITION,
            'Your order has already been packed and can’t be cancelled. You can return it after delivery.',
          );
        }
        for (const s of cancellable) {
          await cancelPaidShipment({
            sellerOrderId: s._id,
            actor: { role: 'CUSTOMER', userId },
            reason: input.reason,
            refunds: deps.refunds,
            req,
          });
        }
      } else {
        throw new ApiError(409, ERROR_CODES.INVALID_TRANSITION, 'This order can’t be cancelled');
      }
      return loadOrderDetail({ _id: order._id, user: oid(userId) });
    },

    async cancelShipment(
      req: Request,
      userId: string,
      orderId: string,
      sellerOrderId: string,
      input: CancelInput,
    ): Promise<OrderDetail> {
      const so = await SellerOrder.findOne({ _id: sellerOrderId, order: orderId, user: userId })
        .select('_id')
        .lean();
      if (!so) throw ApiError.notFound('Shipment not found');
      await cancelPaidShipment({
        sellerOrderId: so._id,
        actor: { role: 'CUSTOMER', userId },
        reason: input.reason,
        refunds: deps.refunds,
        req,
      });
      return loadOrderDetail({ _id: oid(orderId), user: oid(userId) });
    },

    async requestReturn(
      req: Request,
      userId: string,
      orderId: string,
      input: ReturnInput,
    ): Promise<OrderDetail> {
      await mongoose.connection.transaction(async (session) => {
        const item = await OrderItem.findOne({
          _id: input.orderItemId,
          order: orderId,
          user: userId,
        }).session(session);
        if (!item) throw ApiError.notFound('Item not found');
        const so = await SellerOrder.findById(item.sellerOrder).session(session);
        if (!so) throw ApiError.notFound('Shipment not found');
        const now = new Date();
        if (!['DELIVERED', 'RETURN_REQUESTED'].includes(so.status)) {
          throw new ApiError(409, ERROR_CODES.RETURN_NOT_ALLOWED, 'Returns open after delivery');
        }
        if (!item.returnable)
          throw new ApiError(409, ERROR_CODES.RETURN_NOT_ALLOWED, 'This item is not returnable');
        if (!so.returnWindowEndsAt || so.returnWindowEndsAt < now) {
          throw new ApiError(
            409,
            ERROR_CODES.RETURN_NOT_ALLOWED,
            'The return window for this item has closed',
          );
        }
        if (input.quantity > item.quantity - item.returnedQuantity) {
          throw new ApiError(
            409,
            ERROR_CODES.RETURN_NOT_ALLOWED,
            'You can’t return more units than you bought',
          );
        }
        try {
          await ReturnRequest.create(
            [
              {
                orderItem: item._id,
                order: item.order,
                sellerOrder: so._id,
                user: userId,
                seller: so.seller,
                quantity: input.quantity,
                reason: input.reason,
                comment: input.comment,
                statusHistory: [historyEntry('REQUESTED', 'CUSTOMER', userId)],
              },
            ],
            { session },
          );
        } catch (error) {
          if ((error as { code?: number }).code === 11000)
            throw ApiError.conflict('A return for this item is already open');
          throw error;
        }
        item.status = 'RETURN_REQUESTED';
        await item.save({ session });
        if (so.status === 'DELIVERED') {
          so.status = 'RETURN_REQUESTED';
          so.statusHistory.push(historyEntry('RETURN_REQUESTED', 'CUSTOMER', userId));
          await so.save({ session });
        }
        await recordAudit(
          req,
          {
            action: 'return.requested',
            resource: 'RETURN',
            resourceId: item._id.toString(),
            metadata: { reason: input.reason, quantity: input.quantity },
            actorRole: 'CUSTOMER',
          },
          session,
        );
        const seller = await Seller.findById(so.seller).select('user').session(session).lean();
        if (seller) {
          await notify(
            {
              user: seller.user,
              type: 'RETURN_UPDATE',
              title: `Return requested on ${so.subOrderNumber}`,
              body: `${item.snapshot.name} × ${String(input.quantity)}`,
              link: '/seller/returns',
            },
            session,
          );
        }
      });
      return loadOrderDetail({ _id: oid(orderId), user: oid(userId) });
    },

    async cancelReturn(userId: string, orderId: string, returnId: string): Promise<OrderDetail> {
      await mongoose.connection.transaction(async (session) => {
        const ret = await ReturnRequest.findOne({
          _id: returnId,
          order: orderId,
          user: userId,
        }).session(session);
        if (!ret) throw ApiError.notFound('Return not found');
        if (!['REQUESTED', 'APPROVED'].includes(ret.status)) {
          throw new ApiError(
            409,
            ERROR_CODES.INVALID_TRANSITION,
            'This return can no longer be cancelled',
          );
        }
        ret.status = 'CANCELLED';
        ret.statusHistory.push(historyEntry('CANCELLED', 'CUSTOMER', userId));
        await ret.save({ session });
        await settleAfterReturnClosed(ret.orderItem, ret.sellerOrder, session);
      });
      return loadOrderDetail({ _id: oid(orderId), user: oid(userId) });
    },
  };
}

/** After a return is rejected/cancelled: item back to ACTIVE, shipment back to DELIVERED if no returns remain open. */
export async function settleAfterReturnClosed(
  orderItemId: Types.ObjectId,
  sellerOrderId: Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<void> {
  const item = await OrderItem.findById(orderItemId).session(session);
  if (item?.status === 'RETURN_REQUESTED') {
    item.status = item.returnedQuantity > 0 ? 'RETURNED' : 'ACTIVE';
    await item.save({ session });
  }
  const open = await ReturnRequest.exists({
    sellerOrder: sellerOrderId,
    status: { $in: ['REQUESTED', 'APPROVED', 'PICKED_UP', 'RECEIVED'] },
  }).session(session);
  if (open) return;
  const so = await SellerOrder.findById(sellerOrderId).session(session);
  if (so?.status === 'RETURN_REQUESTED') {
    so.status = 'DELIVERED';
    so.statusHistory.push(historyEntry('DELIVERED', 'SYSTEM', null, 'No open returns'));
    await so.save({ session });
  }
}

export type OrderService = ReturnType<typeof createOrderService>;
