# ZYVENTA — Architecture Blueprint (Phase 1)

Multi-vendor e-commerce platform · Next.js + Express + MongoDB · Razorpay · Status: awaiting approval

## 1. System architecture

Modular monolith API + separate Next.js frontend. Not microservices: at this scale they add network failure modes, distributed transactions and deployment overhead with no benefit. Modules have hard boundaries so any one (payments, search, notifications) can be extracted later.

```
Browser (mobile / tablet / desktop)
   │  HTTPS, HttpOnly cookies (same-site: zyventa.com)
   ▼
Next.js (apps/web) — www.zyventa.com
   • Server Components: public catalog (SEO, ISR/revalidate tags)
   • Client Components: cart, checkout, dashboards (TanStack Query)
   • proxy/middleware: cookie-presence route gating (UX only)
   │  REST /api/v1 (JSON)
   ▼
Express API (apps/api) — api.zyventa.com
   helmet → cors(allowlist) → process-local rate-limit → body limits → cookie-parser
   → CSRF check → request-id/logging → routes → zod validate → authN → authZ
   → controller → service → Mongoose → centralized error handler
   │
   ├── MongoDB (replica set — required for multi-document transactions)
   ├── MongoDB-leased in-process jobs (safe across API replicas)
   ├── Razorpay (orders, payments, refunds, webhooks)
   ├── Cloudinary (product/review images)
   └── SMTP (Mailpit in dev)
```

Key decisions:

- Money stored as integer paise everywhere. No floats in pricing.
- One PricingService computes cart view, checkout quote and order totals — a single code path, so displayed price == charged price.
- Every product has ≥1 ProductVariant. Simple products get one hidden default variant. Inventory, SKU, price and cart logic stay uniform; UI hides variant pickers when only the default exists.
- Shared package: zod schemas, enums, status machines and TS types live in packages/shared and are used by both apps (form validation + API validation + OpenAPI docs from one source).

## 2. Folder structure (pnpm workspaces monorepo)

```
zyventa/
├── apps/
│   ├── web/                         # Next.js (App Router)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (shop)/          # public: /, /products, /products/[slug], /categories/[slug], /search
│   │   │   │   ├── (shop)/cart, checkout, wishlist, orders
│   │   │   │   ├── (auth)/          # login, register, forgot-password, reset-password, verify-email
│   │   │   │   ├── account/         # customer dashboard (layout + sidebar/bottom-nav)
│   │   │   │   ├── seller/          # seller dashboard + /seller/apply
│   │   │   │   ├── admin/           # admin dashboard
│   │   │   │   ├── sitemap.ts, robots.ts, not-found.tsx, error.tsx, layout.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/              # shadcn primitives (Button, Input, Dialog, …)
│   │   │   │   ├── layout/          # Header, MobileHeader, BottomNav, Footer, DashboardShell
│   │   │   │   ├── product/         # ProductCard, ProductGrid, Gallery, VariantPicker, PriceDisplay, Rating
│   │   │   │   ├── common/          # EmptyState, LoadingSkeleton, Pagination, DataTable, ErrorState
│   │   │   ├── features/            # feature-scoped UI + hooks: cart/, checkout/, filters/, seller/, admin/
│   │   │   ├── services/            # authService, productService, cartService, orderService, paymentService, sellerService, adminService …
│   │   │   ├── lib/                 # api-client.ts (single fetch wrapper), query-client, env, seo, format
│   │   │   ├── hooks/               # useDebounce, useMediaQuery, useAuth …
│   │   │   ├── store/               # zustand: ui (drawers), recently-viewed, checkout draft
│   │   │   ├── styles/              # tokens (CSS variables), globals.css
│   │   │   └── proxy.ts             # route gating (Next 16 name for middleware)
│   │   ├── tests/ (unit)  e2e/ (Playwright)
│   │   └── Dockerfile
│   └── api/                         # Express
│       ├── src/
│       │   ├── config/              # env (zod-validated), db, razorpay, cloudinary, mailer, logger
│       │   ├── middleware/          # authenticate, authorize, requireOwnership, validate, csrf, rateLimit, upload, errorHandler
│       │   ├── modules/             # feature modules — each: model, service, controller, routes, validators, tests
│       │   │   ├── auth/  users/  sellers/  categories/  brands/  products/  inventory/
│       │   │   ├── cart/  wishlist/  addresses/  pricing/  coupons/  offers/
│       │   │   ├── orders/  payments/  refunds/  reviews/  notifications/  stock-alerts/
│       │   │   ├── search/  analytics/  audit/  reports/  settings/  uploads/  admin/
│       │   ├── webhooks/            # razorpay.webhook.ts (raw body)
│       │   ├── jobs/                # in-process scheduler and MongoDB lease model
│       │   ├── emails/templates/
│       │   ├── docs/                # OpenAPI registry → /api/docs
│       │   ├── scripts/             # seed.ts, create-admin.ts
│       │   ├── utils/               # ApiError, asyncHandler, pagination, crypto, money
│       │   ├── app.ts  server.ts
│       ├── tests/ (integration, mongodb-memory-server replica set)
│       └── Dockerfile
├── packages/
│   └── shared/                      # zod schemas, enums, types, status machines, error codes, constants
├── docker-compose.yml               # web, api, mongo (rs), mailpit
├── docker-compose.prod.yml
├── .env.example  (root, for compose)   apps/api/.env.example   apps/web/.env.example
├── tsconfig.base.json  eslint.config.mjs  .prettierrc
└── README.md  docs/ARCHITECTURE.md  docs/SECURITY.md
```

Why feature modules instead of global controllers/ models/ routes/ folders: every change to "coupons" touches one folder; tests sit beside code; boundaries are visible.

## 3. Database model overview

```
User ─1:1─ Seller ─1:N─ Product ─1:N─ ProductVariant ─1:N─ StockAlert ─N:1─ User
 │                        │ N:1 Category (tree: parent + ancestors[])
 │                        │ N:1 Brand
 ├─1:N─ Address           └─1:N─ Review ─1:1─ OrderItem
 ├─1:1─ Cart (embedded items: variant, qty)
 ├─1:1─ Wishlist (embedded items, unique)
 ├─1:N─ Session (refresh-token family)
 ├─1:N─ AuthToken (email verify / password reset, hashed, TTL)
 ├─1:N─ Notification
 ├─1:N─ SellerApplication ──approve──▶ Seller
 └─1:N─ Order (one per checkout)
            ├─1:N─ SellerOrder (one per seller → fulfillment unit)
            │         └─1:N─ OrderItem (price/name/image snapshot, variant ref)
            │                   └─0:N─ ReturnRequest
            ├─1:N─ Payment (attempts) ─1:N─ Refund
            └─0:1─ CouponRedemption ─N:1─ Coupon
Offer (seller- or platform-scoped automatic discount)   AuditLog   WebhookEvent
IdempotencyKey   Report (reported products)   PlatformSetting   Counter (order numbers)
SellerLedgerEntry (per-seller earnings/commission — payouts phase)
```

Added beyond the requested list, with reasons: SellerOrder (multi-vendor fulfillment), Session, AuthToken, Brand, CouponRedemption, Refund, ReturnRequest, WebhookEvent, IdempotencyKey, Report, PlatformSetting, Counter, SellerLedgerEntry.

Key fields and indexes:

| Model             | Notable fields                                                                                                                                                                                                                                            | Indexes (driven by queries)                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User              | email (lowercased), passwordHash, roles[] , status ACTIVE/SUSPENDED/DELETED, emailVerifiedAt, failedLoginCount, lockUntil                                                                                                                                 | email unique; roles+status+createdAt (admin lists)                                                                                                                                         |
| Seller            | user, storeName, slug, gstin, status PENDING/ACTIVE/SUSPENDED, payout details (encrypted), rating                                                                                                                                                         | user unique; slug unique; status                                                                                                                                                           |
| Category          | name, slug, parent, ancestors[], level, gstRate, isActive, sortOrder                                                                                                                                                                                      | slug unique; parent; ancestors                                                                                                                                                             |
| Product           | seller, category, categoryPath[], brand, name, slug, descriptions, attributes{}, tags[], images[], status DRAFT/ACTIVE/INACTIVE/BLOCKED, isFeatured, denormalized: priceMin, priceMax, mrpMax, maxDiscountPct, inStock, ratingAvg, ratingCount, soldCount | slug unique; text(name^10, brand^5, tags^3); {status, categoryPath, priceMin}; {status, brand}; {seller, status, updatedAt}; {status, ratingAvg}; {status, soldCount}; {status, createdAt} |
| ProductVariant    | product, seller, sku, options{size,color,storage,ram,material,model}, price, mrp, stock, reserved, images[], isDefault, isActive                                                                                                                          | sku unique; product; {seller, stock} (low stock)                                                                                                                                           |
| Cart              | user, items[{product, variant, qty, addedAt}] (max 50), couponCode                                                                                                                                                                                        | user unique                                                                                                                                                                                |
| Wishlist          | user, items[{product, variant?, addedAt}] (max 200)                                                                                                                                                                                                       | user unique                                                                                                                                                                                |
| Address           | user, name, phone, line1/2, city, state, pincode, isDefault                                                                                                                                                                                               | user                                                                                                                                                                                       |
| Order             | orderNumber, user, addressSnapshot, pricing{subtotal, discount, shipping, tax, total} (paise), coupon, status, paymentStatus, expiresAt, idempotencyKey                                                                                                   | orderNumber unique; {user, createdAt}; {status, expiresAt}                                                                                                                                 |
| SellerOrder       | order, seller, status (state machine), items, subtotal, tracking, statusHistory[]                                                                                                                                                                         | {seller, status, createdAt}; order                                                                                                                                                         |
| OrderItem         | sellerOrder, order, product, variant, snapshot{name, sku, image, options}, unitPrice, mrp, qty, taxAmount, discountShare, status                                                                                                                          | sellerOrder; {user, product} (verified purchase)                                                                                                                                           |
| Payment           | order, user, razorpayOrderId, razorpayPaymentId, amount, currency, status CREATED/AUTHORIZED/CAPTURED/FAILED/REFUNDED, method, raw (sanitized)                                                                                                            | razorpayOrderId unique; razorpayPaymentId unique sparse; order                                                                                                                             |
| Refund            | payment, orderItem(s), amount, razorpayRefundId, status                                                                                                                                                                                                   | razorpayRefundId unique sparse                                                                                                                                                             |
| Coupon            | code, type PERCENT/FIXED, value, maxDiscount, minOrder, startsAt, endsAt, usageLimit, usedCount, perUserLimit, scope{categories, products, sellers}, fundedBy PLATFORM/SELLER, owner, isActive                                                            | code unique; {isActive, endsAt}                                                                                                                                                            |
| CouponRedemption  | coupon, user, order, amount, status RESERVED/CONSUMED/RELEASED                                                                                                                                                                                            | {coupon, user}; order unique                                                                                                                                                               |
| Offer             | owner(seller/platform), type, value, scope, startsAt, endsAt, priority, isActive                                                                                                                                                                          | {isActive, startsAt, endsAt}; seller                                                                                                                                                       |
| Review            | product, user, orderItem, rating, title, body, images[], status PUBLISHED/HIDDEN/FLAGGED, isVerifiedPurchase                                                                                                                                              | orderItem unique; {product, status, createdAt}; user                                                                                                                                       |
| Notification      | user, type, title, body, link, readAt                                                                                                                                                                                                                     | {user, readAt, createdAt}; TTL 180d                                                                                                                                                        |
| StockAlert        | user, variant, product, status ACTIVE/NOTIFIED/CANCELLED, notifiedAt                                                                                                                                                                                      | {user, variant} unique; {variant, status}                                                                                                                                                  |
| SellerApplication | user, business details, documents, status PENDING/APPROVED/REJECTED, reviewedBy, reason                                                                                                                                                                   | {status, createdAt}; user                                                                                                                                                                  |
| AuditLog          | actor, actorRole, action, resource, resourceId, metadata (redacted), ip, userAgent                                                                                                                                                                        | {resource, resourceId}; {actor, createdAt}; {action, createdAt}                                                                                                                            |
| Session           | user, familyId, tokenHash, expiresAt, revokedAt, replacedBy, ip, ua                                                                                                                                                                                       | tokenHash unique; user; TTL on expiresAt                                                                                                                                                   |
| WebhookEvent      | provider, eventId, type, processedAt                                                                                                                                                                                                                      | eventId unique                                                                                                                                                                             |
| IdempotencyKey    | user, key, route, response, expiresAt                                                                                                                                                                                                                     | {user, key} unique; TTL                                                                                                                                                                    |

Integrity rules: products are soft-deactivated, never hard-deleted once ordered (OrderItems snapshot what was sold). Rating aggregates are updated transactionally on review writes.

## 4. Authentication architecture

_As implemented in Phase 4. Details: [docs/SECURITY.md](SECURITY.md)._

- Passwords: Argon2id (OWASP params: m=19 MiB, t=2, p=1). A dummy hash is verified when the email is unknown, to equalise timing. Hashes are upgraded transparently on login (`needsRehash`).
- Access token: JWT (HS256, pinned algorithm, issuer and audience), 15 min, claims `{ sub, sid }` where `sid` is the session family. Roles and status are **not** trusted from the token; they are re-read from MongoDB on each request. Cookie `zv_at`: HttpOnly, SameSite=Lax, Path=/, Secure in production.
- Refresh token: opaque 32 random bytes, stored as HMAC-SHA256(`TOKEN_HASH_SECRET`) in Session. Cookie `zv_rt`: HttpOnly, SameSite=Strict, Path=/api/v1/auth. Rotated on every use with a conditional update, so concurrent refreshes cannot both win. The family keeps its original 30-day absolute expiry.
- Reuse detection: a rotated token replayed more than 30 s later (the grace window for two tabs refreshing at once) revokes the whole family and creates a security notification.
- Logout revokes the family in MongoDB, so the access token dies immediately. "Log out everywhere" revokes all families. Password change keeps the current device and revokes the rest; password reset revokes all.
- CSRF: signed double-submit token (`zv_csrf` readable cookie, echoed in `X-CSRF-Token`) plus an Origin/Referer allowlist on every non-GET. Cookie-less bearer clients are exempt.
- `zv_session` is a readable, non-secret hint cookie. The web proxy uses it to redirect signed-out visitors, and the client uses it to skip pointless refresh calls.
- Email verification (24 h) and password reset (30 min) use single-use hashed AuthTokens, consumed atomically. Issuing a new token voids older ones. Unverified users can browse but not check out (`requireVerifiedEmail`).
- Brute force protection:
  - per-IP and per-email rate limits (failed logins only);
  - progressive lockout: after 5 failures, locks of 15 min doubling to a 24 h cap (HTTP 423);
  - identical error message for an unknown email and a wrong password;
  - forgot-password always returns 202.
- Roles: `roles: ('USER'|'SELLER'|'ADMIN')[]`. Admins are created only through the `create-admin` CLI.
- Middleware chain: `auth.required` (token, then account active, then session live), then `requireRoles(...)` / `requireActiveSeller`, then ownership filters inside services.
- Frontend:
  - `proxy.ts` early redirect (UX only);
  - client `RequireAuth` role gate (UX only);
  - `api-client` bootstraps CSRF and does a single-flight refresh on 401.
  - The API is the only security boundary.

## 5. Razorpay payment flow

```
1. POST /api/v1/checkout/orders   (Idempotency-Key header, addressId, couponCode)
   └ Mongo transaction:
       PricingService.quote() from DB prices
       reserve stock per variant: updateOne({_id, $expr: stock - reserved >= qty}, {$inc: {reserved: qty}})
       reserve coupon usage (CouponRedemption RESERVED, conditional usedCount < usageLimit)
       create Order(PENDING_PAYMENT, expiresAt = now + 15m) + SellerOrders + OrderItems
   └ after commit: razorpay.orders.create({amount, currency:'INR', receipt: orderNumber, notes:{orderId}})
       → Payment(CREATED, razorpayOrderId)   (on failure: release reservations, PAYMENT_FAILED)
   ← { orderId, razorpayOrderId, amount, currency, keyId }

2. Browser opens Razorpay Checkout with order_id (public key only)

3. POST /api/v1/payments/verify { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   └ HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET) compared with timingSafeEqual
   └ Payment belongs to req.user; fetch payment from Razorpay API: status captured,
     amount == order.total, currency == INR, order_id matches
   └ finalizeOrder(orderId)  ← idempotent (see below)

4. POST /api/v1/webhooks/razorpay   (express.raw body — mounted before JSON parser)
   └ verify X-Razorpay-Signature with WEBHOOK_SECRET
   └ insert WebhookEvent{eventId} (unique index → duplicates/replays are no-ops)
   └ payment.captured / order.paid → finalizeOrder()
     payment.failed → mark attempt failed (order stays payable until expiry)
     refund.processed / refund.failed → update Refund + items

finalizeOrder (single function used by verify, webhook and reconciliation):
   transaction: Order.findOneAndUpdate({_id, status: PENDING_PAYMENT}, {status: CONFIRMED})
     → if no match: already finalized → return current state (idempotent)
     → convert reservations: $inc {stock: -qty, reserved: -qty}; coupon RESERVED → CONSUMED
     → Payment CAPTURED; SellerOrders CONFIRMED; clear cart; ledger entries
   after commit: enqueue emails + notifications
   edge case: payment arrives after reservation expired and stock is gone → auto-refund + notify

Jobs:
   reservation-expiry (every minute): expired PENDING_PAYMENT orders → check Razorpay for a
     captured payment first (reconciliation), else release stock + coupon, mark EXPIRED
```

Refunds: POST via admin/automatic triggers → `razorpay.payments.refund` with idempotent receipt → Refund(PENDING) → webhook confirms.
The frontend's "success" callback is only a trigger to call verify. It never changes state by itself.

## 6. API architecture

- Base `/api/v1`, JSON, Express 5 (native async error propagation).
- Envelope: `{ success, message, data, pagination? }` / `{ success:false, message, code, errors?[] }`. Error codes are a shared enum.
- Pagination: `?page&limit` (limit ≤ 60) with the requested metadata. Offset pagination for catalog/admin tables; cursor pagination for notifications feed.
- Validation: zod schemas for body/query/params per route (strict — unknown keys rejected, which also blocks mass assignment).
- Docs: OpenAPI 3.1 generated from the same zod schemas (@asteasolutions/zod-to-openapi) → Swagger UI at `/api/docs` (disabled or admin-protected in prod).

Route map (namespace = access level):

| Prefix                                   | Access          | Examples                                                                                                                                                                             |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| /auth                                    | public/auth     | register, login, logout, logout-all, refresh, me, verify-email, resend-verification, forgot-password, reset-password, change-password                                                |
| /products, /categories, /brands, /search | public          | list+filter+sort, /:slug, /:id/related, /:id/reviews, suggestions (autocomplete)                                                                                                     |
| /users/me, /addresses                    | USER            | profile, addresses CRUD, set default                                                                                                                                                 |
| /cart                                    | USER            | GET, POST items, PATCH items/:variantId, DELETE items/:variantId, DELETE, POST/DELETE coupon                                                                                         |
| /wishlist                                | USER            | GET, POST, DELETE /:productId, POST /:productId/move-to-cart                                                                                                                         |
| /checkout, /orders                       | USER            | quote, create order, list, /:id, /:id/cancel, /:id/items/:itemId/return                                                                                                              |
| /payments                                | USER            | verify, /:orderId/retry                                                                                                                                                              |
| /reviews                                 | USER            | create (eligible items), PATCH, DELETE, report                                                                                                                                       |
| /stock-alerts, /notifications            | USER            | subscribe/unsubscribe, list, mark read, preferences                                                                                                                                  |
| /sellers                                 | USER→SELLER     | apply, application status                                                                                                                                                            |
| /seller/*                                | SELLER (active) | dashboard, products CRUD, variants, images, inventory, orders + status transitions, offers, coupons, analytics, profile                                                              |
| /admin/*                                 | ADMIN           | users, sellers, applications, products (block/feature), categories, brands, orders, payments, refunds, coupons, offers, reviews moderation, reports, analytics, audit-logs, settings |
| /uploads                                 | SELLER/USER     | image upload (multipart)                                                                                                                                                             |
| /webhooks/razorpay                       | signature       | payment/refund events                                                                                                                                                                |
| /health, /ready                          | public          | liveness/readiness                                                                                                                                                                   |

Status machine (SellerOrder), enforced by a shared transition table + role rules:

```
CONFIRMED → PROCESSING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
CONFIRMED/PROCESSING/PACKED → CANCELLED → REFUND_PENDING → REFUNDED   (customer until PACKED; seller/admin)
DELIVERED → RETURN_REQUESTED (within return window) → RETURNED → REFUND_PENDING → REFUNDED
Parent Order: PENDING_PAYMENT → CONFIRMED | PAYMENT_FAILED | EXPIRED; CONFIRMED → COMPLETED/CANCELLED (derived from SellerOrders)
```

Admins can override with a mandatory reason (audited).

## 7. Security architecture

| Threat                                | Control                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken access control / IDOR          | backend RBAC chain; ownership filters inside every service query; 404 on foreign resources; tests per role per route                                                                                                                                                                                                                                                                                             |
| Price / coupon / payment manipulation | client sends only IDs + quantities + coupon code; server recomputes everything; Razorpay amount verified against DB order; signature + API fetch                                                                                                                                                                                                                                                                 |
| Inventory races / overselling         | conditional atomic `$inc` with availability predicate inside transactions; reservation TTL; release job                                                                                                                                                                                                                                                                                                          |
| Duplicate orders / webhook replay     | Idempotency-Key collection; unique indexes on razorpayOrderId, paymentId, WebhookEvent.eventId; conditional state transitions                                                                                                                                                                                                                                                                                    |
| NoSQL injection                       | zod types (no objects where strings expected); edge middleware rejecting `$`/`.`/`__proto__` keys in body, query and params; `strictQuery`; no user-built `$where`/operators. (Decided in Phase 3 instead of Mongoose `sanitizeFilter`, which also neutralises our own `$in`/`$gte` queries unless each is wrapped in `trusted()`; express-mongo-sanitize is incompatible with Express 5's read-only req.query.) |
| Mass assignment                       | strict zod schemas + explicit field picking in services; role/status/seller fields never accepted from bodies                                                                                                                                                                                                                                                                                                    |
| XSS                                   | React escaping; product descriptions stored as sanitized HTML (sanitize-html allowlist); strict CSP via Next headers; no dangerouslySetInnerHTML except sanitized content + JSON-LD                                                                                                                                                                                                                              |
| CSRF                                  | SameSite cookies + double-submit token + Origin allowlist                                                                                                                                                                                                                                                                                                                                                        |
| Token theft                           | HttpOnly/Secure cookies, short access TTL, refresh rotation + reuse detection, revocation list via Session                                                                                                                                                                                                                                                                                                       |
| Brute force / credential stuffing     | Process-local rate limits (global, auth, checkout, upload tiers), account lockout, generic errors                                                                                                                                                                                                                                                                                                                |
| File upload attacks                   | multer memory storage, 5 MB limit, max 8 files, magic-byte check (file-type), allowlist jpeg/png/webp/avif, re-encoded by Cloudinary, random public IDs, never served from our origin                                                                                                                                                                                                                            |
| Secrets                               | zod-validated env at boot (crash on missing); only NEXT_PUBLIC_API_URL and NEXT_PUBLIC_RAZORPAY_KEY_ID public; pino redaction of auth headers, cookies, passwords, tokens                                                                                                                                                                                                                                        |
| Transport/headers                     | helmet, HSTS, CORS allowlist with credentials (never `*`), `trust proxy` configured, 100 kb JSON limit                                                                                                                                                                                                                                                                                                           |
| Errors                                | centralized handler; stack traces only in development; request IDs in responses for support                                                                                                                                                                                                                                                                                                                      |
| Auditability                          | AuditLog for all admin actions and seller price/stock/product changes, with redacted metadata                                                                                                                                                                                                                                                                                                                    |

## 8. Required dependencies

Backend (apps/api): express 5, mongoose, zod, argon2, jsonwebtoken, cookie-parser, helmet, cors, compression, express-rate-limit, razorpay, cloudinary, multer, file-type, sanitize-html, nodemailer, pino + pino-http, swagger-ui-express, @asteasolutions/zod-to-openapi, slugify, nanoid.
Dev: typescript, tsx, vitest, supertest, mongodb-memory-server, @types/*, eslint, prettier.

Frontend (apps/web): next, react, react-dom, tailwindcss v4, shadcn/ui (Radix), lucide-react, @tanstack/react-query, @tanstack/react-table, zustand, react-hook-form + @hookform/resolvers, zod (via shared), nuqs (filter/sort/page state in URL — shareable, SEO-friendly, back-button correct), sonner (toasts), recharts (dashboards), clsx + tailwind-merge, embla-carousel (gallery).
Dev: vitest, @testing-library/react, msw (unit tests only), playwright, eslint, prettier.

Infra: Node 24 LTS, pnpm, Docker, MongoDB 8 (single-node replica set in dev), Mailpit (dev SMTP). Exact versions pinned at Phase 2 after checking current stable releases.

## 9. Development phases

1. Architecture (this document)
2. Project init: monorepo, both apps, TS strict, Tailwind + tokens, ESLint/Prettier, env validation, MongoDB connection, health checks, Docker Compose, CI script — verified running
3. Database: all schemas, indexes, validation, seed (categories, brands, sellers, ~200 products with variants, admin via CLI)
4. Authentication + RBAC + CSRF + rate limiting, with tests
5. Product system: categories, products, variants, uploads, search, filters, sort, pagination, inventory service
6. Customer UX: design system, header/mobile nav, homepage, listing, PDP, cart, wishlist, account, addresses
7. Seller: application/approval, dashboard, product & variant management, inventory, orders, offers, analytics
8. Pricing engine + coupons + checkout + Razorpay + webhooks + reservations + idempotency (coupon engine moved here — cart pricing depends on it)
9. Admin: all sections, moderation, refunds, analytics, audit logs, settings
10. Advanced: stock alerts, notifications, emails, reviews, related/frequently-bought-together, recently viewed
11. Security review (plus security tests added continuously from Phase 4)
12. Testing: typecheck, lint, unit, integration, Playwright E2E, production builds
13. Performance: explain() on hot queries, index audit, caching, bundle analysis, image tuning
