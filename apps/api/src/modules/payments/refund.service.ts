import { applyBps, type TransitionActor } from '@zyventa/shared';
import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { orderUpdateEmail, formatRupees } from '../email/commerce-templates.js';
import { notify } from '../notifications/notification.service.js';
import { historyEntry, syncOrderStatus } from '../orders/order-lifecycle.js';
import { OrderItem } from '../orders/order-item.model.js';
import { Order } from '../orders/order.model.js';
import { ReturnRequest } from '../orders/return-request.model.js';
import { SellerOrder } from '../orders/seller-order.model.js';
import { SellerLedgerEntry } from '../sellers/seller-ledger-entry.model.js';
import { Payment } from './payment.model.js';
import type { PaymentGateway, RazorpayRefund } from './razorpay.client.js';
import { RazorpayHttpError } from './razorpay.client.js';
import { Refund } from './refund.model.js';

export type RefundReason =
  'ORDER_CANCELLED' | 'ITEM_RETURNED' | 'PAYMENT_AFTER_EXPIRY' | 'ADMIN_GOODWILL' | 'OTHER';

export interface RefundRequest {
  orderId: Types.ObjectId;
  sellerOrderId?: Types.ObjectId | null;
  orderItemIds?: Types.ObjectId[];
  /** Specific item amounts (for refundedAmount bookkeeping), must sum to `amount`. */
  itemAmounts?: { itemId: Types.ObjectId; amount: number }[];
  amount: number;
  reason: RefundReason;
  note?: string;
  actor: { role: TransitionActor; userId: string | null };
  /** Deterministic key for the logical refund, so retries never refund twice. */
  idempotencyKey?: string;
  /** Refund a specific payment (e.g. a payment that arrived after expiry). */
  paymentId?: Types.ObjectId;
}

/**
 * Refunds through Razorpay with three safety nets against double refunds:
 *  1. Payment.amountRefunded is incremented atomically with a "stays ≤ captured amount" guard
 *     BEFORE calling Razorpay;
 *  2. each logical refund has a unique idempotency key (Refund.idempotencyKey), also sent to
 *     Razorpay as the receipt;
 *  3. finalisation is guarded by a status flip (PENDING → PROCESSED happens once).
 * A gateway failure leaves the refund FAILED (amount released) for an admin retry.
 */
export function createRefundService(deps: { gateway: PaymentGateway | null }) {
  async function finalize(refundId: Types.ObjectId): Promise<void> {
    const outcome = await mongoose.connection.transaction(async (session) => {
      const refund = await Refund.findOneAndUpdate(
        { _id: refundId, status: 'PENDING' },
        { $set: { status: 'PROCESSED', processedAt: new Date() } },
        { session, returnDocument: 'after' },
      ).lean();
      if (!refund) return null;

      const order = await Order.findById(refund.order).session(session);
      if (!order) return null;
      order.refundedAmount = Math.min(order.pricing.total, order.refundedAmount + refund.amount);
      order.paymentStatus =
        order.refundedAmount >= order.pricing.total ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await order.save({ session });

      const payment = await Payment.findById(refund.payment).session(session);
      if (payment) {
        payment.status =
          payment.amountRefunded >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        await payment.save({ session });
      }

      await ReturnRequest.updateMany(
        {
          status: 'RECEIVED',
          $or: [{ refund: refund._id }, { orderItem: { $in: refund.orderItems } }],
        },
        {
          $set: { status: 'REFUNDED', refund: refund._id },
          $push: { statusHistory: historyEntry('REFUNDED', 'SYSTEM') },
        },
        { session },
      );

      if (refund.sellerOrder) {
        const so = await SellerOrder.findById(refund.sellerOrder).session(session);
        if (so) {
          const pendingOthers = await Refund.exists({
            sellerOrder: so._id,
            status: 'PENDING',
            _id: { $ne: refund._id },
          }).session(session);
          if (so.status === 'REFUND_PENDING' && !pendingOthers) {
            so.status = 'REFUNDED';
            so.statusHistory.push(historyEntry('REFUNDED', 'SYSTEM'));
            await so.save({ session });
          }
          // Seller settlement: the refund is debited, net of the commission the platform returns.
          const commissionBack = applyBps(refund.amount, so.commissionBps);
          await SellerLedgerEntry.create(
            [
              {
                seller: so.seller,
                type: 'REFUND',
                amount: -(refund.amount - commissionBack),
                status: 'PENDING',
                order: order._id,
                sellerOrder: so._id,
                refund: refund._id,
                availableAt: new Date(),
                note: `Refund ${refund.reason}`,
              },
            ],
            { session },
          );
        }
        await syncOrderStatus(order._id, session);
      }
      return { refund, order };
    });

    if (outcome) {
      const { refund, order } = outcome;
      await notify({
        user: order.user,
        type: 'REFUND_PROCESSED',
        title: 'Refund processed',
        body: `${formatRupees(refund.amount)} for order ${order.orderNumber} is on its way to your original payment method.`,
        link: `/orders/${order._id.toString()}`,
        dedupeKey: `refund:${refund._id.toString()}`,
        email: {
          preference: 'orderUpdates',
          build: (to) =>
            orderUpdateEmail({
              to: to.email,
              name: to.name,
              subject: `Refund of ${formatRupees(refund.amount)} processed`,
              headline: 'Your refund is on its way',
              message: `We've refunded ${formatRupees(refund.amount)} for order ${order.orderNumber}. It usually reaches your account in 5–7 working days.`,
              path: `/orders/${order._id.toString()}`,
              cta: 'View order',
            }),
        },
      });
    }
  }

  async function applyGatewayResult(
    refundId: Types.ObjectId,
    result: RazorpayRefund,
  ): Promise<void> {
    await Refund.updateOne({ _id: refundId }, { $set: { razorpayRefundId: result.id } });
    if (result.status === 'processed') await finalize(refundId);
    if (result.status === 'failed')
      await markFailed(refundId, 'Refund failed at the payment provider');
  }

  async function markFailed(refundId: Types.ObjectId, reason: string): Promise<void> {
    const refund = await Refund.findOneAndUpdate(
      { _id: refundId, status: 'PENDING' },
      { $set: { status: 'FAILED', failureReason: reason.slice(0, 500) } },
      { returnDocument: 'after' },
    ).lean();
    if (refund) {
      // Release the reserved refundable amount so it can be retried.
      await Payment.updateOne(
        { _id: refund.payment },
        { $inc: { amountRefunded: -refund.amount } },
      );
    }
  }

  async function send(refundId: Types.ObjectId): Promise<void> {
    const refund = await Refund.findById(refundId).lean();
    if (!refund || refund.status !== 'PENDING') return;
    const payment = await Payment.findById(refund.payment).lean();
    if (!payment?.razorpayPaymentId || !deps.gateway) {
      await markFailed(refundId, 'Payment provider not configured');
      return;
    }
    try {
      const result = await deps.gateway.refund(payment.razorpayPaymentId, {
        amount: refund.amount,
        receipt: refund.idempotencyKey.slice(0, 40),
        notes: { refundId: refundId.toString(), orderId: refund.order.toString() },
      });
      await applyGatewayResult(refundId, result);
    } catch (error) {
      const reason = error instanceof RazorpayHttpError ? error.message : String(error);
      logger.error({ refundId: refundId.toString(), reason }, 'Refund request failed');
      await markFailed(refundId, reason);
    }
  }

  return {
    finalize,
    markFailed,

    /** Creates (or returns the existing) refund and sends it to Razorpay. */
    async refund(request: RefundRequest): Promise<Types.ObjectId | null> {
      if (request.amount <= 0) return null;
      const payment = request.paymentId
        ? await Payment.findById(request.paymentId).lean()
        : await Payment.findOne({
            order: request.orderId,
            status: { $in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
          })
            .sort({ capturedAt: -1 })
            .lean();
      if (!payment) return null; // nothing was paid — nothing to refund

      const key = request.idempotencyKey ?? `rf_${randomBytes(12).toString('hex')}`;
      const existing = await Refund.findOne({ idempotencyKey: key }).lean();
      if (existing) return existing._id;

      const reserved = await Payment.updateOne(
        {
          _id: payment._id,
          $expr: { $lte: [{ $add: ['$amountRefunded', request.amount] }, '$amount'] },
        },
        { $inc: { amountRefunded: request.amount } },
      );
      if (reserved.modifiedCount === 0) {
        throw ApiError.conflict('Refund exceeds the amount that can still be refunded');
      }

      let refundId: Types.ObjectId;
      try {
        const [doc] = await Refund.create([
          {
            payment: payment._id,
            order: request.orderId,
            sellerOrder: request.sellerOrderId ?? null,
            orderItems: request.orderItemIds ?? [],
            amount: request.amount,
            reason: request.reason,
            note: request.note,
            idempotencyKey: key,
            initiatedBy: { role: request.actor.role, user: request.actor.userId },
          },
        ]);
        if (!doc) throw new Error('Refund not created');
        refundId = doc._id;
      } catch (error) {
        await Payment.updateOne(
          { _id: payment._id },
          { $inc: { amountRefunded: -request.amount } },
        );
        if ((error as { code?: number }).code === 11000) {
          const again = await Refund.findOne({ idempotencyKey: key }).lean();
          if (again) return again._id;
        }
        throw error;
      }

      for (const part of request.itemAmounts ?? []) {
        await OrderItem.updateOne({ _id: part.itemId }, { $inc: { refundedAmount: part.amount } });
      }
      await send(refundId);
      return refundId;
    },

    /** Admin retry of a FAILED refund: re-reserves the amount and sends it again. */
    async retry(refundId: string): Promise<void> {
      // The FAILED → PENDING flip is the gate: concurrent retries cannot both proceed.
      const refund = await Refund.findOneAndUpdate(
        { _id: refundId, status: 'FAILED' },
        { $set: { status: 'PENDING', failureReason: null } },
        { new: true },
      ).lean();
      if (!refund) {
        const exists = await Refund.exists({ _id: refundId });
        if (!exists) throw ApiError.notFound('Refund not found');
        throw ApiError.conflict('Only failed refunds can be retried');
      }
      const reserved = await Payment.updateOne(
        {
          _id: refund.payment,
          $expr: { $lte: [{ $add: ['$amountRefunded', refund.amount] }, '$amount'] },
        },
        { $inc: { amountRefunded: refund.amount } },
      );
      if (reserved.modifiedCount === 0) {
        await Refund.updateOne(
          { _id: refund._id, status: 'PENDING' },
          { $set: { status: 'FAILED', failureReason: 'Nothing left to refund on this payment' } },
        );
        throw ApiError.conflict('Nothing left to refund on this payment');
      }
      await send(refund._id);
    },

    /** Webhook: refund.processed / refund.failed. */
    async onGatewayEvent(entity: RazorpayRefund): Promise<void> {
      const refund = await Refund.findOne({ razorpayRefundId: entity.id }).lean();
      if (!refund) return;
      if (entity.status === 'processed') await finalize(refund._id);
      if (entity.status === 'failed')
        await markFailed(refund._id, 'Refund failed at the payment provider');
    },
  };
}

export type RefundService = ReturnType<typeof createRefundService>;
