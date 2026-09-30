import { Router } from 'express';
import type { Container } from '../container.js';
import { createAdminRouter } from '../modules/admin/admin.routes.js';
import { createCartRouter } from '../modules/cart/cart.routes.js';
import { createCheckoutRouter, createOrderRouter } from '../modules/checkout/checkout.routes.js';
import { createEngagementRouter } from '../modules/engagement/engagement.routes.js';
import { createSellerApplicationRouter } from '../modules/sellers/seller-application.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createHealthRouter, type HealthDependencies } from '../modules/health/health.routes.js';
import {
  createBrandRouter,
  createCategoryRouter,
  createProductRouter,
} from '../modules/products/catalog.routes.js';
import { createSellerRouter } from '../modules/sellers/seller.routes.js';
import { createSettingsRouter } from '../modules/settings/settings.routes.js';
import { createUploadRouter } from '../modules/uploads/uploads.routes.js';
import { createAddressRouter, createProfileRouter } from '../modules/users/users.routes.js';
import { createWishlistRouter } from '../modules/wishlist/wishlist.routes.js';

/**
 * Versioned API surface. Webhooks are mounted separately in app.ts (raw body, before the
 * JSON parser and CSRF check).
 */
export function createV1Router(c: Container, health: HealthDependencies): Router {
  const router = Router();
  router.use('/health', createHealthRouter(health));
  router.use('/auth', createAuthRouter({ service: c.authService, auth: c.auth }));

  router.use('/settings', createSettingsRouter({ settings: c.settings }));
  router.use('/categories', createCategoryRouter(c.categories));
  router.use('/brands', createBrandRouter(c.brands));
  router.use('/products', createProductRouter(c.catalog));

  router.use('/users/me', createProfileRouter({ auth: c.auth, profile: c.profile }));
  router.use('/addresses', createAddressRouter({ auth: c.auth, addresses: c.addresses }));
  router.use('/cart', createCartRouter({ auth: c.auth, cart: c.cart }));
  router.use('/wishlist', createWishlistRouter({ auth: c.auth, wishlist: c.wishlist }));

  router.use('/checkout', createCheckoutRouter({ auth: c.auth, checkout: c.checkout }));
  router.use(
    '/orders',
    createOrderRouter({ auth: c.auth, orders: c.orders, checkout: c.checkout }),
  );
  router.use(
    '/seller-applications',
    createSellerApplicationRouter({ auth: c.auth, applications: c.applications }),
  );

  router.use('/uploads', createUploadRouter({ auth: c.auth, storage: c.storage }));
  router.use(
    '/seller',
    createSellerRouter({
      auth: c.auth,
      products: c.sellerProducts,
      inventory: c.inventory,
      profile: c.sellerProfile,
      fulfilment: c.fulfilment,
      promotions: c.promotions,
      reviews: c.reviews,
    }),
  );
  router.use(
    '/admin',
    createAdminRouter({
      auth: c.auth,
      categories: c.categories,
      brands: c.brands,
      admin: c.admin,
      applications: c.applications,
      fulfilment: c.fulfilment,
      promotions: c.promotions,
      refunds: c.refunds,
      checkout: c.checkout,
      settings: c.settings,
    }),
  );
  // Mixed public/private endpoints at the root; auth is applied per route inside.
  router.use(
    createEngagementRouter({
      auth: c.auth,
      engagement: c.engagement,
      reviews: c.reviews,
      promotions: c.promotions,
    }),
  );
  return router;
}
