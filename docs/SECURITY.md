# ZYVENTA security notes

Each phase added its controls here; Phase 11 reviewed the whole system (see the end of this file).

## Authentication (Phase 4)

| Concern                                 | Control                                                                                                                                       | Where                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Password storage                        | Argon2id, m=19 MiB, t=2, p=1; rehash on login when parameters change                                                                          | `modules/auth/password.ts`                  |
| Account enumeration                     | Same error for unknown email and wrong password (dummy hash equalises timing); forgot-password always returns 202 and sends in the background | `auth.service.ts`                           |
| Credential stuffing                     | Process-local per-IP and per-email limits on failed logins                                                                                    | `auth.routes.ts`, `middleware/rateLimit.ts` |
| Brute force on one account              | Lockout after 5 failures: 15 min, doubling, capped at 24 h (HTTP 423)                                                                         | `lockDurationMs()`                          |
| Token theft (XSS)                       | Access and refresh tokens are HttpOnly cookies, never readable by JavaScript                                                                  | `modules/auth/cookies.ts`                   |
| Token theft (replay)                    | Refresh rotation on every use; replay of a rotated token revokes the whole family and alerts the user                                         | `session.service.ts`                        |
| Stale access after logout or suspension | Revoked sessions and current roles/status are checked directly in MongoDB on every request                                                    | `modules/auth/principal.ts`                 |
| DB leak                                 | Refresh, verification and reset tokens are stored only as HMAC-SHA256 with `TOKEN_HASH_SECRET`                                                | `tokens.ts`                                 |
| JWT attacks                             | HS256 pinned (no `alg: none`, no key confusion); issuer, audience and expiry verified                                                         | `tokens.ts`                                 |
| CSRF                                    | SameSite cookies + signed double-submit token + Origin/Referer allowlist on all non-GET requests                                              | `middleware/csrf.ts`                        |
| Login CSRF                              | Login and register also require the CSRF token                                                                                                | same                                        |
| Open redirect                           | `?next=` restricted to same-site relative paths                                                                                               | `web/src/lib/safe-redirect.ts`              |
| Mass assignment / role smuggling        | Strict zod schemas reject unknown keys, so `roles` can't be sent on register                                                                  | `@zyventa/shared` auth schemas              |
| Email-link leakage                      | Single-use, short-lived, hashed tokens; the Referrer-Policy keeps the full URL from other sites                                               | `auth.service.ts`, `next.config.ts`         |
| Secrets                                 | `JWT_ACCESS_SECRET` and `TOKEN_HASH_SECRET` must be ≥ 32 characters, not placeholders, and different from each other; validated at boot       | `config/env.ts`                             |

### Cookie layout

| Cookie       | Content           | HttpOnly | SameSite | Path           | Lifetime           |
| ------------ | ----------------- | -------- | -------- | -------------- | ------------------ |
| `zv_at`      | access JWT        | yes      | Lax      | `/`            | 15 min             |
| `zv_rt`      | refresh token     | yes      | Strict   | `/api/v1/auth` | 30 days (absolute) |
| `zv_csrf`    | signed CSRF token | no       | Lax      | `/`            | 30 days            |
| `zv_session` | `1` (hint only)   | no       | Lax      | `/`            | 30 days            |

All are `Secure` in production. `COOKIE_DOMAIN=.zyventa.com` shares them between `www.` and `api.`.

### Operational notes

- **Rotating `JWT_ACCESS_SECRET`** signs everyone out within 15 minutes, as access tokens stop verifying. Refresh still works, so users are re-issued tokens transparently.
- **Rotating `TOKEN_HASH_SECRET`** invalidates all refresh sessions and outstanding email links, so everyone must sign in again.
- **Suspending a user:** set `status: 'SUSPENDED'` through the admin console (`/admin/users`). It evicts the principal cache and revokes sessions.

## Product system (Phase 5)

| Concern                         | Control                                                                                                                                                                        | Where                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| IDOR on seller resources        | Every seller query is scoped by `seller: req.auth.sellerId` (taken from the session, never the request). Another seller's id behaves as not found (404).                       | `seller-product.service.ts`, `inventory.service.ts`  |
| Mass assignment                 | Strict create/update schemas: no `seller`, `status: BLOCKED`, `slug`, rating or sales fields                                                                                   | `@zyventa/shared` catalog inputs                     |
| Stored XSS in descriptions      | `sanitize-html` allowlist (no scripts, styles, iframes, event handlers or `javascript:` links); links forced to `rel="nofollow noopener noreferrer ugc"`                       | `products/sanitize.ts`                               |
| Malicious uploads               | In-memory multer: 5 MB, 8 files. Real type detected from magic bytes (JPEG/PNG/WebP/AVIF only). Random public ids; Cloudinary strips metadata and caps dimensions.             | `uploads/uploads.routes.ts`, `image-storage.ts`      |
| Hotlinked or foreign images     | Product images must be ours (storage URL prefix) and inside the seller's own folder. Deleting outside it, or with `..`, is refused.                                            | `assertOwnedImages()`, upload routes                 |
| Overselling via stock edits     | Stock updates are conditional on staying ≥ units reserved by pending orders (atomic guard)                                                                                     | `inventory.service.ts`                               |
| Blocked products                | Sellers cannot change the status of an admin-BLOCKED product                                                                                                                   | `seller-product.service.ts`                          |
| Audit trail                     | Product create, status change and archive; variant create and price changes; stock changes; category and brand changes. Each is written in the same transaction as the change. | `audit/audit.service.ts`                             |
| Public data exposure            | Shoppers never see exact stock, only in-stock, low-stock and max-quantity flags. Only ACTIVE products of ACTIVE sellers are served.                                            | `product.mapper.ts`, `catalog.service.ts`            |
| Regex DoS / injection in search | User text is escaped before use in anchored regexes; search terms are capped at 100 characters and 6 tokens                                                                    | `utils/cache.ts` (`escapeRegex`), `product-query.ts` |

## Storefront and shopper data (Phase 6)

| Concern                    | Control                                                                                                                                                                  | Where                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Price tampering            | Cart bodies are strict `{ variantId, quantity }`; any `price` key is rejected. Every cart response is re-priced from live variants, and checkout will re-price again.    | `shopper/cart.ts`, `cart/cart-pricing.ts`     |
| Stale or unavailable items | Each line reports `OK`, `QUANTITY_REDUCED`, `OUT_OF_STOCK` or `UNAVAILABLE` (inactive variant, unlisted product, suspended seller); only purchasable units are totalled. | `cart-pricing.ts`                             |
| Lost updates across tabs   | Cart writes are optimistic (`__v` guard, 3 retries), so concurrent edits never silently overwrite each other                                                             | `cart.service.ts`                             |
| IDOR                       | Cart, wishlist, addresses and profile queries are always scoped by the session user; another user's address id returns 404                                               | `address.service.ts`, `wishlist.service.ts`   |
| Mass assignment            | Strict schemas: no `user` on addresses; no `email`/`roles` on profile; security alerts cannot be disabled                                                                | `@zyventa/shared` account schemas             |
| Abuse                      | Per-user cart write limit (60/min), limits of 50 cart lines × 10 units, 200 wishlist items and 20 addresses                                                              | `cart.routes.ts`, models                      |
| Caching of personal data   | `Cache-Control: no-store` on every shopper route                                                                                                                         | `utils/no-store.ts`                           |
| XSS via JSON-LD            | Product structured data is serialised with `<`, `>`, `&`, U+2028/9 escaped                                                                                               | `web/src/features/product/structured-data.ts` |
| Browser storage            | Only non-sensitive data is kept in localStorage (guest cart ids/quantities, recently viewed slugs), schema-validated on read, and every access is try/caught             | `web/src/lib/local-store.ts`                  |
| Private pages indexed      | `/cart`, `/wishlist`, `/search`, `/account` are `noindex` and disallowed in robots.txt; missing products and categories return a real 404                                | page metadata, `app/robots.ts`                |

## Checkout and payments (Phase 8)

| Concern                          | Control                                                                                                                                                                                  | Where                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Price tampering                  | The browser sends only an address id, an optional coupon code and the total it displayed. The API prices every line, offer, coupon and shipping fee; a mismatch returns `PRICE_CHANGED`. | `pricing/pricing-engine.ts`, `checkout.service.ts` |
| Forged payment success           | Success requires a valid HMAC-SHA256 signature (constant-time compare) **and** a server-side fetch of the payment from Razorpay with matching order id, amount and currency.             | `checkout.service.ts` (`verify`)                   |
| Lost browser callback            | The `payment.captured` / `order.paid` webhook confirms the order on its own                                                                                                              | `payments/webhook.routes.ts`                       |
| Forged webhooks                  | Raw-body HMAC with `RAZORPAY_WEBHOOK_SECRET`, checked before parsing                                                                                                                     | same                                               |
| Duplicate orders or captures     | `Idempotency-Key` on order placement; `confirmPayment` is idempotent; webhook events are deduplicated by id                                                                              | `middleware/idempotency.ts`                        |
| Overselling                      | Stock is reserved with atomic conditional updates inside a MongoDB transaction; unpaid orders expire and release stock                                                                   | `checkout.service.ts`, `jobs/scheduler.ts`         |
| Late payment on an expired order | Stock is re-reserved atomically; if that fails the transaction rolls back and the payment is refunded in full                                                                            | `confirmPayment`                                   |
| Over-refunding                   | `amountRefunded` is incremented with a guard that it stays ≤ the captured amount; each refund has a unique idempotency key; a retry flips `FAILED → PENDING` atomically first            | `payments/refund.service.ts`                       |
| Coupon abuse                     | Usage limits (total and per user) are reserved in the checkout transaction and released if the order is not paid                                                                         | `promotion.service.ts`                             |
| Secret exposure                  | `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` exist only in `apps/api/.env`; the browser receives only the key id                                                                  | `config/env.ts`, `web/src/lib/env.ts`              |
| Maintenance                      | When maintenance mode is on, new orders are refused server-side (503), not just hidden in the UI                                                                                         | `placeOrder`                                       |

## Sellers and fulfilment (Phases 7 and 10)

| Concern                 | Control                                                                                                                                                 | Where                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Payout details          | Bank/UPI details are encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`), bound to the seller id as associated data; only the last 4 digits are returned | `utils/crypto.ts`, `seller-profile.service.ts` |
| Unpaid order leakage    | Sellers see a shipment only after payment (`paidAt`), and only their own                                                                                | `fulfilment.service.ts`                        |
| Illegal status changes  | Table-driven state machines per actor (customer, seller, admin, system); anything not listed is rejected                                                | `packages/shared/src/domain`                   |
| Earnings before returns | Ledger entries become payable only after the return window closes; refunds post a matching REFUND entry net of commission                               | `releaseSettledEarnings`                       |
| Fake reviews            | Only verified purchasers of delivered items can review, once per item; reports queue for moderation                                                     | `review.service.ts`                            |

## Administration (Phase 9)

- Every admin route requires the ADMIN role server-side; the web layout gate is only UX.
- Suspending a user revokes all their sessions and evicts the principal cache immediately.
- Suspending a seller hides their catalogue at once; reactivating restores it.
- Every privileged action (status changes, moderation, refunds, settings) is written to an
  append-only audit log with actor, role, IP and metadata; secrets and tokens are never logged.

## Phase 11 review

- **Web CSP:** `src/proxy.ts` sets a per-request nonce policy: `script-src 'self' 'nonce-…'
'strict-dynamic'` (no `unsafe-inline`), Razorpay Checkout only for scripts and frames,
  Cloudinary only for images, the API only for `connect-src`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`. Covered by unit tests and a Playwright test that fails
  on any CSP violation.
- **Dependencies:** `pnpm audit --prod` reports no known vulnerabilities (2026-09-28).
- **Fixed during review:** the refund retry could double-reserve under concurrent clicks (now
  gated by an atomic status flip); maintenance mode was UI-only (now enforced by the API).
- **Residual risks / operator actions:** keep `.env` files out of source control and backups;
  rotate `RAZORPAY_WEBHOOK_SECRET` if it is ever exposed; restrict MongoDB to private
  networks; `style-src` allows inline styles (needed for layout values; scripts stay locked).

## Earlier phases

- **Edge:** helmet (API CSP `default-src 'none'`), HSTS, credentialed CORS allowlist, 100 kb body limit, flat query parsing.
- **Injection:** `$`, `.` and `__proto__` keys rejected at the edge; strict zod everywhere; Mongoose `strictQuery`.
- **Errors:** a central handler with no stack traces in production, duplicate-key values never echoed, and request ids.
- **Logs:** cookies, authorization headers, passwords, tokens and signatures are redacted.
- **Containers:** processes run as non-root.
