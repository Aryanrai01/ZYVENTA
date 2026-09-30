import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  CART_LINE_STATUSES,
  addCartItemSchema,
  addressInputSchema,
  addressUpdateSchema,
  cartLinesSchema,
  notificationPreferencesSchema,
  profileUpdateSchema,
  updateCartItemSchema,
  wishlistAddSchema,
} from '@zyventa/shared';
import { z } from 'zod';
import { errorEnvelope, successEnvelope } from '../../docs/schemas.js';

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const err = (description: string) => ({ description, ...json(errorEnvelope) });
const obj = (description: string) => z.object({}).catchall(z.unknown()).describe(description);
const secured: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];
const paise = z.number().int().describe('paise');

const cartView = z
  .object({
    items: z.array(
      z.object({
        variantId: z.string(),
        productId: z.string(),
        slug: z.string(),
        name: z.string(),
        unitPrice: paise,
        unitMrp: paise,
        quantity: z.number().int(),
        maxQuantity: z.number().int(),
        lineTotal: paise,
        status: z.enum(CART_LINE_STATUSES),
        previousUnitPrice: paise.nullable(),
      }),
    ),
    shipments: z.array(
      z.object({ subtotal: paise, shippingFee: paise, amountToFreeShipping: paise }),
    ),
    summary: z.object({
      itemCount: z.number().int(),
      subtotal: paise,
      mrpTotal: paise,
      savings: paise,
      shippingFee: paise,
      total: paise,
      freeShippingThreshold: paise,
    }),
    hasIssues: z.boolean(),
  })
  .describe('CartView — every amount is computed by the server from live catalogue data');

const variantParam = z.object({ variantId: z.string().describe('ObjectId') });
const idParam = z.object({ id: z.string().describe('ObjectId') });
const productParam = z.object({ productId: z.string().describe('ObjectId') });

const common = {
  401: err('Not signed in'),
  403: err('Missing or invalid CSRF token'),
};

export function registerShopperDocs(registry: OpenAPIRegistry): void {
  // ── Cart ──────────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/cart',
    tags: ['Cart'],
    summary: 'The signed-in shopper’s cart, priced from live data',
    security: secured,
    responses: { 200: { description: 'Cart', ...json(successEnvelope(cartView)) }, ...common },
  });
  registry.registerPath({
    method: 'post',
    path: '/cart/preview',
    tags: ['Cart'],
    summary: 'Price a guest cart held in the browser (nothing is stored)',
    request: { body: json(cartLinesSchema) },
    responses: { 200: { description: 'Priced cart', ...json(successEnvelope(cartView)) } },
  });
  registry.registerPath({
    method: 'post',
    path: '/cart/items',
    tags: ['Cart'],
    summary: 'Add units of a variant',
    security: secured,
    request: { body: json(addCartItemSchema) },
    responses: {
      201: { description: 'Updated cart', ...json(successEnvelope(cartView)) },
      404: err('PRODUCT_UNAVAILABLE'),
      409: err('OUT_OF_STOCK or INSUFFICIENT_STOCK'),
      422: err('CART_LIMIT_REACHED'),
      ...common,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/cart/items/{variantId}',
    tags: ['Cart'],
    summary: 'Set a line quantity',
    security: secured,
    request: { params: variantParam, body: json(updateCartItemSchema) },
    responses: {
      200: { description: 'Updated cart', ...json(successEnvelope(cartView)) },
      409: err('Not enough stock'),
      ...common,
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/cart/items/{variantId}',
    tags: ['Cart'],
    summary: 'Remove a line',
    security: secured,
    request: { params: variantParam },
    responses: { 200: { description: 'Updated cart', ...json(successEnvelope(cartView)) } },
  });
  registry.registerPath({
    method: 'delete',
    path: '/cart',
    tags: ['Cart'],
    summary: 'Empty the cart',
    security: secured,
    responses: { 200: { description: 'Empty cart', ...json(successEnvelope(cartView)) } },
  });
  registry.registerPath({
    method: 'post',
    path: '/cart/merge',
    tags: ['Cart'],
    summary: 'Merge a guest cart after sign-in (unavailable lines skipped, quantities clamped)',
    security: secured,
    request: { body: json(cartLinesSchema) },
    responses: { 200: { description: 'Merged cart', ...json(successEnvelope(cartView)) } },
  });

  // ── Wishlist ──────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/wishlist',
    tags: ['Wishlist'],
    summary: 'Saved products that are still on sale',
    security: secured,
    responses: { 200: { description: 'Wishlist', ...json(successEnvelope(obj('WishlistView'))) } },
  });
  registry.registerPath({
    method: 'get',
    path: '/wishlist/ids',
    tags: ['Wishlist'],
    summary: 'Saved product ids (for heart icons)',
    security: secured,
    responses: { 200: { description: 'Ids', ...json(successEnvelope(z.array(z.string()))) } },
  });
  registry.registerPath({
    method: 'post',
    path: '/wishlist',
    tags: ['Wishlist'],
    summary: 'Save a product (idempotent)',
    security: secured,
    request: { body: json(wishlistAddSchema) },
    responses: {
      201: { description: 'Saved ids', ...json(successEnvelope(z.array(z.string()))) },
      404: err('PRODUCT_UNAVAILABLE'),
      422: err('WISHLIST_LIMIT_REACHED'),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/wishlist/{productId}',
    tags: ['Wishlist'],
    summary: 'Remove a saved product',
    security: secured,
    request: { params: productParam },
    responses: { 200: { description: 'Saved ids', ...json(successEnvelope(z.array(z.string()))) } },
  });

  // ── Addresses ─────────────────────────────────────────────────────────────
  const addressList = successEnvelope(z.array(obj('AddressView')));
  registry.registerPath({
    method: 'get',
    path: '/addresses',
    tags: ['Addresses'],
    summary: 'Address book (default first)',
    security: secured,
    responses: { 200: { description: 'Addresses', ...json(addressList) } },
  });
  registry.registerPath({
    method: 'post',
    path: '/addresses',
    tags: ['Addresses'],
    summary: 'Add an address (the first one becomes default)',
    security: secured,
    request: { body: json(addressInputSchema) },
    responses: {
      201: { description: 'Created', ...json(successEnvelope(obj('AddressView'))) },
      422: err('ADDRESS_LIMIT_REACHED'),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/addresses/{id}',
    tags: ['Addresses'],
    summary: 'Edit an address',
    security: secured,
    request: { params: idParam, body: json(addressUpdateSchema) },
    responses: {
      200: { description: 'Updated', ...json(successEnvelope(obj('AddressView'))) },
      404: err('Not found (or not yours)'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/addresses/{id}/default',
    tags: ['Addresses'],
    summary: 'Make an address the default',
    security: secured,
    request: { params: idParam },
    responses: { 200: { description: 'Addresses', ...json(addressList) } },
  });
  registry.registerPath({
    method: 'delete',
    path: '/addresses/{id}',
    tags: ['Addresses'],
    summary: 'Delete an address (a default is replaced by the most recent other)',
    security: secured,
    request: { params: idParam },
    responses: { 200: { description: 'Addresses', ...json(addressList) } },
  });

  // ── Profile ───────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/users/me',
    tags: ['Profile'],
    summary: 'Profile with notification preferences',
    security: secured,
    responses: { 200: { description: 'Profile', ...json(successEnvelope(obj('ProfileView'))) } },
  });
  registry.registerPath({
    method: 'patch',
    path: '/users/me',
    tags: ['Profile'],
    summary: 'Update name or phone (empty phone removes it)',
    security: secured,
    request: { body: json(profileUpdateSchema) },
    responses: { 200: { description: 'Profile', ...json(successEnvelope(obj('ProfileView'))) } },
  });
  registry.registerPath({
    method: 'patch',
    path: '/users/me/notification-preferences',
    tags: ['Profile'],
    summary: 'Update notification preferences (security alerts are always on)',
    security: secured,
    request: { body: json(notificationPreferencesSchema) },
    responses: { 200: { description: 'Profile', ...json(successEnvelope(obj('ProfileView'))) } },
  });
}
