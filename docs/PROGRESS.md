# ZYVENTA — Build progress

**All 13 phases complete (2026-09-28).** Latest commits: 960e6f7 (admin console), 4780e96 (phases 11–13).

| Phase | Scope                                                        | Status |
| ----- | ------------------------------------------------------------ | ------ |
| 1–2   | Architecture, project initialization                         | ✅     |
| 3     | Database (31 models, seed) — see DATABASE.md                 | ✅     |
| 4     | Authentication, RBAC, CSRF — see SECURITY.md                 | ✅     |
| 5     | Products, search, filters, inventory, uploads                | ✅     |
| 6     | Storefront UX, cart, wishlist, account                       | ✅     |
| 7     | Seller onboarding + Seller Center                            | ✅     |
| 8     | Pricing engine, coupons/offers, checkout, Razorpay, webhooks | ✅     |
| 9     | Admin console (15 sections)                                  | ✅     |
| 10    | Reviews, notifications, stock alerts, email, recommendations | ✅     |
| 11    | Security review: nonce CSP, audit, fixes                     | ✅     |
| 12    | Tests: unit, HTTP, MongoDB integration, Playwright E2E       | ✅     |
| 13    | Deployment docs, CI e2e job, performance notes               | ✅     |

## Verification (2026-09-28)

- `SKIP_DB_TESTS=1 pnpm check`: format, typecheck and lint clean; 305 tests pass
  (shared 48, web 54, API 203). The 59 MongoDB integration tests need `pnpm check` run locally.
- Playwright smoke suite: 18/18 pass (desktop + mobile) against the production web build, with
  zero CSP violations.
- `pnpm audit --prod`: no known vulnerabilities.

## Admin console routes

/admin (dashboard), /orders (+detail: cancel, partial refund, shipment override), /returns,
/payments, /refunds (retry), /users, /applications, /sellers (status, commission), /products
(block/feature), /catalog (categories + brands CRUD), /promotions, /reviews, /reports,
/audit, /settings (shipping, payment window, returns, commission, maintenance, support).

## Before going live (owner actions)

Add to `apps/api/.env`: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
DATA_ENCRYPTION_KEY (`openssl rand -base64 32`), CLOUDINARY_*, SMTP_*. Put the key id in
NEXT_PUBLIC_RAZORPAY_KEY_ID in `apps/web/.env.local`. Configure the Razorpay webhook (README).
Run `pnpm check` locally for the MongoDB tests, then `pnpm create-admin`.
