/**
 * Registry of every Mongoose model. Importing this module compiles all schemas, which the
 * index-sync script, seed script and integration tests rely on.
 */
import { AuditLog } from '../modules/audit/audit-log.model.js';
import { AuthToken } from '../modules/auth/auth-token.model.js';
import { Session } from '../modules/auth/session.model.js';
import { Brand } from '../modules/brands/brand.model.js';
import { Cart } from '../modules/cart/cart.model.js';
import { Category } from '../modules/categories/category.model.js';
import { CouponRedemption } from '../modules/coupons/coupon-redemption.model.js';
import { Coupon } from '../modules/coupons/coupon.model.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { Offer } from '../modules/offers/offer.model.js';
import { OrderItem } from '../modules/orders/order-item.model.js';
import { Order } from '../modules/orders/order.model.js';
import { ReturnRequest } from '../modules/orders/return-request.model.js';
import { SellerOrder } from '../modules/orders/seller-order.model.js';
import { Payment } from '../modules/payments/payment.model.js';
import { Refund } from '../modules/payments/refund.model.js';
import { WebhookEvent } from '../modules/payments/webhook-event.model.js';
import { ProductVariant } from '../modules/products/product-variant.model.js';
import { Product } from '../modules/products/product.model.js';
import { Report } from '../modules/reports/report.model.js';
import { Review } from '../modules/reviews/review.model.js';
import { SellerApplication } from '../modules/sellers/seller-application.model.js';
import { SellerLedgerEntry } from '../modules/sellers/seller-ledger-entry.model.js';
import { Seller } from '../modules/sellers/seller.model.js';
import { PlatformSetting } from '../modules/settings/platform-setting.model.js';
import { StockAlert } from '../modules/stock-alerts/stock-alert.model.js';
import { Address } from '../modules/users/address.model.js';
import { User } from '../modules/users/user.model.js';
import { Wishlist } from '../modules/wishlist/wishlist.model.js';
import { Counter } from './counter.js';
import { IdempotencyKey } from './idempotency-key.model.js';
import { JobLock } from '../jobs/job-lock.model.js';

export const models = {
  User,
  Address,
  Session,
  AuthToken,
  Seller,
  SellerApplication,
  SellerLedgerEntry,
  Category,
  Brand,
  Product,
  ProductVariant,
  Cart,
  Wishlist,
  Order,
  SellerOrder,
  OrderItem,
  ReturnRequest,
  Payment,
  Refund,
  WebhookEvent,
  Coupon,
  CouponRedemption,
  Offer,
  Review,
  Notification,
  StockAlert,
  AuditLog,
  Report,
  PlatformSetting,
  Counter,
  IdempotencyKey,
  JobLock,
};

export type ModelName = keyof typeof models;
