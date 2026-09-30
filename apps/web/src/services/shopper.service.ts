import type {
  AddressInput,
  AddressUpdateInput,
  AddressView,
  CartLineInput,
  CartView,
  NotificationPreferencesInput,
  ProductCard,
  ProfileUpdateInput,
  ProfileView,
  WishlistView,
} from '@zyventa/shared';
import { apiClient } from '@/lib/api-client';

const enc = encodeURIComponent;

/** Cart: the browser sends ids and quantities only; every response is priced by the API. */
export const cartService = {
  get: async () => (await apiClient.get<CartView>('/cart', { cache: 'no-store' })).data,
  preview: async (items: CartLineInput[]) =>
    (await apiClient.post<CartView>('/cart/preview', { items })).data,
  add: async (input: CartLineInput) => (await apiClient.post<CartView>('/cart/items', input)).data,
  setQuantity: async (variantId: string, quantity: number) =>
    (await apiClient.patch<CartView>(`/cart/items/${enc(variantId)}`, { quantity })).data,
  remove: async (variantId: string) =>
    (await apiClient.delete<CartView>(`/cart/items/${enc(variantId)}`)).data,
  clear: async () => (await apiClient.delete<CartView>('/cart')).data,
  merge: async (items: CartLineInput[]) =>
    (await apiClient.post<CartView>('/cart/merge', { items })).data,
};

export const wishlistService = {
  get: async () => (await apiClient.get<WishlistView>('/wishlist', { cache: 'no-store' })).data,
  ids: async () => (await apiClient.get<string[]>('/wishlist/ids', { cache: 'no-store' })).data,
  add: async (productId: string) =>
    (await apiClient.post<string[]>('/wishlist', { productId })).data,
  remove: async (productId: string) =>
    (await apiClient.delete<string[]>(`/wishlist/${enc(productId)}`)).data,
};

export const addressService = {
  list: async () => (await apiClient.get<AddressView[]>('/addresses', { cache: 'no-store' })).data,
  create: async (input: AddressInput) =>
    (await apiClient.post<AddressView>('/addresses', input)).data,
  update: async (id: string, input: AddressUpdateInput) =>
    (await apiClient.patch<AddressView>(`/addresses/${enc(id)}`, input)).data,
  setDefault: async (id: string) =>
    (await apiClient.post<AddressView[]>(`/addresses/${enc(id)}/default`)).data,
  remove: async (id: string) =>
    (await apiClient.delete<AddressView[]>(`/addresses/${enc(id)}`)).data,
};

export const profileService = {
  get: async () => (await apiClient.get<ProfileView>('/users/me', { cache: 'no-store' })).data,
  update: async (input: ProfileUpdateInput) =>
    (await apiClient.patch<ProfileView>('/users/me', input)).data,
  updatePreferences: async (input: NotificationPreferencesInput) =>
    (await apiClient.patch<ProfileView>('/users/me/notification-preferences', input)).data,
};

export const recentlyViewedService = {
  cards: async (slugs: string[]) =>
    slugs.length === 0
      ? []
      : (await apiClient.get<ProductCard[]>('/products/cards', { query: { slugs } })).data,
};
