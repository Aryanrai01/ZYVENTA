import {
  ERROR_CODES,
  applyBps,
  buildPaginationMeta,
  returnStateMachine,
  sellerOrderStateMachine,
  type ReturnDecisionInput,
  type ReturnListQuery,
  type SellerOrderDetail,
  type SellerOrderListQuery,
  type SellerOrderRow,
  type SellerOrderStatusUpdate,
  type SellerReturnRow,
  type TransitionActor,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/cache.js';
import { recordAudit } from '../audit/audit.service.js';
import { formatRupees, orderUpdateEmail } from '../email/commerce-templates.js';
import { notify } from '../notifications/notification.service.js';
import type { RefundService } from '../payments/refund.service.js';
import { SellerLedgerEntry } from '../sellers/seller-ledger-entry.model.js';
import { notifyBackInStock } from '../stock-alerts/back-in-stock.js';
import { historyEntry, restock, syncOrderStatus } from './order-lifecycle.js';
import {
  openReturnIds,
  toHistory,
  toReturnView,
  toShipmentView,
  type OrderItemLean,
  type ReturnLean,
  type SellerOrderLean,
} from './order.mapper.js';
import { OrderItem } from './order-item.model.js';
import { storeNameMap } from './order-query.js';
import { Order } from './order.model.js';
import { cancelPaidShipment, settleAfterReturnClosed } from './order.service.js';
import { ReturnRequest } from './return-request.model.js';
import { SellerOrder } from './seller-order.model.js';

const oid = (id: string) => new mongoose.Types.ObjectId(id);

/** Scope: a seller sees only their own paid shipments; the admin sees everything. */
export type FulfilmentScope = { role: 'SELLER'; sellerId: string } | { role: 'ADMIN' };

function scopeFilter(scope: FulfilmentScope): Record<string, unknown> {
  return scope.role === 'SELLER'
    ? { seller: oid(scope.sellerId), paidAt: { $ne: null } }
    : { paidAt: { $ne: null } };
}

const CUSTOMER_MESSAGES: Partial<
  Record<
    string,
    {
      title: string;
      body: string;
      type: 'ORDER_SHIPPED' | 'ORDER_OUT_FOR_DELIVERY' | 'ORDER_DELIVERED';
    }
  >
> = {
  SHIPPED: {
    type: 'ORDER_SHIPPED',
    title: 'Your order has shipped',
    body: 'Track it from your orders page.',
  },
  OUT_FOR_DELIVERY: {
    type: 'ORDER_OUT_FOR_DELIVERY',
    title: 'Out for delivery',
    body: 'Your package arrives today.',
  },
  DELIVERED: {
    type: 'ORDER_DELIVERED',
    title: 'Delivered',
    body: 'Your package was delivered. Enjoy!',
  },
};

async function toReturnRows(
  docs: ReturnLean[],
  actor: TransitionActor,
): Promise<SellerReturnRow[]> {
  const [items, shipments] = await Promise.all([
    OrderItem.find({ _id: { $in: docs.map((d) => d.orderItem) } })
      .select('snapshot.name')
      .lean(),
    SellerOrder.find({ _id: { $in: docs.map((d) => d.sellerOrder) } })
      .select('subOrderNumber order')
      .lean(),
  ]);
  const orders = await Order.find({ _id: { $in: shipments.map((s) => s.order) } })
    .select('shippingAddress.fullName')
    .lean();
  return docs.map((r) => {
    const so = shipments.find((s) => s._id.equals(r.sellerOrder));
    const order = orders.find((o) => so?.order.equals(o._id));
    return {
      ...toReturnView(r, items.find((i) => i._id.equals(r.orderItem))?.snapshot.name ?? ''),
      subOrderNumber: so?.subOrderNumber ?? '',
      sellerOrderId: r.sellerOrder.toString(),
      customerName: order?.shippingAddress.fullName ?? '',
      nextStatuses: returnStateMachine
        .nextStatuses(r.status, actor)
        .filter((s) => s !== 'REFUNDED' && s !== 'CANCELLED'),
    };
  });
}

export function createFulfilmentService(deps: { refunds: RefundService }) {
  async function loadDetail(scope: FulfilmentScope, id: string): Promise<SellerOrderDetail> {
    const so = await SellerOrder.findOne({
      _id: oid(id),
      ...scopeFilter(scope),
    }).lean<SellerOrderLean>();
    if (!so) throw ApiError.notFound('Order not found');
    const [order, items, returns, stores] = await Promise.all([
      Order.findById(so.order).select('orderNumber shippingAddress createdAt').lean(),
      OrderItem.find({ sellerOrder: so._id }).lean<OrderItemLean[]>(),
      ReturnRequest.find({ sellerOrder: so._id }).sort({ createdAt: -1 }).lean<ReturnLean[]>(),
      storeNameMap([so.seller]),
    ]);
    if (!order) throw ApiError.notFound('Order not found');
    const actor: TransitionActor = scope.role === 'SELLER' ? 'SELLER' : 'ADMIN';
    const names = new Map(items.map((i) => [i._id.toString(), i.snapshot.name]));
    const a = order.shippingAddress;
    return {
      ...toShipmentView(so, items, stores.get(so.seller.toString()) ?? '', openReturnIds(returns)),
      orderNumber: order.orderNumber,
      orderId: order._id.toString(),
      createdAt: so.createdAt.toISOString(),
      customerName: a.fullName,
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
      nextStatuses: sellerOrderStateMachine
        .nextStatuses(so.status, actor)
        .filter((s) => !['RETURN_REQUESTED', 'RETURNED', 'REFUND_PENDING', 'REFUNDED'].includes(s)),
      commissionAmount: so.commissionAmount,
      payout: so.pricing.subtotal + so.pricing.shippingFee - so.commissionAmount,
      returns: returns.map((r) => toReturnView(r, names.get(r.orderItem.toString()) ?? '')),
    };
  }

  return {
    detail: loadDetail,

    async list(scope: FulfilmentScope, query: SellerOrderListQuery) {
      const filter: Record<string, unknown> = { ...scopeFilter(scope) };
      if (query.status) filter.status = query.status;
      if (query.q) filter.subOrderNumber = new RegExp(`^${escapeRegex(query.q.toUpperCase())}`);
      const [total, docs] = await Promise.all([
        SellerOrder.countDocuments(filter),
        SellerOrder.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean<SellerOrderLean[]>(),
      ]);
      const [orders, firstItems] = await Promise.all([
        Order.find({ _id: { $in: docs.map((d) => d.order) } })
          .select('orderNumber shippingAddress.fullName shippingAddress.city')
          .lean(),
        OrderItem.find({ sellerOrder: { $in: docs.map((d) => d._id) } })
          .select('sellerOrder snapshot.name snapshot.image')
          .lean(),
      ]);
      const orderBy = new Map(orders.map((o) => [o._id.toString(), o]));
      const rows: SellerOrderRow[] = docs.map((so) => {
        const o = orderBy.get(so.order.toString());
        const item = firstItems.find((i) => i.sellerOrder.equals(so._id));
        return {
          id: so._id.toString(),
          subOrderNumber: so.subOrderNumber,
          orderNumber: o?.orderNumber ?? '',
          status: so.status,
          itemCount: so.itemCount,
          total: so.pricing.total,
          customerName: o?.shippingAddress.fullName ?? '',
          city: o?.shippingAddress.city ?? '',
          createdAt: so.createdAt.toISOString(),
          previewImage: item?.snapshot.image ?? null,
          previewName: item?.snapshot.name ?? '',
        };
      });
      return { items: rows, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    async updateStatus(
      req: Request,
      scope: FulfilmentScope,
      id: string,
      update: SellerOrderStatusUpdate,
    ): Promise<SellerOrderDetail> {
      const actor: TransitionActor = scope.role === 'SELLER' ? 'SELLER' : 'ADMIN';
      const current = await SellerOrder.findOne({ _id: oid(id), ...scopeFilter(scope) })
        .select('status')
        .lean();
      if (!current) throw ApiError.notFound('Order not found');
      if (!sellerOrderStateMachine.canTransition(current.status, update.status, actor)) {
        throw new ApiError(
          409,
          ERROR_CODES.INVALID_TRANSITION,
          `Can’t move from ${current.status} to ${update.status}`,
        );
      }
      if (update.status === 'CANCELLED') {
        await cancelPaidShipment({
          sellerOrderId: current._id,
          actor: { role: actor, userId: req.auth?.userId ?? null },
          reason: update.note ?? 'Cancelled by seller',
          refunds: deps.refunds,
          req,
        });
        return loadDetail(scope, id);
      }

      const so = await mongoose.connection.transaction(async (session) => {
        const doc = await SellerOrder.findOne({ _id: current._id, status: current.status }).session(
          session,
        );
        if (!doc) throw ApiError.conflict('The order changed meanwhile. Refresh and try again.');
        doc.status = update.status;
        doc.statusHistory.push(
          historyEntry(update.status, actor, req.auth?.userId ?? null, update.note),
        );
        const now = new Date();
        if (update.status === 'SHIPPED') {
          doc.shipment = {
            ...doc.shipment,
            carrier: update.carrier,
            trackingNumber: update.trackingNumber,
            ...(update.trackingUrl ? { trackingUrl: update.trackingUrl } : {}),
            shippedAt: now,
          };
        }
        if (update.status === 'DELIVERED') {
          if (!(doc.shipment as { shippedAt?: Date | null } | undefined)?.shippedAt) {
            doc.set('shipment.shippedAt', now);
          }
          doc.set('shipment.deliveredAt', now);
          const items = await OrderItem.find({ sellerOrder: doc._id })
            .select('returnable returnWindowDays')
            .session(session)
            .lean();
          const windowDays = Math.max(
            0,
            ...items.filter((i) => i.returnable).map((i) => i.returnWindowDays),
          );
          doc.returnWindowEndsAt = new Date(now.getTime() + windowDays * 86_400_000);
          // Earnings become payable once returns are no longer possible.
          await SellerLedgerEntry.updateMany(
            {
              sellerOrder: doc._id,
              status: 'PENDING',
              type: { $in: ['SALE', 'COMMISSION', 'SELLER_COUPON'] },
            },
            { $set: { availableAt: doc.returnWindowEndsAt } },
            { session },
          );
        }
        await doc.save({ session });
        if (update.status === 'DELIVERED') await syncOrderStatus(doc.order, session);
        await recordAudit(
          req,
          {
            action: 'seller_order.status_changed',
            resource: 'SELLER_ORDER',
            resourceId: id,
            metadata: { from: current.status, to: update.status },
            actorRole: actor,
          },
          session,
        );
        return doc;
      });

      const message = CUSTOMER_MESSAGES[update.status];
      if (message) {
        const tracking =
          update.status === 'SHIPPED'
            ? ` ${update.carrier ?? ''} tracking: ${update.trackingNumber ?? ''}.`
            : '';
        await notify({
          user: so.user,
          type: message.type,
          title: `${message.title} — ${so.subOrderNumber}`,
          body: `${message.body}${tracking}`,
          link: `/orders/${so.order.toString()}`,
          dedupeKey: `${update.status}:${so._id.toString()}`,
          email: {
            preference: 'orderUpdates',
            build: (to) =>
              orderUpdateEmail({
                to: to.email,
                name: to.name,
                subject: `${message.title}: ${so.subOrderNumber}`,
                headline: message.title,
                message: `${message.body}${tracking}`,
                path: `/orders/${so.order.toString()}`,
                cta: 'Track order',
              }),
          },
        });
      }
      return loadDetail(scope, id);
    },

    async listReturns(scope: FulfilmentScope, query: ReturnListQuery) {
      const filter: Record<string, unknown> =
        scope.role === 'SELLER' ? { seller: oid(scope.sellerId) } : {};
      if (query.status) filter.status = query.status;
      const [total, docs] = await Promise.all([
        ReturnRequest.countDocuments(filter),
        ReturnRequest.find(filter)
          .sort({ createdAt: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean<ReturnLean[]>(),
      ]);
      const rows = await toReturnRows(docs, scope.role === 'SELLER' ? 'SELLER' : 'ADMIN');
      return { items: rows, pagination: buildPaginationMeta(query.page, query.limit, total) };
    },

    /**
     * Seller/admin moves a return along. RECEIVED puts units back in stock, marks them
     * returned and starts the refund for their share of what was paid.
     */
    async decideReturn(
      req: Request,
      scope: FulfilmentScope,
      returnId: string,
      input: ReturnDecisionInput,
    ): Promise<SellerReturnRow> {
      const actor: TransitionActor = scope.role === 'SELLER' ? 'SELLER' : 'ADMIN';
      const outcome = await mongoose.connection.transaction(async (session) => {
        const ret = await ReturnRequest.findOne({
          _id: returnId,
          ...(scope.role === 'SELLER' ? { seller: oid(scope.sellerId) } : {}),
        }).session(session);
        if (!ret) throw ApiError.notFound('Return not found');
        if (!returnStateMachine.canTransition(ret.status, input.status, actor)) {
          throw new ApiError(
            409,
            ERROR_CODES.INVALID_TRANSITION,
            `Can’t move a ${ret.status.toLowerCase()} return to ${input.status.toLowerCase()}`,
          );
        }
        ret.status = input.status;
        if (input.note) ret.resolutionNote = input.note;
        ret.statusHistory.push(
          historyEntry(input.status, actor, req.auth?.userId ?? null, input.note),
        );
        let refund: {
          amount: number;
          itemId: Types.ObjectId;
          sellerOrderId: Types.ObjectId;
          orderId: Types.ObjectId;
        } | null = null;
        let restocked: Types.ObjectId[] = [];

        if (input.status === 'REJECTED') {
          await ret.save({ session });
          await settleAfterReturnClosed(ret.orderItem, ret.sellerOrder, session);
        } else if (input.status === 'RECEIVED') {
          const item = await OrderItem.findById(ret.orderItem).session(session);
          if (!item) throw ApiError.notFound('Item not found');
          restocked = await restock([{ variant: item.variant, quantity: ret.quantity }], session);
          const remainingUnits = item.quantity - item.returnedQuantity;
          const remainingValue = item.lineTotal - item.refundedAmount;
          const amount =
            ret.quantity >= remainingUnits
              ? remainingValue
              : Math.round((item.lineTotal * ret.quantity) / item.quantity);
          item.returnedQuantity += ret.quantity;
          item.status = 'RETURNED';
          await item.save({ session });
          await ret.save({ session });
          const so = await SellerOrder.findById(ret.sellerOrder).session(session);
          if (so) {
            const active = await OrderItem.exists({
              sellerOrder: so._id,
              $expr: { $lt: ['$returnedQuantity', '$quantity'] },
              status: { $ne: 'CANCELLED' },
            }).session(session);
            const open = await ReturnRequest.exists({
              sellerOrder: so._id,
              _id: { $ne: ret._id },
              status: { $in: ['REQUESTED', 'APPROVED', 'PICKED_UP'] },
            }).session(session);
            if (!active && so.status === 'RETURN_REQUESTED') {
              so.status = 'RETURNED';
              so.statusHistory.push(historyEntry('RETURNED', actor, req.auth?.userId ?? null));
              so.status = 'REFUND_PENDING';
              so.statusHistory.push(historyEntry('REFUND_PENDING', 'SYSTEM'));
              await so.save({ session });
            } else if (!open && so.status === 'RETURN_REQUESTED') {
              so.status = 'DELIVERED';
              so.statusHistory.push(historyEntry('DELIVERED', 'SYSTEM', null, 'Return received'));
              await so.save({ session });
            }
          }
          if (amount > 0)
            refund = {
              amount,
              itemId: item._id,
              sellerOrderId: ret.sellerOrder,
              orderId: ret.order,
            };
        } else {
          await ret.save({ session });
        }
        await recordAudit(
          req,
          {
            action: 'return.status_changed',
            resource: 'RETURN',
            resourceId: returnId,
            metadata: { to: input.status },
            actorRole: actor,
          },
          session,
        );
        return { ret, refund, restocked };
      });

      for (const variant of outcome.restocked) void notifyBackInStock(variant);
      if (outcome.refund) {
        const refundId = await deps.refunds.refund({
          orderId: outcome.refund.orderId,
          sellerOrderId: outcome.refund.sellerOrderId,
          orderItemIds: [outcome.refund.itemId],
          itemAmounts: [{ itemId: outcome.refund.itemId, amount: outcome.refund.amount }],
          amount: outcome.refund.amount,
          reason: 'ITEM_RETURNED',
          actor: { role: actor, userId: req.auth?.userId ?? null },
          idempotencyKey: `return_${returnId}`,
        });
        if (refundId)
          await ReturnRequest.updateOne({ _id: returnId }, { $set: { refund: refundId } });
      }
      const labels: Record<string, string> = {
        APPROVED: 'approved',
        REJECTED: 'rejected',
        PICKED_UP: 'picked up',
        RECEIVED: 'received — refund started',
      };
      await notify({
        user: outcome.ret.user,
        type: 'RETURN_UPDATE',
        title: `Return ${labels[input.status] ?? input.status.toLowerCase()}`,
        body:
          input.note ??
          (outcome.refund ? `Refund of ${formatRupees(outcome.refund.amount)} started.` : ''),
        link: `/orders/${outcome.ret.order.toString()}`,
        dedupeKey: `return:${returnId}:${input.status}`,
      });
      const updated = await ReturnRequest.findById(returnId).lean<ReturnLean>();
      if (!updated) throw ApiError.notFound('Return not found');
      const [row] = await toReturnRows([updated], actor);
      if (!row) throw ApiError.notFound('Return not found');
      return row;
    },
  };
}

/** Job: seller earnings whose return window has passed become payable. */
export async function releaseSettledEarnings(): Promise<number> {
  const result = await SellerLedgerEntry.updateMany(
    { status: 'PENDING', availableAt: { $ne: null, $lte: new Date() } },
    { $set: { status: 'AVAILABLE' } },
  );
  return result.modifiedCount;
}

export { applyBps, toHistory };
export type FulfilmentService = ReturnType<typeof createFulfilmentService>;
