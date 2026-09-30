import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  adminOrderListQuerySchema,
  adminProductListQuerySchema,
  adminRefundSchema,
  adminReportListQuerySchema,
  adminReviewListQuerySchema,
  adminSellerListQuerySchema,
  adminUserListQuerySchema,
  analyticsRangeSchema,
  applicationDecisionSchema,
  applicationListQuerySchema,
  auditListQuerySchema,
  cancelInputSchema,
  checkoutInputSchema,
  couponInputSchema,
  couponUpdateSchema,
  notificationListQuerySchema,
  offerInputSchema,
  offerUpdateSchema,
  orderListQuerySchema,
  payoutAccountInputSchema,
  platformSettingsSchema,
  productModerationSchema,
  promotionListQuerySchema,
  reportInputSchema,
  reportResolutionSchema,
  returnDecisionSchema,
  returnInputSchema,
  returnListQuerySchema,
  reviewInputSchema,
  reviewListQuerySchema,
  reviewModerationSchema,
  reviewUpdateSchema,
  sellerApplicationInputSchema,
  sellerOrderListQuerySchema,
  sellerOrderStatusUpdateSchema,
  sellerProfileUpdateSchema,
  sellerResponseSchema,
  sellerStatusUpdateSchema,
  stockAlertInputSchema,
  userStatusUpdateSchema,
  verifyPaymentSchema,
} from '@zyventa/shared';
import { z } from 'zod';
import { errorEnvelope, successEnvelope } from './schemas.js';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
interface Endpoint {
  method: Method;
  path: string;
  summary: string;
  body?: z.ZodType;
  query?: z.ZodType;
  public?: boolean;
  status?: number;
}

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const secured: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];
const anyData = z.object({}).catchall(z.unknown());

function register(registry: OpenAPIRegistry, tag: string, endpoints: Endpoint[]) {
  for (const e of endpoints) {
    const params = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
    registry.registerPath({
      method: e.method,
      path: e.path,
      tags: [tag],
      summary: e.summary,
      ...(e.public ? {} : { security: secured }),
      request: {
        ...(params.length
          ? { params: z.object(Object.fromEntries(params.map((p) => [p, z.string()]))) }
          : {}),
        ...(e.query ? { query: e.query as z.ZodObject } : {}),
        ...(e.body ? { body: json(e.body) } : {}),
      },
      responses: {
        [e.status ?? 200]: { description: 'Success', ...json(successEnvelope(anyData)) },
        400: { description: 'Validation error', ...json(errorEnvelope) },
        ...(e.public ? {} : { 401: { description: 'Not signed in', ...json(errorEnvelope) } }),
      },
    });
  }
}

export function registerCommerceDocs(registry: OpenAPIRegistry): void {
  register(registry, 'Checkout', [
    {
      method: 'post',
      path: '/checkout/quote',
      summary: 'Server-priced quote for the cart (offers, coupon, shipping, GST)',
      body: checkoutInputSchema.partial(),
    },
    {
      method: 'post',
      path: '/checkout/orders',
      summary:
        'Place order: reserves stock + coupon, creates a Razorpay order. Requires Idempotency-Key header and a verified email.',
      body: checkoutInputSchema,
      status: 201,
    },
    {
      method: 'post',
      path: '/checkout/verify',
      summary: 'Verify Razorpay checkout signature, fetch payment server-side, confirm order',
      body: verifyPaymentSchema,
    },
    {
      method: 'post',
      path: '/webhooks/razorpay',
      summary: 'Razorpay webhook (HMAC-signed raw body; deduplicated by event id)',
      public: true,
    },
  ]);
  register(registry, 'Orders', [
    { method: 'get', path: '/orders', summary: 'My orders', query: orderListQuerySchema },
    {
      method: 'get',
      path: '/orders/{id}',
      summary: 'Order detail with shipments, tracking, refunds and returns',
    },
    {
      method: 'post',
      path: '/orders/{id}/pay',
      summary: 'Resume payment within the payment window',
    },
    {
      method: 'post',
      path: '/orders/{id}/cancel',
      summary: 'Cancel an unpaid order or every cancellable shipment',
      body: cancelInputSchema,
    },
    {
      method: 'post',
      path: '/orders/{id}/shipments/{sellerOrderId}/cancel',
      summary: 'Cancel one shipment (before packing)',
      body: cancelInputSchema,
    },
    {
      method: 'post',
      path: '/orders/{id}/returns',
      summary: 'Request a return (delivered, within window)',
      body: returnInputSchema,
      status: 201,
    },
    {
      method: 'post',
      path: '/orders/{id}/returns/{returnId}/cancel',
      summary: 'Withdraw a return request',
    },
  ]);
  register(registry, 'Engagement', [
    {
      method: 'get',
      path: '/settings',
      summary: 'Public settings (maintenance banner, free-delivery threshold, support)',
      public: true,
    },
    {
      method: 'get',
      path: '/coupons',
      summary: 'Public coupons currently available',
      public: true,
    },
    {
      method: 'get',
      path: '/products/{slug}/reviews',
      summary: 'Published reviews with rating summary',
      query: reviewListQuerySchema,
      public: true,
    },
    {
      method: 'get',
      path: '/products/{slug}/reviews/eligible',
      summary: 'Purchases of this product I can review',
    },
    {
      method: 'get',
      path: '/products/{slug}/bought-together',
      summary: 'Frequently bought together',
      public: true,
    },
    {
      method: 'get',
      path: '/recommendations',
      summary: 'Recommended for you (from recently viewed slugs)',
      public: true,
    },
    {
      method: 'post',
      path: '/reviews',
      summary: 'Write a verified-purchase review',
      body: reviewInputSchema,
      status: 201,
    },
    { method: 'patch', path: '/reviews/{id}', summary: 'Edit my review', body: reviewUpdateSchema },
    { method: 'delete', path: '/reviews/{id}', summary: 'Delete my review' },
    {
      method: 'post',
      path: '/reports',
      summary: 'Report a product, review or seller',
      body: reportInputSchema,
      status: 201,
    },
    {
      method: 'get',
      path: '/notifications',
      summary: 'My notifications',
      query: notificationListQuerySchema,
    },
    { method: 'get', path: '/notifications/unread-count', summary: 'Unread badge count' },
    {
      method: 'post',
      path: '/notifications/read',
      summary: 'Mark one (id) or all ("all") as read',
      body: z.object({ id: z.string() }),
    },
    { method: 'get', path: '/stock-alerts', summary: 'My back-in-stock alerts' },
    {
      method: 'post',
      path: '/stock-alerts',
      summary: 'Notify me when an out-of-stock variant is back',
      body: stockAlertInputSchema,
      status: 201,
    },
    { method: 'delete', path: '/stock-alerts/{variantId}', summary: 'Remove an alert' },
  ]);
  register(registry, 'Sellers', [
    { method: 'get', path: '/seller-applications/me', summary: 'My latest seller application' },
    {
      method: 'post',
      path: '/seller-applications',
      summary: 'Apply to sell (verified email)',
      body: sellerApplicationInputSchema,
      status: 201,
    },
    {
      method: 'delete',
      path: '/seller-applications/me',
      summary: 'Withdraw a pending application',
    },
    {
      method: 'get',
      path: '/seller/dashboard',
      summary: 'Seller KPIs, sales series, top products, balance',
      query: analyticsRangeSchema,
    },
    { method: 'get', path: '/seller/profile', summary: 'Store profile' },
    {
      method: 'patch',
      path: '/seller/profile',
      summary: 'Update store profile',
      body: sellerProfileUpdateSchema,
    },
    {
      method: 'put',
      path: '/seller/payout-account',
      summary: 'Set bank details (account number encrypted at rest)',
      body: payoutAccountInputSchema,
    },
    {
      method: 'get',
      path: '/seller/orders',
      summary: 'My paid shipments',
      query: sellerOrderListQuerySchema,
    },
    {
      method: 'get',
      path: '/seller/orders/{id}',
      summary: 'Shipment detail with allowed next statuses',
    },
    {
      method: 'patch',
      path: '/seller/orders/{id}/status',
      summary: 'Advance shipment (state machine enforced)',
      body: sellerOrderStatusUpdateSchema,
    },
    {
      method: 'get',
      path: '/seller/returns',
      summary: 'Return requests',
      query: returnListQuerySchema,
    },
    {
      method: 'patch',
      path: '/seller/returns/{id}',
      summary: 'Approve / reject / picked up / received (refund on receipt)',
      body: returnDecisionSchema,
    },
    {
      method: 'get',
      path: '/seller/coupons',
      summary: 'Seller-funded coupons',
      query: promotionListQuerySchema,
    },
    {
      method: 'post',
      path: '/seller/coupons',
      summary: 'Create a seller-funded coupon (own catalogue only)',
      body: couponInputSchema,
      status: 201,
    },
    {
      method: 'patch',
      path: '/seller/coupons/{id}',
      summary: 'Update coupon',
      body: couponUpdateSchema,
    },
    {
      method: 'get',
      path: '/seller/offers',
      summary: 'Automatic offers',
      query: promotionListQuerySchema,
    },
    {
      method: 'post',
      path: '/seller/offers',
      summary: 'Create an automatic offer (own catalogue only)',
      body: offerInputSchema,
      status: 201,
    },
    {
      method: 'patch',
      path: '/seller/offers/{id}',
      summary: 'Update offer',
      body: offerUpdateSchema,
    },
    { method: 'get', path: '/seller/reviews', summary: 'Reviews of my products' },
    {
      method: 'put',
      path: '/seller/reviews/{id}/response',
      summary: 'Publish a response',
      body: sellerResponseSchema,
    },
  ]);
  register(registry, 'Admin', [
    {
      method: 'get',
      path: '/admin/dashboard',
      summary: 'Platform KPIs',
      query: analyticsRangeSchema,
    },
    { method: 'get', path: '/admin/users', summary: 'Users', query: adminUserListQuerySchema },
    {
      method: 'patch',
      path: '/admin/users/{id}/status',
      summary: 'Suspend / reactivate (revokes sessions)',
      body: userStatusUpdateSchema,
    },
    {
      method: 'get',
      path: '/admin/seller-applications',
      summary: 'Seller applications',
      query: applicationListQuerySchema,
    },
    {
      method: 'post',
      path: '/admin/seller-applications/{id}/decision',
      summary: 'Approve or reject',
      body: applicationDecisionSchema,
    },
    {
      method: 'get',
      path: '/admin/sellers',
      summary: 'Sellers',
      query: adminSellerListQuerySchema,
    },
    {
      method: 'patch',
      path: '/admin/sellers/{id}/status',
      summary: 'Suspend / reactivate seller (hides listings)',
      body: sellerStatusUpdateSchema,
    },
    {
      method: 'get',
      path: '/admin/products',
      summary: 'All products',
      query: adminProductListQuerySchema,
    },
    {
      method: 'post',
      path: '/admin/products/{id}/moderation',
      summary: 'Block / unblock / feature',
      body: productModerationSchema,
    },
    { method: 'get', path: '/admin/orders', summary: 'Orders', query: adminOrderListQuerySchema },
    { method: 'get', path: '/admin/orders/{id}', summary: 'Order detail' },
    {
      method: 'post',
      path: '/admin/orders/{id}/cancel',
      summary: 'Cancel order (refunds paid shipments)',
      body: cancelInputSchema,
    },
    {
      method: 'post',
      path: '/admin/orders/{id}/refund',
      summary: 'Goodwill refund',
      body: adminRefundSchema,
    },
    {
      method: 'patch',
      path: '/admin/shipments/{id}/status',
      summary: 'Move any shipment',
      body: sellerOrderStatusUpdateSchema,
    },
    { method: 'get', path: '/admin/returns', summary: 'All returns', query: returnListQuerySchema },
    {
      method: 'patch',
      path: '/admin/returns/{id}',
      summary: 'Decide a return',
      body: returnDecisionSchema,
    },
    { method: 'get', path: '/admin/payments', summary: 'Payments' },
    { method: 'get', path: '/admin/refunds', summary: 'Refunds' },
    { method: 'post', path: '/admin/refunds/{id}/retry', summary: 'Retry a failed refund' },
    {
      method: 'get',
      path: '/admin/coupons',
      summary: 'Platform coupons',
      query: promotionListQuerySchema,
    },
    {
      method: 'post',
      path: '/admin/coupons',
      summary: 'Create coupon',
      body: couponInputSchema,
      status: 201,
    },
    {
      method: 'patch',
      path: '/admin/coupons/{id}',
      summary: 'Update coupon',
      body: couponUpdateSchema,
    },
    {
      method: 'get',
      path: '/admin/offers',
      summary: 'Platform offers',
      query: promotionListQuerySchema,
    },
    {
      method: 'post',
      path: '/admin/offers',
      summary: 'Create offer',
      body: offerInputSchema,
      status: 201,
    },
    {
      method: 'patch',
      path: '/admin/offers/{id}',
      summary: 'Update offer',
      body: offerUpdateSchema,
    },
    {
      method: 'get',
      path: '/admin/reviews',
      summary: 'Review moderation queue',
      query: adminReviewListQuerySchema,
    },
    {
      method: 'patch',
      path: '/admin/reviews/{id}',
      summary: 'Publish / hide / remove review',
      body: reviewModerationSchema,
    },
    {
      method: 'get',
      path: '/admin/reports',
      summary: 'Reports queue',
      query: adminReportListQuerySchema,
    },
    {
      method: 'patch',
      path: '/admin/reports/{id}',
      summary: 'Resolve report (with enforcement action)',
      body: reportResolutionSchema,
    },
    { method: 'get', path: '/admin/settings', summary: 'Platform settings' },
    {
      method: 'patch',
      path: '/admin/settings',
      summary: 'Update settings',
      body: platformSettingsSchema,
    },
    {
      method: 'get',
      path: '/admin/audit-logs',
      summary: 'Audit trail',
      query: auditListQuerySchema,
    },
  ]);
}
