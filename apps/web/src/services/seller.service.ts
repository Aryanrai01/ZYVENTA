import type {
  AdminReviewRow,
  CouponInput,
  CouponUpdateInput,
  CouponView,
  OfferInput,
  OfferUpdateInput,
  OfferView,
  PayoutAccountInput,
  ReturnDecisionInput,
  ReviewView,
  SellerDashboard,
  SellerOrderDetail,
  SellerOrderRow,
  SellerOrderStatusUpdate,
  SellerProfileUpdateInput,
  SellerProfileView,
  SellerReturnRow,
  CreateProductInput,
  InventoryRow,
  SellerProductDetail,
  SellerProductRow,
  StockUpdateInput,
  UpdateProductInput,
  UploadedImage,
  VariantInput,
  VariantUpdateInput,
} from '@zyventa/shared';
import { apiClient, apiRequest, type ApiResult } from '@/lib/api-client';

/** Seller Center API (all calls are authenticated and scoped to the signed-in seller). */
export const sellerService = {
  products: (query: {
    q?: string;
    status?: string;
    lowStock?: boolean;
    page?: number;
    limit?: number;
  }): Promise<ApiResult<SellerProductRow[]>> =>
    apiClient.get<SellerProductRow[]>('/seller/products', { query }),

  product: async (id: string) =>
    (await apiClient.get<SellerProductDetail>(`/seller/products/${id}`)).data,

  createProduct: async (input: CreateProductInput) =>
    (await apiClient.post<SellerProductDetail>('/seller/products', input)).data,

  updateProduct: async (id: string, input: UpdateProductInput) =>
    (await apiClient.patch<SellerProductDetail>(`/seller/products/${id}`, input)).data,

  archiveProduct: async (id: string) => {
    await apiClient.delete(`/seller/products/${id}`);
  },

  addVariant: async (productId: string, input: VariantInput) =>
    (await apiClient.post<SellerProductDetail>(`/seller/products/${productId}/variants`, input))
      .data,

  updateVariant: async (productId: string, variantId: string, input: VariantUpdateInput) =>
    (
      await apiClient.patch<SellerProductDetail>(
        `/seller/products/${productId}/variants/${variantId}`,
        input,
      )
    ).data,

  inventory: (query: {
    q?: string;
    filter?: 'all' | 'low' | 'out';
    page?: number;
    limit?: number;
  }) => apiClient.get<InventoryRow[]>('/seller/inventory', { query }),

  updateStock: async (variantId: string, input: StockUpdateInput) =>
    (await apiClient.patch<InventoryRow>(`/seller/inventory/${variantId}`, input)).data,

  uploadImages: async (files: File[], purpose: 'product' | 'category' | 'brand' = 'product') => {
    const form = new FormData();
    for (const file of files) form.append('images', file);
    form.append('purpose', purpose);
    return (await apiClient.post<UploadedImage[]>('/uploads/images', form)).data;
  },

  deleteImage: async (publicId: string) => {
    await apiRequest('/uploads/images', { method: 'DELETE', body: { publicId } });
  },

  dashboard: async (days = 30) =>
    (await apiClient.get<SellerDashboard>('/seller/dashboard', { query: { days } })).data,
  profile: async () => (await apiClient.get<SellerProfileView>('/seller/profile')).data,
  updateProfile: async (input: SellerProfileUpdateInput) =>
    (await apiClient.patch<SellerProfileView>('/seller/profile', input)).data,
  setPayoutAccount: async (input: PayoutAccountInput) =>
    (await apiClient.put<SellerProfileView>('/seller/payout-account', input)).data,

  orders: (query: { status?: string; q?: string; page?: number }) =>
    apiClient.get<SellerOrderRow[]>('/seller/orders', { query }),
  order: async (id: string) =>
    (await apiClient.get<SellerOrderDetail>(`/seller/orders/${id}`)).data,
  updateOrderStatus: async (id: string, input: SellerOrderStatusUpdate) =>
    (await apiClient.patch<SellerOrderDetail>(`/seller/orders/${id}/status`, input)).data,
  returns: (query: { status?: string; page?: number }) =>
    apiClient.get<SellerReturnRow[]>('/seller/returns', { query }),
  decideReturn: async (id: string, input: ReturnDecisionInput) =>
    (await apiClient.patch<SellerReturnRow>(`/seller/returns/${id}`, input)).data,

  coupons: (query: { status?: string; page?: number }) =>
    apiClient.get<CouponView[]>('/seller/coupons', { query }),
  createCoupon: async (input: CouponInput) =>
    (await apiClient.post<CouponView>('/seller/coupons', input)).data,
  updateCoupon: async (id: string, input: CouponUpdateInput) =>
    (await apiClient.patch<CouponView>(`/seller/coupons/${id}`, input)).data,
  offers: (query: { status?: string; page?: number }) =>
    apiClient.get<OfferView[]>('/seller/offers', { query }),
  createOffer: async (input: OfferInput) =>
    (await apiClient.post<OfferView>('/seller/offers', input)).data,
  updateOffer: async (id: string, input: OfferUpdateInput) =>
    (await apiClient.patch<OfferView>(`/seller/offers/${id}`, input)).data,

  reviews: (query: { page?: number }) =>
    apiClient.get<(ReviewView & Pick<AdminReviewRow, 'product'>)[]>('/seller/reviews', { query }),
  respondToReview: async (id: string, body: string) =>
    (await apiClient.put<ReviewView>(`/seller/reviews/${id}/response`, { body })).data,
};
