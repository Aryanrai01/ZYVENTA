import type {
  AdminDashboard,
  AdminProductRow,
  AdminReviewRow,
  AdminSellerRow,
  AdminUserRow,
  ApplicationDecisionInput,
  AuditRow,
  BrandInput,
  BrandSummary,
  BrandUpdateInput,
  CategoryInput,
  CategoryUpdateInput,
  CouponInput,
  CouponUpdateInput,
  CouponView,
  OfferInput,
  OfferUpdateInput,
  OfferView,
  OrderDetail,
  OrderPaymentStatus,
  OrderStatus,
  PlatformSettingsInput,
  PlatformSettingsView,
  ProductModerationInput,
  ReportResolutionInput,
  ReturnDecisionInput,
  ReviewModerationInput,
  SellerApplicationView,
  SellerOrderDetail,
  SellerOrderStatusUpdate,
  SellerReturnRow,
  SellerStatusUpdate,
  UserStatusUpdate,
} from '@zyventa/shared';
import { apiClient } from '@/lib/api-client';

type Query = Record<string, string | number | boolean | undefined>;

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: number;
  itemCount: number;
  customer: string;
  email: string;
  createdAt: string;
}

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amount: number;
  amountRefunded: number;
  status: string;
  method: string | null;
  verifiedVia: string | null;
  createdAt: string;
}

export interface AdminRefundRow {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  reason: string;
  status: string;
  failureReason: string | null;
  razorpayRefundId: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface AdminReportRow {
  id: string;
  targetType: string;
  targetId: string;
  target: { label: string; link: string | null };
  reason: string;
  details: string;
  status: string;
  reporter: string;
  createdAt: string;
  resolution: { action: string; note: string } | null;
}

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  gstRateBps: number;
  productCount: number;
}

const list =
  <T>(path: string) =>
  (query: Query) =>
    apiClient.get<T[]>(path, { query, cache: 'no-store' });

/** Admin API. Every call is authorised server-side (ADMIN role); the UI gate is only UX. */
export const adminService = {
  dashboard: async (days = 30) =>
    (await apiClient.get<AdminDashboard>('/admin/dashboard', { query: { days } })).data,

  users: list<AdminUserRow>('/admin/users'),
  setUserStatus: (id: string, input: UserStatusUpdate) =>
    apiClient.patch(`/admin/users/${id}/status`, input),

  applications: list<SellerApplicationView>('/admin/seller-applications'),
  decideApplication: (id: string, input: ApplicationDecisionInput) =>
    apiClient.post(`/admin/seller-applications/${id}/decision`, input),
  sellers: list<AdminSellerRow>('/admin/sellers'),
  setSellerStatus: (id: string, input: SellerStatusUpdate) =>
    apiClient.patch(`/admin/sellers/${id}/status`, input),

  products: list<AdminProductRow>('/admin/products'),
  moderateProduct: (id: string, input: ProductModerationInput) =>
    apiClient.post(`/admin/products/${id}/moderation`, input),

  categories: async () =>
    (await apiClient.get<AdminCategoryRow[]>('/admin/categories', { cache: 'no-store' })).data,
  createCategory: (input: CategoryInput) => apiClient.post('/admin/categories', input),
  updateCategory: (id: string, input: CategoryUpdateInput) =>
    apiClient.patch(`/admin/categories/${id}`, input),
  deleteCategory: (id: string) => apiClient.delete(`/admin/categories/${id}`),
  brands: async () => (await apiClient.get<BrandSummary[]>('/brands', { cache: 'no-store' })).data,
  createBrand: (input: BrandInput) => apiClient.post('/admin/brands', input),
  updateBrand: (id: string, input: BrandUpdateInput) =>
    apiClient.patch(`/admin/brands/${id}`, input),
  deleteBrand: (id: string) => apiClient.delete(`/admin/brands/${id}`),

  orders: list<AdminOrderRow>('/admin/orders'),
  order: async (id: string) =>
    (await apiClient.get<OrderDetail>(`/admin/orders/${id}`, { cache: 'no-store' })).data,
  cancelOrder: async (id: string, reason: string) =>
    (await apiClient.post<OrderDetail>(`/admin/orders/${id}/cancel`, { reason })).data,
  refundOrder: async (id: string, amount: number, note: string) =>
    (await apiClient.post<OrderDetail>(`/admin/orders/${id}/refund`, { amount, note })).data,
  updateShipment: async (id: string, input: SellerOrderStatusUpdate) =>
    (await apiClient.patch<SellerOrderDetail>(`/admin/shipments/${id}/status`, input)).data,
  returns: list<SellerReturnRow>('/admin/returns'),
  decideReturn: (id: string, input: ReturnDecisionInput) =>
    apiClient.patch(`/admin/returns/${id}`, input),

  payments: list<AdminPaymentRow>('/admin/payments'),
  refunds: list<AdminRefundRow>('/admin/refunds'),
  retryRefund: (id: string) => apiClient.post(`/admin/refunds/${id}/retry`),

  coupons: list<CouponView>('/admin/coupons'),
  createCoupon: (input: CouponInput) => apiClient.post<CouponView>('/admin/coupons', input),
  updateCoupon: (id: string, input: CouponUpdateInput) =>
    apiClient.patch<CouponView>(`/admin/coupons/${id}`, input),
  offers: list<OfferView>('/admin/offers'),
  createOffer: (input: OfferInput) => apiClient.post<OfferView>('/admin/offers', input),
  updateOffer: (id: string, input: OfferUpdateInput) =>
    apiClient.patch<OfferView>(`/admin/offers/${id}`, input),

  reviews: list<AdminReviewRow>('/admin/reviews'),
  moderateReview: (id: string, input: ReviewModerationInput) =>
    apiClient.patch(`/admin/reviews/${id}`, input),
  reports: list<AdminReportRow>('/admin/reports'),
  resolveReport: (id: string, input: ReportResolutionInput) =>
    apiClient.patch(`/admin/reports/${id}`, input),

  settings: async () =>
    (await apiClient.get<PlatformSettingsView>('/admin/settings', { cache: 'no-store' })).data,
  updateSettings: async (input: PlatformSettingsInput) =>
    (await apiClient.patch<PlatformSettingsView>('/admin/settings', input)).data,
  audit: list<AuditRow>('/admin/audit-logs'),
};
