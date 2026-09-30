import { createAuthMiddleware, type AuthMiddleware } from './middleware/authenticate.js';
import { createAuthService, type AuthService } from './modules/auth/auth.service.js';
import { createPrincipalStore, type PrincipalStore } from './modules/auth/principal.js';
import { createSessionService } from './modules/auth/session.service.js';
import { createBrandService, type BrandService } from './modules/brands/brand.service.js';
import {
  createCategoryService,
  type CategoryService,
} from './modules/categories/category.service.js';
import { createCatalogService, type CatalogService } from './modules/products/catalog.service.js';
import {
  createInventoryService,
  type InventoryService,
} from './modules/products/inventory.service.js';
import {
  createSellerProductService,
  type SellerProductService,
} from './modules/products/seller-product.service.js';
import { createCartService, type CartService } from './modules/cart/cart.service.js';
import {
  createSettingsService,
  type SettingsService,
} from './modules/settings/settings.service.js';
import { createAddressService, type AddressService } from './modules/users/address.service.js';
import { createProfileService, type ProfileService } from './modules/users/profile.service.js';
import {
  createWishlistService,
  type WishlistService,
} from './modules/wishlist/wishlist.service.js';
import { createAdminService, type AdminService } from './modules/admin/admin.service.js';
import type { SessionService } from './modules/auth/session.service.js';
import {
  createCheckoutService,
  type CheckoutService,
} from './modules/checkout/checkout.service.js';
import {
  createPromotionService,
  type PromotionService,
} from './modules/coupons/promotion.service.js';
import {
  createEngagementService,
  type EngagementService,
} from './modules/engagement/engagement.service.js';
import {
  createFulfilmentService,
  type FulfilmentService,
} from './modules/orders/fulfilment.service.js';
import { createOrderService, type OrderService } from './modules/orders/order.service.js';
import { createRazorpayGateway, type PaymentGateway } from './modules/payments/razorpay.client.js';
import { createRefundService, type RefundService } from './modules/payments/refund.service.js';
import { createReviewService, type ReviewService } from './modules/reviews/review.service.js';
import {
  createSellerApplicationService,
  type SellerApplicationService,
} from './modules/sellers/seller-application.service.js';
import {
  createSellerProfileService,
  type SellerProfileService,
} from './modules/sellers/seller-profile.service.js';
import { createCloudinaryStorage, type ImageStorage } from './modules/uploads/image-storage.js';
import { createJsonCache } from './utils/cache.js';

export interface ContainerOptions {
  /** Test overrides. */
  principals?: PrincipalStore;
  /** `null` = storage not configured; `undefined` = build from env (Cloudinary). */
  storage?: ImageStorage | null;
  /** `null` = payments not configured; `undefined` = build from env (Razorpay). */
  gateway?: PaymentGateway | null;
}

/**
 * Composition root: builds every service once and wires dependencies explicitly (no hidden
 * singletons), so tests can swap any port (image storage, principal store).
 */
export interface Container {
  storage: ImageStorage | null;
  principals: PrincipalStore;
  auth: AuthMiddleware;
  authService: AuthService;
  categories: CategoryService;
  brands: BrandService;
  catalog: CatalogService;
  sellerProducts: SellerProductService;
  inventory: InventoryService;
  settings: SettingsService;
  cart: CartService;
  wishlist: WishlistService;
  addresses: AddressService;
  profile: ProfileService;
  sessions: SessionService;
  gateway: PaymentGateway | null;
  promotions: PromotionService;
  refunds: RefundService;
  checkout: CheckoutService;
  orders: OrderService;
  fulfilment: FulfilmentService;
  applications: SellerApplicationService;
  sellerProfile: SellerProfileService;
  reviews: ReviewService;
  engagement: EngagementService;
  admin: AdminService;
}

export function createContainer(options: ContainerOptions): Container {
  const cache = createJsonCache();
  const storage = options.storage === undefined ? createCloudinaryStorage() : options.storage;
  const principals = options.principals ?? createPrincipalStore();
  const sessions = createSessionService();

  const categories = createCategoryService(cache);
  const brands = createBrandService(cache);
  const settings = createSettingsService(cache);
  const catalog = createCatalogService({ categories, brands, cache });
  const onProductChanged = async (slug: string) => {
    await Promise.all([catalog.invalidateProduct(slug), cache.invalidatePrefix('facets:')]);
  };

  const gateway = options.gateway === undefined ? createRazorpayGateway() : options.gateway;
  const promotions = createPromotionService({ cache });
  const refunds = createRefundService({ gateway });
  const checkout = createCheckoutService({ settings, promotions, refunds, gateway });

  return {
    storage,
    principals,
    auth: createAuthMiddleware(principals),
    authService: createAuthService({ sessions }),
    categories,
    brands,
    catalog,
    sellerProducts: createSellerProductService({ storage, onProductChanged }),
    inventory: createInventoryService({ onProductChanged }),
    settings,
    cart: createCartService({ settings, promotions }),
    wishlist: createWishlistService(),
    addresses: createAddressService(),
    profile: createProfileService(),
    sessions,
    gateway,
    promotions,
    refunds,
    checkout,
    orders: createOrderService({ checkout, refunds }),
    fulfilment: createFulfilmentService({ refunds }),
    applications: createSellerApplicationService(),
    sellerProfile: createSellerProfileService(),
    reviews: createReviewService({ onProductChanged }),
    engagement: createEngagementService({ cache }),
    admin: createAdminService({ principals, sessions, onProductChanged }),
  };
}
