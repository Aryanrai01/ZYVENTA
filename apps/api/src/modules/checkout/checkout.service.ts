import {
  ERROR_CODES,
  applyBps,
  type CheckoutInput,
  type PaymentMethod,
  type CheckoutQuote,
  type PaymentInit,
  type QuoteLine,
  type VerifyPaymentInput,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { nextOrderNumber } from '../../database/counter.js';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import { recordAudit } from '../audit/audit.service.js';
import { lineStatus } from '../cart/cart-pricing.js';
import { Cart } from '../cart/cart.model.js';
import { CouponRedemption } from '../coupons/coupon-redemption.model.js';
import { Coupon } from '../coupons/coupon.model.js';
import type { PromotionService } from '../coupons/promotion.service.js';
import {
  formatRupees,
  orderConfirmedEmail,
  orderUpdateEmail,
} from '../email/commerce-templates.js';
import { notify } from '../notifications/notification.service.js';
import {
  historyEntry,
  refreshForVariants,
  releaseReservations,
} from '../orders/order-lifecycle.js';
import { OrderItem } from '../orders/order-item.model.js';
import { Order } from '../orders/order.model.js';
import { SellerOrder } from '../orders/seller-order.model.js';
import { Payment } from '../payments/payment.model.js';
import {
  requireGateway,
  type PaymentGateway,
  type RazorpayPayment,
} from '../payments/razorpay.client.js';
import type { RefundService } from '../payments/refund.service.js';
import { loadLiveCatalog, type LiveCatalog } from '../pricing/live-catalog.js';
import {
  priceOrder,
  type CouponRule,
  type EngineLine,
  type EngineResult,
} from '../pricing/pricing-engine.js';
import { ProductVariant } from '../products/product-variant.model.js';
import { Product } from '../products/product.model.js';
import { SellerLedgerEntry } from '../sellers/seller-ledger-entry.model.js';
import { Seller } from '../sellers/seller.model.js';
import type { SettingsService } from '../settings/settings.service.js';
import { Address } from '../users/address.model.js';
import { toAddressView } from '../users/address.service.js';
import { User } from '../users/user.model.js';

interface CartItemLean {
  variant: Types.ObjectId;
  quantity: number;
}

interface QuoteContext {
  quote: CheckoutQuote;
  engine: EngineResult;
  lines: EngineLine[];
  live: LiveCatalog;
  coupon: CouponRule | null;
}

type OrderSummary = {
  _id: Types.ObjectId;
  orderNumber: string;
  user: Types.ObjectId;
  total: number;
};
type TxResult = { kind: 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'NEEDS_REFUND'; order: OrderSummary };

/** Late payment for an expired order whose stock is gone: roll back, then refund. */
class LatePaymentUnfulfillable extends Error {
  constructor(readonly order: OrderSummary) {
    super('Late payment cannot be fulfilled');
  }
}

const PAYMENT_METHOD_MAP = new Set(['card', 'upi', 'netbanking', 'wallet', 'emi', 'paylater']);

/**
 * Checkout: quote → place order (reserve stock + coupon in one transaction) → Razorpay
 * order → verify (signature AND server-side fetch of the payment) → confirm. Webhooks call
 * the same idempotent `confirmPayment`, so whichever arrives first wins and the other no-ops.
 */
export function createCheckoutService(deps: {
  settings: SettingsService;
  promotions: PromotionService;
  refunds: RefundService;
  gateway: PaymentGateway | null;
}) {
  const { settings, promotions } = deps;

  async function buildQuote(
    userId: string,
    input: { addressId?: string | undefined; couponCode?: string | undefined },
    session?: ClientSession,
  ): Promise<QuoteContext> {
    const cart = await Cart.findOne({ user: userId })
      .select('items')
      .session(session ?? null)
      .lean();
    const items = (cart?.items ?? []) as CartItemLean[];
    const live = await loadLiveCatalog(
      items.map((i) => i.variant.toString()),
      session,
    );

    const lines: EngineLine[] = [];
    for (const item of items) {
      const variant = live.variants.get(item.variant.toString());
      const product = variant ? live.products.get(variant.productId) : undefined;
      const { status, maxQuantity } = lineStatus(item.quantity, variant, product);
      lines.push({
        variantId: item.variant.toString(),
        productId: variant?.productId ?? '',
        sellerId: product?.seller.id ?? '',
        categoryPath: product?.categoryPath ?? [],
        brandId: product?.brandId ?? null,
        quantity: item.quantity,
        status,
        maxQuantity,
        listPrice: variant?.price ?? 0,
        mrp: variant?.mrp ?? 0,
        gstRateBps: product?.gstRateBps ?? 0,
      });
    }

    let coupon: CouponRule | null = null;
    let couponError: string | null = null;
    const code = input.couponCode?.trim().toUpperCase();
    if (code) {
      const resolved = await promotions.resolveCoupon(code, userId, session);
      if ('rule' in resolved) coupon = resolved.rule;
      else couponError = resolved.error;
    }

    const [offers, shipping] = await Promise.all([promotions.activeOffers(), settings.shipping()]);
    const engine = priceOrder(lines, offers, coupon, shipping, formatRupees);

    const address = input.addressId
      ? await Address.findOne({ _id: input.addressId, user: userId })
          .session(session ?? null)
          .lean()
      : await Address.findOne({ user: userId, isDefault: true })
          .session(session ?? null)
          .lean();

    const quoteLines: QuoteLine[] = lines.map((line, i) => {
      const priced = engine.lines[i];
      const variant = live.variants.get(line.variantId);
      const product = variant ? live.products.get(variant.productId) : undefined;
      return {
        variantId: line.variantId,
        productId: line.productId,
        slug: product?.slug ?? '',
        name: product?.name ?? 'Item no longer available',
        image: variant?.image?.url ?? product?.image?.url ?? null,
        options: variant?.options ?? {},
        seller: { id: line.sellerId, storeName: product?.seller.storeName ?? '' },
        quantity: priced?.units ?? 0,
        status: line.status,
        unitMrp: line.mrp,
        listPrice: line.listPrice,
        unitPrice: priced?.unitPrice ?? 0,
        offer: priced?.offer ?? null,
        lineSubtotal: priced?.lineSubtotal ?? 0,
        couponDiscount: priced?.couponDiscount ?? 0,
        lineTotal: priced?.lineTotal ?? 0,
        gstRateBps: line.gstRateBps,
        taxIncluded: priced?.taxIncluded ?? 0,
      };
    });

    let couponView: CheckoutQuote['coupon'] = null;
    if (code && couponError) couponView = { code, status: 'INVALID', message: couponError };
    else if (code && coupon && engine.coupon?.status === 'APPLIED') {
      couponView = {
        code,
        status: 'APPLIED',
        discount: engine.coupon.discount,
        title: coupon.title,
      };
    } else if (code && engine.coupon?.status === 'INVALID') {
      couponView = { code, status: 'INVALID', message: engine.coupon.message };
    }

    const quote: CheckoutQuote = {
      lines: quoteLines,
      shipments: engine.shipments.map((s) => ({
        seller: {
          id: s.sellerId,
          storeName:
            live.products.get(lines.find((l) => l.sellerId === s.sellerId)?.productId ?? '')?.seller
              .storeName ?? '',
        },
        itemCount: s.itemCount,
        subtotal: s.subtotal,
        couponDiscount: s.couponDiscount,
        shippingFee: s.shippingFee,
        total: s.total,
      })),
      pricing: engine.pricing,
      savings: Math.max(
        0,
        engine.pricing.mrpTotal - engine.pricing.subtotal + engine.pricing.couponDiscount,
      ),
      coupon: couponView,
      canPlaceOrder:
        lines.length > 0 &&
        lines.every((l) => l.status === 'OK') &&
        engine.pricing.total >= 100 &&
        Boolean(address) &&
        couponView?.status !== 'INVALID',
      address: address ? toAddressView(address) : null,
    };
    return { quote, engine, lines, live, coupon: couponView?.status === 'APPLIED' ? coupon : null };
  }

  async function paymentInit(
    order: {
      _id: Types.ObjectId;
      orderNumber: string;
      pricing: { total: number };
      expiresAt?: Date | null;
      user: Types.ObjectId;
    },
    razorpayOrderId: string,
  ): Promise<PaymentInit> {
    const gateway = requireGateway(deps.gateway);
    const user = await User.findById(order.user).select('name email phone').lean();
    return {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      amount: order.pricing.total,
      currency: 'INR',
      razorpayOrderId,
      keyId: gateway.keyId,
      expiresAt: (order.expiresAt ?? new Date()).toISOString(),
      prefill: { name: user?.name ?? '', email: user?.email ?? '', contact: user?.phone ?? '' },
    };
  }

  /** Releases an unpaid order: reservations, coupon usage, shipments. Idempotent. */
  async function releaseOrder(
    orderId: Types.ObjectId,
    to: 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED',
    actor: { role: 'CUSTOMER' | 'SYSTEM' | 'ADMIN'; userId: string | null },
    note: string,
  ): Promise<boolean> {
    return mongoose.connection.transaction(async (session) => {
      const order = await Order.findOneAndUpdate(
        { _id: orderId, status: 'PENDING_PAYMENT' },
        {
          $set: {
            status: to,
            expiresAt: null,
            ...(to === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: note } : {}),
          },
          $push: { statusHistory: historyEntry(to, actor.role, actor.userId, note) },
        },
        { session, returnDocument: 'after' },
      );
      if (!order) return false;
      const items = await OrderItem.find({ order: orderId })
        .select('variant quantity')
        .session(session)
        .lean();
      await releaseReservations(items, session);
      await OrderItem.updateMany(
        { order: orderId },
        { $set: { status: 'CANCELLED' } },
        { session },
      );
      await SellerOrder.updateMany(
        { order: orderId },
        {
          $set: { status: 'CANCELLED', cancelReason: note },
          $push: { statusHistory: historyEntry('CANCELLED', actor.role, actor.userId, note) },
        },
        { session },
      );
      const redemption = await CouponRedemption.findOneAndUpdate(
        { order: orderId, status: 'RESERVED' },
        { $set: { status: 'RELEASED', releasedAt: new Date() } },
        { session },
      );
      if (redemption) {
        await Coupon.updateOne(
          { _id: redemption.coupon, usedCount: { $gt: 0 } },
          { $inc: { usedCount: -1 } },
          { session },
        );
      }
      return true;
    });
  }

  /**
   * Marks a verified Razorpay payment as captured and confirms its order exactly once.
   * If the order had already expired (stock released), stock is re-reserved when possible;
   * otherwise the payment is refunded in full.
   */
  async function confirmPayment(
    rp: RazorpayPayment,
    source: 'CLIENT_CALLBACK' | 'WEBHOOK' | 'RECONCILIATION',
  ): Promise<{ orderId: string; outcome: 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'REFUNDED' }> {
    if (!rp.order_id) throw ApiError.badRequest('Payment is not linked to an order');
    const payment = await Payment.findOne({ razorpayOrderId: rp.order_id }).lean();
    if (!payment) throw ApiError.notFound('Payment not found');
    if (rp.amount !== payment.amount || rp.currency !== 'INR') {
      logger.error(
        { paymentId: rp.id, expected: payment.amount, got: rp.amount },
        'Payment amount mismatch',
      );
      throw new ApiError(
        400,
        ERROR_CODES.PAYMENT_VERIFICATION_FAILED,
        'Payment amount does not match the order',
      );
    }

    const captureFields = {
      razorpayPaymentId: rp.id,
      status: 'CAPTURED' as const,
      method: (rp.method && PAYMENT_METHOD_MAP.has(rp.method)
        ? rp.method
        : 'other') as PaymentMethod,
      display: {
        ...(rp.card?.network ? { cardNetwork: rp.card.network } : {}),
        ...(rp.card?.last4 ? { cardLast4: rp.card.last4 } : {}),
        ...(rp.bank ? { bank: rp.bank } : {}),
        ...(rp.wallet ? { wallet: rp.wallet } : {}),
      },
      verifiedVia: source,
      capturedAt: new Date(),
    };
    const OPEN = {
      $in: ['CREATED', 'AUTHORIZED', 'FAILED'] as ('CREATED' | 'AUTHORIZED' | 'FAILED')[],
    };

    let result: TxResult;
    try {
      result = await mongoose.connection.transaction<TxResult>(async (session) => {
        const order = await Order.findById(payment.order).session(session);
        if (!order) throw ApiError.notFound('Order not found');
        const summary: OrderSummary = {
          _id: order._id,
          orderNumber: order.orderNumber,
          user: order.user,
          total: order.pricing.total,
        };

        // Record the capture on this attempt (unique razorpayPaymentId index blocks duplicates).
        const captured = await Payment.findOneAndUpdate(
          { _id: payment._id, status: OPEN },
          { $set: captureFields },
          { session, returnDocument: 'after' },
        );
        if (!captured) return { kind: 'ALREADY_CONFIRMED', order: summary };

        const items = await OrderItem.find({ order: order._id }).session(session);

        if (order.status === 'PENDING_PAYMENT') {
          for (const item of items) {
            const ok = await ProductVariant.updateOne(
              {
                _id: item.variant,
                reserved: { $gte: item.quantity },
                stock: { $gte: item.quantity },
              },
              { $inc: { stock: -item.quantity, reserved: -item.quantity } },
              { session },
            );
            if (ok.modifiedCount === 0)
              throw new Error(`Reservation missing for variant ${item.variant.toString()}`);
          }
        } else if (order.status === 'EXPIRED' || order.status === 'PAYMENT_FAILED') {
          // Late payment: try to take the stock again, straight from available units.
          for (const item of items) {
            const ok = await ProductVariant.updateOne(
              {
                _id: item.variant,
                isActive: true,
                $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, item.quantity] },
              },
              { $inc: { stock: -item.quantity } },
              { session },
            );
            // Throwing rolls back any units already taken above; handled below.
            if (ok.modifiedCount === 0) throw new LatePaymentUnfulfillable(summary);
          }
          await OrderItem.updateMany(
            { order: order._id },
            { $set: { status: 'ACTIVE' } },
            { session },
          );
          await SellerOrder.updateMany(
            { order: order._id },
            {
              $set: { status: 'CONFIRMED' },
              $unset: { cancelReason: 1 },
              $push: {
                statusHistory: historyEntry(
                  'CONFIRMED',
                  'SYSTEM',
                  null,
                  'Payment received after expiry',
                ),
              },
            },
            { session },
          );
          const redemption = await CouponRedemption.findOne({ order: order._id }).session(session);
          if (redemption?.status === 'RELEASED') {
            await Coupon.updateOne(
              { _id: redemption.coupon },
              { $inc: { usedCount: 1 } },
              { session },
            );
          }
        } else {
          // Order already confirmed by another payment, or cancelled: refund this one.
          return { kind: 'NEEDS_REFUND', order: summary };
        }

        await refreshForVariants(
          items.map((i) => i.variant),
          session,
        );
        const now = new Date();
        order.status = 'CONFIRMED';
        order.paymentStatus = 'PAID';
        order.placedAt = now;
        order.expiresAt = null;
        order.statusHistory.push(
          historyEntry('CONFIRMED', 'SYSTEM', null, `Payment verified (${source.toLowerCase()})`),
        );
        await order.save({ session });

        await CouponRedemption.updateOne(
          { order: order._id },
          { $set: { status: 'CONSUMED' } },
          { session },
        );

        const sellerOrders = await SellerOrder.find({ order: order._id }).session(session);
        for (const so of sellerOrders) {
          so.paidAt = now;
          so.statusHistory.push(historyEntry('CONFIRMED', 'SYSTEM', null, 'Payment received'));
          await so.save({ session });
        }

        // Units sold per product (drives "popular" sorting).
        const soldByProduct = new Map<string, number>();
        for (const item of items) {
          soldByProduct.set(
            item.product.toString(),
            (soldByProduct.get(item.product.toString()) ?? 0) + item.quantity,
          );
        }
        await Product.bulkWrite(
          [...soldByProduct].map(([id, qty]) => ({
            updateOne: { filter: { _id: id }, update: { $inc: { soldCount: qty } } },
          })),
          { session },
        );

        // Seller settlement entries (become AVAILABLE after the return window).
        const coupon = order.coupon?.coupon
          ? await Coupon.findById(order.coupon.coupon)
              .select('fundedBy ownerSeller')
              .session(session)
              .lean()
          : null;
        const ledger = sellerOrders.flatMap((so) => {
          const entries = [
            {
              seller: so.seller,
              type: 'SALE',
              amount: so.pricing.subtotal + so.pricing.shippingFee,
              status: 'PENDING',
              order: order._id,
              sellerOrder: so._id,
            },
            {
              seller: so.seller,
              type: 'COMMISSION',
              amount: -so.commissionAmount,
              status: 'PENDING',
              order: order._id,
              sellerOrder: so._id,
            },
          ];
          if (coupon?.fundedBy === 'SELLER' && so.pricing.couponDiscount > 0) {
            entries.push({
              seller: so.seller,
              type: 'SELLER_COUPON',
              amount: -so.pricing.couponDiscount,
              status: 'PENDING',
              order: order._id,
              sellerOrder: so._id,
            });
          }
          return entries.filter((e) => e.amount !== 0);
        });
        if (ledger.length > 0) await SellerLedgerEntry.insertMany(ledger, { session });

        // Purchased lines leave the cart.
        await Cart.updateOne(
          { user: order.user },
          { $pull: { items: { variant: { $in: items.map((i) => i.variant) } } }, $inc: { __v: 1 } },
          { session },
        );
        return { kind: 'CONFIRMED', order: summary };
      });
    } catch (error) {
      if (!(error instanceof LatePaymentUnfulfillable)) throw error;
      const recorded = await Payment.updateOne(
        { _id: payment._id, status: OPEN },
        { $set: captureFields },
      );
      result = {
        kind: recorded.modifiedCount === 1 ? 'NEEDS_REFUND' : 'ALREADY_CONFIRMED',
        order: error.order,
      };
    }

    const orderId = result.order._id.toString();
    if (result.kind === 'NEEDS_REFUND') {
      await deps.refunds.refund({
        orderId: result.order._id,
        amount: rp.amount,
        reason: 'PAYMENT_AFTER_EXPIRY',
        note: 'Payment received for an order that could no longer be fulfilled',
        actor: { role: 'SYSTEM', userId: null },
        idempotencyKey: `late_${rp.id}`,
        paymentId: payment._id,
      });
      await notify({
        user: result.order.user,
        type: 'PAYMENT_FAILED',
        title: 'We refunded your payment',
        body: `Order ${result.order.orderNumber} expired before your payment arrived, so we've refunded ${formatRupees(rp.amount)}.`,
        link: `/orders/${orderId}`,
        dedupeKey: `late-payment:${rp.id}`,
      });
      return { orderId, outcome: 'REFUNDED' };
    }
    if (result.kind === 'CONFIRMED') await afterConfirmed(result.order._id);
    return { orderId, outcome: result.kind };
  }

  async function afterConfirmed(orderId: Types.ObjectId): Promise<void> {
    const order = await Order.findById(orderId).lean();
    if (!order) return;
    const [items, sellerOrders] = await Promise.all([
      OrderItem.find({ order: orderId }).select('snapshot quantity lineTotal').lean(),
      SellerOrder.find({ order: orderId }).select('seller subOrderNumber itemCount pricing').lean(),
    ]);
    await notify({
      user: order.user,
      type: 'ORDER_CONFIRMED',
      title: `Order ${order.orderNumber} confirmed`,
      body: `Payment of ${formatRupees(order.pricing.total)} received. We'll let you know when it ships.`,
      link: `/orders/${orderId.toString()}`,
      dedupeKey: `order-confirmed:${orderId.toString()}`,
      email: {
        preference: 'orderUpdates',
        build: (to) =>
          orderConfirmedEmail({
            to: to.email,
            name: to.name,
            orderNumber: order.orderNumber,
            orderId: orderId.toString(),
            total: order.pricing.total,
            items: items.map((i) => ({
              name: i.snapshot.name,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
            })),
          }),
      },
    });
    const sellers = await Seller.find({ _id: { $in: sellerOrders.map((s) => s.seller) } })
      .select('user')
      .lean();
    const owner = new Map(sellers.map((s) => [s._id.toString(), s.user]));
    for (const so of sellerOrders) {
      const sellerUser = owner.get(so.seller.toString());
      if (!sellerUser) continue;
      await notify({
        user: sellerUser,
        type: 'NEW_SELLER_ORDER',
        title: `New order ${so.subOrderNumber}`,
        body: `${String(so.itemCount)} item(s) worth ${formatRupees(so.pricing.subtotal)} to pack and ship.`,
        link: `/seller/orders/${so._id.toString()}`,
        dedupeKey: `seller-order:${so._id.toString()}`,
        email: {
          preference: 'orderUpdates',
          build: (to) =>
            orderUpdateEmail({
              to: to.email,
              name: to.name,
              subject: `New order ${so.subOrderNumber}`,
              headline: 'You have a new order',
              message: `${String(so.itemCount)} item(s) worth ${formatRupees(so.pricing.subtotal)} are ready to be packed.`,
              path: `/seller/orders/${so._id.toString()}`,
              cta: 'Open order',
            }),
        },
      });
    }
  }

  return {
    confirmPayment,
    releaseOrder,

    async quote(userId: string, input: Partial<CheckoutInput>): Promise<CheckoutQuote> {
      return (await buildQuote(userId, input)).quote;
    },

    async placeOrder(
      req: Request,
      userId: string,
      input: CheckoutInput,
      idempotencyKey: string,
    ): Promise<PaymentInit> {
      const gateway = requireGateway(deps.gateway);
      const platform = await settings.all();
      if (platform.maintenance.enabled) {
        throw ApiError.serviceUnavailable(
          platform.maintenance.message ||
            'Checkout is paused for maintenance. Please try again soon.',
        );
      }

      const created = await mongoose.connection.transaction(async (session) => {
        const ctx = await buildQuote(userId, input, session);
        const { quote, engine, lines, live, coupon } = ctx;
        if (!quote.address) throw ApiError.badRequest('Choose a delivery address');
        if (quote.coupon?.status === 'INVALID') {
          throw new ApiError(422, ERROR_CODES.COUPON_INVALID, quote.coupon.message);
        }
        if (!quote.canPlaceOrder) {
          throw new ApiError(
            409,
            ERROR_CODES.CART_NOT_READY,
            'Some items in your cart changed. Please review your cart.',
          );
        }
        if (input.expectedTotal !== undefined && input.expectedTotal !== quote.pricing.total) {
          throw new ApiError(
            409,
            ERROR_CODES.PRICE_CHANGED,
            `The total changed to ${formatRupees(quote.pricing.total)}. Please review and try again.`,
          );
        }

        // 1) Reserve stock — atomic, conditional on availability.
        for (const [i, line] of lines.entries()) {
          const units = engine.lines[i]?.units ?? 0;
          const ok = await ProductVariant.updateOne(
            {
              _id: line.variantId,
              isActive: true,
              $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, units] },
            },
            { $inc: { reserved: units } },
            { session },
          );
          if (ok.modifiedCount === 0) {
            const name = live.products.get(line.productId)?.name ?? 'An item';
            throw new ApiError(
              409,
              ERROR_CODES.INSUFFICIENT_STOCK,
              `${name} just went out of stock. Please review your cart.`,
            );
          }
        }

        await refreshForVariants(
          lines.map((l) => l.variantId),
          session,
        );

        // 2) Reserve coupon usage — atomic, conditional on the global limit.
        if (coupon) {
          const ok = await Coupon.updateOne(
            {
              _id: coupon.id,
              isActive: true,
              $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
            },
            { $inc: { usedCount: 1 } },
            { session },
          );
          if (ok.modifiedCount === 0)
            throw new ApiError(
              422,
              ERROR_CODES.COUPON_INVALID,
              'This coupon has just been fully redeemed',
            );
        }

        // 3) Order, shipments and line snapshots.
        const user = await User.findById(userId).select('email phone').session(session).lean();
        const orderNumber = await nextOrderNumber(session);
        const address = quote.address;
        const expiresAt = new Date(Date.now() + platform.checkout.paymentWindowMinutes * 60_000);
        const [order] = await Order.create(
          [
            {
              orderNumber,
              user: userId,
              contact: { email: user?.email ?? '', phone: address.phone },
              shippingAddress: {
                fullName: address.fullName,
                phone: address.phone,
                line1: address.line1,
                line2: address.line2,
                landmark: address.landmark,
                city: address.city,
                state: address.state,
                pincode: address.pincode,
              },
              pricing: engine.pricing,
              coupon: { coupon: coupon?.id ?? null, code: coupon?.code ?? null },
              itemCount: engine.lines.reduce((s, l) => s + l.units, 0),
              sellerOrderCount: engine.shipments.length,
              status: 'PENDING_PAYMENT',
              paymentStatus: 'PENDING',
              statusHistory: [historyEntry('PENDING_PAYMENT', 'CUSTOMER', userId)],
              expiresAt,
              idempotencyKey,
            },
          ],
          { session },
        );
        if (!order) throw new Error('Order not created');

        const sellerDocs = await Seller.find({
          _id: { $in: engine.shipments.map((s) => s.sellerId) },
        })
          .select('commissionBps')
          .session(session)
          .lean();
        const commission = new Map(sellerDocs.map((s) => [s._id.toString(), s.commissionBps]));

        for (const [index, shipment] of engine.shipments.entries()) {
          const bps = commission.get(shipment.sellerId) ?? platform.commission.defaultBps;
          const shipmentLines = lines
            .map((line, i) => ({ line, priced: engine.lines[i] }))
            .filter(
              ({ line, priced }) => line.sellerId === shipment.sellerId && (priced?.units ?? 0) > 0,
            );
          const taxIncluded = shipmentLines.reduce(
            (s, { priced }) => s + (priced?.taxIncluded ?? 0),
            0,
          );
          const mrpTotal = shipmentLines.reduce((s, { priced }) => s + (priced?.mrpTotal ?? 0), 0);
          const [so] = await SellerOrder.create(
            [
              {
                order: order._id,
                subOrderNumber: `${orderNumber}-${String(index + 1)}`,
                user: userId,
                seller: shipment.sellerId,
                status: 'CONFIRMED',
                statusHistory: [],
                pricing: {
                  mrpTotal,
                  subtotal: shipment.subtotal,
                  couponDiscount: shipment.couponDiscount,
                  shippingFee: shipment.shippingFee,
                  taxIncluded,
                  total: shipment.total,
                },
                commissionBps: bps,
                commissionAmount: applyBps(shipment.subtotal - shipment.couponDiscount, bps),
                itemCount: shipment.itemCount,
              },
            ],
            { session },
          );
          if (!so) throw new Error('Shipment not created');
          await OrderItem.insertMany(
            shipmentLines.map(({ line, priced }) => {
              const variant = live.variants.get(line.variantId);
              const product = live.products.get(line.productId);
              const units = priced?.units ?? 0;
              return {
                order: order._id,
                sellerOrder: so._id,
                user: userId,
                seller: shipment.sellerId,
                product: line.productId,
                variant: line.variantId,
                snapshot: {
                  name: product?.name ?? '',
                  slug: product?.slug ?? '',
                  sku: variant?.sku ?? '',
                  brandName: product?.brandName ?? '',
                  image: variant?.image?.url ?? product?.image?.url ?? null,
                  options: variant?.options ?? {},
                },
                quantity: units,
                unitPrice: priced?.unitPrice ?? 0,
                unitMrp: Math.max(line.mrp, priced?.unitPrice ?? 0),
                lineSubtotal: priced?.lineSubtotal ?? 0,
                couponDiscount: priced?.couponDiscount ?? 0,
                gstRateBps: line.gstRateBps,
                taxIncluded: priced?.taxIncluded ?? 0,
                lineTotal: priced?.lineTotal ?? 0,
                returnable: product?.returnable ?? true,
                returnWindowDays: product?.returnWindowDays ?? platform.returns.defaultWindowDays,
              };
            }),
            { session },
          );
        }

        if (coupon && engine.pricing.couponDiscount > 0) {
          await CouponRedemption.create(
            [
              {
                coupon: coupon.id,
                user: userId,
                order: order._id,
                code: coupon.code,
                discount: engine.pricing.couponDiscount,
              },
            ],
            { session },
          );
        }
        await recordAudit(
          req,
          {
            action: 'order.created',
            resource: 'ORDER',
            resourceId: order._id.toString(),
            metadata: { orderNumber, total: engine.pricing.total },
            actorRole: 'CUSTOMER',
          },
          session,
        );
        return order;
      });

      // 4) Razorpay order (outside the transaction: network I/O). On failure, release.
      try {
        const rzp = await gateway.createOrder({
          amount: created.pricing.total,
          receipt: created.orderNumber,
          notes: { orderId: created._id.toString(), orderNumber: created.orderNumber },
        });
        await Payment.create({
          order: created._id,
          user: userId,
          razorpayOrderId: rzp.id,
          amount: created.pricing.total,
        });
        return await paymentInit(created, rzp.id);
      } catch (error) {
        await releaseOrder(
          created._id,
          'PAYMENT_FAILED',
          { role: 'SYSTEM', userId: null },
          'Could not start payment',
        );
        if (error instanceof ApiError) throw error;
        throw ApiError.serviceUnavailable('We could not start the payment. Please try again.');
      }
    },

    /** Resume payment for an order that is still within its payment window. */
    async resumePayment(userId: string, orderId: string): Promise<PaymentInit> {
      requireGateway(deps.gateway);
      const order = await Order.findOne({ _id: orderId, user: userId }).lean();
      if (!order) throw ApiError.notFound('Order not found');
      if (
        order.status !== 'PENDING_PAYMENT' ||
        !order.expiresAt ||
        order.expiresAt.getTime() < Date.now() + 30_000
      ) {
        throw new ApiError(
          409,
          ERROR_CODES.ORDER_NOT_PAYABLE,
          'This order can no longer be paid. Please place a new order.',
        );
      }
      const payment = await Payment.findOne({
        order: order._id,
        status: { $in: ['CREATED', 'FAILED'] },
      })
        .sort({ createdAt: -1 })
        .lean();
      if (!payment)
        throw new ApiError(409, ERROR_CODES.ORDER_NOT_PAYABLE, 'This order has no open payment');
      return paymentInit(order, payment.razorpayOrderId);
    },

    /**
     * Client callback after Razorpay Checkout. The signature proves the ids came from
     * Razorpay; we then fetch the payment server-side and check order id, amount and status —
     * nothing the browser claims about success is trusted on its own.
     */
    async verify(
      userId: string,
      input: VerifyPaymentInput,
    ): Promise<{ orderId: string; status: string }> {
      const gateway = requireGateway(deps.gateway);
      const payment = await Payment.findOne({
        razorpayOrderId: input.razorpayOrderId,
        user: userId,
      }).lean();
      if (!payment) throw ApiError.notFound('Payment not found');
      if (
        !gateway.verifyCheckoutSignature(
          input.razorpayOrderId,
          input.razorpayPaymentId,
          input.razorpaySignature,
        )
      ) {
        logger.warn(
          { razorpayOrderId: input.razorpayOrderId },
          'Invalid Razorpay checkout signature',
        );
        throw new ApiError(
          400,
          ERROR_CODES.PAYMENT_VERIFICATION_FAILED,
          'Payment could not be verified',
        );
      }
      let rp = await gateway.fetchPayment(input.razorpayPaymentId);
      if (rp.order_id !== input.razorpayOrderId) {
        throw new ApiError(
          400,
          ERROR_CODES.PAYMENT_VERIFICATION_FAILED,
          'Payment does not belong to this order',
        );
      }
      if (rp.status === 'authorized') rp = await gateway.capturePayment(rp.id, payment.amount);
      if (rp.status !== 'captured') {
        throw new ApiError(
          402,
          ERROR_CODES.PAYMENT_VERIFICATION_FAILED,
          'Payment was not completed',
        );
      }
      const result = await confirmPayment(rp, 'CLIENT_CALLBACK');
      return { orderId: result.orderId, status: result.outcome };
    },

    async paymentFailed(rp: RazorpayPayment): Promise<void> {
      if (!rp.order_id) return;
      await Payment.updateOne(
        { razorpayOrderId: rp.order_id, status: { $in: ['CREATED', 'AUTHORIZED'] } },
        {
          $set: {
            status: 'FAILED',
            failedAt: new Date(),
            errorCode: rp.error_code?.slice(0, 100) ?? null,
            errorDescription: rp.error_description?.slice(0, 500) ?? null,
          },
        },
      );
    },

    /** Job: expire unpaid orders whose payment window has passed. */
    async expireStaleOrders(): Promise<number> {
      const stale = await Order.find({ status: 'PENDING_PAYMENT', expiresAt: { $lt: new Date() } })
        .select('_id')
        .limit(100)
        .lean();
      let expired = 0;
      for (const { _id } of stale) {
        if (
          await releaseOrder(
            _id,
            'EXPIRED',
            { role: 'SYSTEM', userId: null },
            'Payment not completed in time',
          )
        ) {
          expired += 1;
        }
      }
      if (expired > 0) logger.info({ expired }, 'Expired unpaid orders');
      return expired;
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
