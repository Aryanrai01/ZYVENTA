import {
  IDEMPOTENCY_HEADER,
  type CancelInput,
  type CheckoutInput,
  type CheckoutQuote,
  type NotificationView,
  type OrderDetail,
  type OrderListItem,
  type PaymentInit,
  type ProductCard,
  type PublicCoupon,
  type RatingSummary,
  type ReportInput,
  type ReturnInput,
  type ReviewInput,
  type ReviewUpdateInput,
  type ReviewView,
  type SellerApplicationInput,
  type SellerApplicationView,
  type StockAlertView,
  type VerifyPaymentInput,
} from '@zyventa/shared';
import { apiClient, type ApiResult } from '@/lib/api-client';

const enc = encodeURIComponent;

export const checkoutService = {
  quote: async (input: Partial<CheckoutInput>) =>
    (await apiClient.post<CheckoutQuote>('/checkout/quote', input)).data,
  /** `idempotencyKey` is generated once per checkout attempt so a retried click never double-orders. */
  placeOrder: async (input: CheckoutInput, idempotencyKey: string) =>
    (
      await apiClient.post<PaymentInit>('/checkout/orders', input, {
        headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      })
    ).data,
  verify: async (input: VerifyPaymentInput) =>
    (await apiClient.post<{ orderId: string; status: string }>('/checkout/verify', input)).data,
  coupons: async () => (await apiClient.get<PublicCoupon[]>('/coupons')).data,
};

export const orderService = {
  list: (query: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResult<OrderListItem[]>> =>
    apiClient.get<OrderListItem[]>('/orders', { query, cache: 'no-store' }),
  detail: async (id: string) =>
    (await apiClient.get<OrderDetail>(`/orders/${enc(id)}`, { cache: 'no-store' })).data,
  pay: async (id: string) => (await apiClient.post<PaymentInit>(`/orders/${enc(id)}/pay`)).data,
  cancel: async (id: string, input: CancelInput) =>
    (await apiClient.post<OrderDetail>(`/orders/${enc(id)}/cancel`, input)).data,
  cancelShipment: async (id: string, sellerOrderId: string, input: CancelInput) =>
    (
      await apiClient.post<OrderDetail>(
        `/orders/${enc(id)}/shipments/${enc(sellerOrderId)}/cancel`,
        input,
      )
    ).data,
  requestReturn: async (id: string, input: ReturnInput) =>
    (await apiClient.post<OrderDetail>(`/orders/${enc(id)}/returns`, input)).data,
  cancelReturn: async (id: string, returnId: string) =>
    (await apiClient.post<OrderDetail>(`/orders/${enc(id)}/returns/${enc(returnId)}/cancel`)).data,
};

export interface ReviewPage {
  items: ReviewView[];
  summary: RatingSummary;
}

export const engagementService = {
  reviews: (slug: string, query: { sort?: string; rating?: number; page?: number }) =>
    apiClient.get<ReviewPage>(`/products/${enc(slug)}/reviews`, { query }),
  eligibleReviews: async (slug: string) =>
    (
      await apiClient.get<{ orderItemId: string; label: string }[]>(
        `/products/${enc(slug)}/reviews/eligible`,
      )
    ).data,
  createReview: async (input: ReviewInput) =>
    (await apiClient.post<ReviewView>('/reviews', input)).data,
  updateReview: async (id: string, input: ReviewUpdateInput) =>
    (await apiClient.patch<ReviewView>(`/reviews/${enc(id)}`, input)).data,
  deleteReview: async (id: string) => {
    await apiClient.delete(`/reviews/${enc(id)}`);
  },
  report: async (input: ReportInput) => {
    await apiClient.post('/reports', input);
  },
  boughtTogether: async (slug: string) =>
    (await apiClient.get<ProductCard[]>(`/products/${enc(slug)}/bought-together`)).data,
  recommended: async (slugs: string[]) =>
    (
      await apiClient.get<ProductCard[]>('/recommendations', {
        query: { slugs: slugs.length ? slugs : undefined },
      })
    ).data,

  notifications: (query: { unread?: boolean; page?: number }) =>
    apiClient.get<{ items: NotificationView[]; unread: number }>('/notifications', {
      query,
      cache: 'no-store',
    }),
  unreadCount: async () =>
    (await apiClient.get<{ unread: number }>('/notifications/unread-count', { cache: 'no-store' }))
      .data.unread,
  markRead: async (id: string | 'all') =>
    (await apiClient.post<{ unread: number }>('/notifications/read', { id })).data.unread,

  stockAlerts: async () =>
    (await apiClient.get<StockAlertView[]>('/stock-alerts', { cache: 'no-store' })).data,
  alertStatus: async (variantIds: string[]) =>
    (await apiClient.get<string[]>('/stock-alerts/status', { query: { variants: variantIds } }))
      .data,
  subscribe: async (variantId: string) => {
    await apiClient.post('/stock-alerts', { variantId });
  },
  unsubscribe: async (variantId: string) => {
    await apiClient.delete(`/stock-alerts/${enc(variantId)}`);
  },

  myApplication: async () =>
    (
      await apiClient.get<SellerApplicationView | null>('/seller-applications/me', {
        cache: 'no-store',
      })
    ).data,
  apply: async (input: SellerApplicationInput) =>
    (await apiClient.post<SellerApplicationView>('/seller-applications', input)).data,
  withdrawApplication: async () => {
    await apiClient.delete('/seller-applications/me');
  },
};
