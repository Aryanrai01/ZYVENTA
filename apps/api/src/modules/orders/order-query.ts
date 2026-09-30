import type { OrderDetail } from '@zyventa/shared';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { Payment } from '../payments/payment.model.js';
import { Refund } from '../payments/refund.model.js';
import { Seller } from '../sellers/seller.model.js';
import { User } from '../users/user.model.js';
import { OrderItem } from './order-item.model.js';
import {
  toOrderDetail,
  type OrderItemLean,
  type OrderLean,
  type PaymentLean,
  type RefundLean,
  type ReturnLean,
  type SellerOrderLean,
} from './order.mapper.js';
import { Order } from './order.model.js';
import { ReturnRequest } from './return-request.model.js';
import { SellerOrder } from './seller-order.model.js';

/** Loads a full order view. `filter` carries the ownership scope (e.g. `{ user }`). */
export async function loadOrderDetail(
  filter: Record<string, unknown>,
  options: { withCustomer?: boolean } = {},
): Promise<OrderDetail> {
  const order = await Order.findOne(filter).lean<OrderLean>();
  if (!order) throw ApiError.notFound('Order not found');
  const [sellerOrders, items, payment, refunds, returns] = await Promise.all([
    SellerOrder.find({ order: order._id }).sort({ subOrderNumber: 1 }).lean<SellerOrderLean[]>(),
    OrderItem.find({ order: order._id }).lean<OrderItemLean[]>(),
    Payment.findOne({ order: order._id })
      .sort({ capturedAt: -1, createdAt: -1 })
      .lean<PaymentLean>(),
    Refund.find({ order: order._id }).sort({ createdAt: -1 }).lean<RefundLean[]>(),
    ReturnRequest.find({ order: order._id }).sort({ createdAt: -1 }).lean<ReturnLean[]>(),
  ]);
  const sellers = await Seller.find({ _id: { $in: sellerOrders.map((s) => s.seller) } })
    .select('storeName')
    .lean();
  let customer: OrderDetail['customer'];
  if (options.withCustomer) {
    const u = await User.findById(order.user).select('name email').lean();
    if (u) customer = { id: u._id.toString(), name: u.name, email: u.email };
  }
  return toOrderDetail({
    order,
    sellerOrders,
    items,
    payment,
    refunds,
    returns,
    storeNames: new Map(sellers.map((s) => [s._id.toString(), s.storeName])),
    ...(customer ? { customer } : {}),
  });
}

export async function storeNameMap(ids: Types.ObjectId[]): Promise<Map<string, string>> {
  const sellers = await Seller.find({ _id: { $in: ids } })
    .select('storeName')
    .lean();
  return new Map(sellers.map((s) => [s._id.toString(), s.storeName]));
}
