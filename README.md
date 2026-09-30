# ZYVENTA

A production-grade multi-vendor e-commerce platform: customer storefront, seller dashboard and
admin dashboard, backed by a secure REST API with Razorpay payments.

> **Status:** all 13 phases complete. The platform includes:
>
> - customer storefront: search, filters, product pages, cart, wishlist, checkout with Razorpay,
>   orders, returns, reviews, notifications and stock alerts
> - Seller Center: onboarding, dashboard, orders and fulfilment, returns, products, inventory,
>   offers and coupons, reviews and store settings
> - admin console: dashboard, orders, refunds, payments, users, seller approvals, product
>   moderation, catalogue, promotions, reviews, reports, settings and the audit log

---

## Architecture

```
Browser ──HTTPS + HttpOnly cookies──▶ Next.js (apps/web)
                                        │  REST /api/v1
                                        ▼
                                      Express API (apps/api) ──▶ MongoDB (replica set)
                                        ├──▶ Razorpay · Cloudinary · SMTP
```

- **apps/web**: Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query.
- **apps/api**: Express 5, Mongoose 9, zod validation, pino logging, OpenAPI docs.
- **packages/shared**: zod schemas, enums, response types and error codes used by both apps.

The full design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data model, auth, payment
flow, security and API map.

## Tech stack

| Layer    | Choice                                                                           |
| -------- | -------------------------------------------------------------------------------- |
| Frontend | Next.js 16, React 19, TypeScript (strict), Tailwind v4, shadcn/ui, Radix, Lucide |
| State    | TanStack Query (server state), URL (filters), guarded localStorage stores        |
| Backend  | Node.js 24, Express 5, TypeScript, zod                                           |
| Data     | MongoDB 8 (replica set) + Mongoose                                               |
| Payments | Razorpay _(Phase 8)_                                                             |
| Media    | Cloudinary _(Phase 5)_                                                           |
| Testing  | Vitest, Supertest, mongodb-memory-server, Playwright _(Phase 12)_                |
| Tooling  | pnpm workspaces, ESLint (strict type-checked), Prettier, Docker, GitHub Actions  |

## Requirements

- **Node.js ≥ 22.12**. Node 24 LTS is recommended (`nvm use` reads `.nvmrc`).
- **pnpm 10**: `corepack enable` (bundled with Node) or `npm i -g pnpm@10`.
- **Docker Desktop**, for local MongoDB and Mailpit. Alternatively use MongoDB Atlas.

## Quick start (local development)

```bash
# 1. Install dependencies
corepack enable
pnpm install

# 2. Create env files from the templates
cp apps/api/.env.example apps/api/.env
#    then set the two required secrets in apps/api/.env (each a different random value):
#    JWT_ACCESS_SECRET=$(openssl rand -base64 64)   TOKEN_HASH_SECRET=$(openssl rand -base64 64)
cp apps/web/.env.example apps/web/.env.local

# 3. Start MongoDB (replica set) and Mailpit
docker compose up -d
docker compose ps          # wait until mongo shows "healthy" (~15 s on first boot)

# 4. Build indexes, load demo data, run API + web with hot reload
pnpm db:sync-indexes --apply
pnpm db:seed
pnpm dev
```

| URL                                       | What                                 |
| ----------------------------------------- | ------------------------------------ |
| http://localhost:3000                     | Web app                              |
| http://localhost:3000/status              | Live platform status page            |
| http://localhost:4000/api/v1/health/ready | API readiness (MongoDB)              |
| http://localhost:4000/api/docs            | Swagger UI (non-production only)     |
| http://localhost:8025                     | Mailpit, which catches all dev email |

Run one app at a time with `pnpm dev:api` or `pnpm dev:web`.

## Environment variables

| File                  | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `apps/api/.env`       | **All secrets** and API config (template: `apps/api/.env.example`) |
| `apps/web/.env.local` | Public web config only (template: `apps/web/.env.example`)         |
| `.env` (root)         | Build arguments for `docker compose --profile app` only            |

The API validates its environment at startup and exits with a clear list of problems if
anything is missing or malformed. Each variable is documented in `apps/api/.env.example`.

Add your own values to `apps/api/.env`; never paste them anywhere else:

| Variable                                 | Needed for                          | How to get it                                     |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `JWT_ACCESS_SECRET`, `TOKEN_HASH_SECRET` | sessions (always)                   | `openssl rand -base64 64`, a different value each |
| `DATA_ENCRYPTION_KEY`                    | encrypting seller payout details    | `openssl rand -base64 32`                         |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | checkout                            | Razorpay dashboard (see below)                    |
| `RAZORPAY_WEBHOOK_SECRET`                | payment and refund webhooks         | the secret you set on the Razorpay webhook        |
| `CLOUDINARY_*`                           | image uploads                       | Cloudinary dashboard                              |
| `SMTP_*`, `EMAIL_FROM`                   | email (Mailpit is used in dev)      | your email provider                               |
| `JOBS_ENABLED`                           | background jobs (`true` by default) | set `false` on extra API replicas if you prefer   |

Put the Razorpay **key id** (never the secret) in `NEXT_PUBLIC_RAZORPAY_KEY_ID` in `apps/web/.env.local`.

**Security rules:**

- Never commit `.env` files. They are git-ignored; only `*.env.example` is tracked.
- Anything prefixed `NEXT_PUBLIC_` ships to the browser. Only the API URL, the site URL and the
  Razorpay **key id** may be public. `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` live only in `apps/api/.env`.
- Generate `JWT_ACCESS_SECRET` and `TOKEN_HASH_SECRET` with `openssl rand -base64 64`, one for each. The API refuses to start if either is short, a placeholder, or the two are identical.

## Database setup

MongoDB **must run as a replica set**: checkout, inventory reservation and payment
finalisation use multi-document transactions. The API refuses to start against a standalone
`mongod` and explains why.

- **Docker (default):** `docker compose up -d mongo` starts a single-node replica set `rs0`
  and initialises it automatically. Connection string (already in `.env.example`):
  `mongodb://localhost:27017/zyventa?replicaSet=rs0&directConnection=true`
- **MongoDB Atlas:** every Atlas cluster, including the free tier, is a replica set. Paste the
  `mongodb+srv://…` URI into `MONGODB_URI`.

Models, conventions, relationships and the inventory model are documented in
[docs/DATABASE.md](docs/DATABASE.md).

```bash
pnpm db:sync-indexes --apply    # build/refresh indexes (also a deploy step)
pnpm db:seed                    # fictional demo data (dev only); --reset to wipe first
pnpm create-admin --email you@example.com --name "Your Name"   # hidden password prompt
```

Demo logins after seeding use `@zyventa.test` emails, for example `admin@zyventa.test` and
`aarav@zyventa.test`. Their password is `SEED_USER_PASSWORD`, or `Zyventa@dev2026` if unset.

## Backend (apps/api)

```bash
pnpm --filter @zyventa/api dev        # tsx watch, loads apps/api/.env
pnpm --filter @zyventa/api build      # compile to dist/
pnpm --filter @zyventa/api start      # run compiled build
pnpm --filter @zyventa/api test       # unit + integration tests
```

Structure: `src/modules/<feature>/` holds each feature's model, service, controller, routes,
validators and docs. Cross-cutting concerns live in `src/middleware` and `src/config`. Every
response uses the envelope `{ success, message, data, pagination? }`, and every error uses
`{ success: false, message, code, errors?, requestId }`.

## Frontend (apps/web)

```bash
pnpm --filter @zyventa/web dev
pnpm --filter @zyventa/web build
pnpm --filter @zyventa/web test
```

- All HTTP goes through `src/lib/api-client.ts`, wrapped by services in `src/services`. ESLint
  blocks direct `fetch` calls elsewhere.
- Design tokens (colours, radii, shadows, fonts) are CSS variables in `src/styles/globals.css`,
  exposed as Tailwind utilities. Add shadcn components with `pnpm dlx shadcn@latest add <name>`
  from `apps/web`.
- Storefront routes live in the `(shop)` route group: `/`, `/products`, `/search`,
  `/categories`, `/categories/[slug]`, `/products/[slug]`, `/cart`, `/wishlist`. Account pages
  are under `/account` (overview, profile, addresses, notifications, security).
- Listing filters live in the URL (`src/features/catalog/filters.ts`), so every filtered view
  can be shared and bookmarked.
- Visitors get a browser-held cart (variant ids and quantities only) priced by the API; it is
  merged into the account cart at sign-in (`CartSync`).

## Docker

```bash
docker compose up -d                          # infrastructure only (for pnpm dev)
docker compose --profile app up -d --build    # + production builds of api and web
docker compose down                           # stop (data kept in named volumes)
docker compose down -v                        # stop and DELETE local data
```

Images are multi-stage and run as a non-root user with health checks. The API image contains
only production dependencies. Secrets are never baked into images; the API reads `apps/api/.env`
at runtime.

## API documentation

Swagger UI is served at `/api/docs`, and raw OpenAPI 3.1 at `/api/docs/openapi.json`. Both are
disabled in production. The document is generated from the same zod schemas the routes
validate with, so it cannot drift from the implementation.

## Razorpay setup

1. Create an account at https://dashboard.razorpay.com and switch to **Test Mode**.
2. Go to **Account & Settings → API Keys → Generate Test Key**. Put `RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET` in `apps/api/.env`, and the same key id in `NEXT_PUBLIC_RAZORPAY_KEY_ID` in `apps/web/.env.local`.
3. Under **Webhooks**, add `https://<your-api-domain>/api/v1/webhooks/razorpay` with the events
   `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` and `refund.failed`. Put the
   secret you choose in `RAZORPAY_WEBHOOK_SECRET`. For local testing, expose the API with a tunnel
   such as ngrok or cloudflared.

How payments stay trustworthy:

- The API prices every order itself; the browser only sends an address id, an optional coupon
  code and the total it displayed (to detect price changes).
- Payment success is accepted only after the API checks the Razorpay signature **and** fetches
  the payment from Razorpay. The webhook is the backstop if the browser never returns.
- Checkout requests carry an `Idempotency-Key`, and webhooks are deduplicated by event id, so
  retries never create duplicate orders, captures or refunds.

## Cloudinary setup

Create a free account at https://cloudinary.com. From **Settings → API Keys**, copy
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` into `apps/api/.env`.
Set all three or none.

Until Cloudinary is configured, `POST /uploads/images` returns 503. In development, products can
still use the bundled `/placeholders/*.svg` images; production only accepts images uploaded through
the API into the seller's own folder (`zyventa/products/<sellerId>/`).

## Testing

```bash
pnpm test          # all workspaces
pnpm check         # format check + typecheck + lint + tests (same as CI)
```

The API integration tests start an in-memory **MongoDB replica set** via
`mongodb-memory-server`. The first run downloads a `mongod` binary (~100 MB) into
`~/.cache/mongodb-binaries`. In an environment that cannot download it, set `SKIP_DB_TESTS=1`
to skip only those tests.

End-to-end smoke tests (Playwright, desktop and mobile) run against a production build:

```bash
pnpm --filter @zyventa/web build
pnpm --filter @zyventa/web exec playwright install chromium   # first time only
pnpm --filter @zyventa/web e2e                                # starts `next start` itself
E2E_BASE_URL=https://staging.example.com pnpm --filter @zyventa/web e2e   # or a deployment
```

## Production deployment

- Serve web and API from **the same registrable domain**, for example `www.zyventa.com` and
  `api.zyventa.com`, so auth cookies stay first-party.
- API: `NODE_ENV=production`, https-only `CORS_ORIGINS`, `TRUST_PROXY_HOPS` set to the number of
  proxies in front of it, and `COOKIE_DOMAIN=.zyventa.com`. Provide secrets through your host's
  secret manager or an env file mounted at runtime, never as Docker build arguments.
- MongoDB Atlas (replica set, IP allow-list, least-privilege DB user). Run
  `pnpm db:sync-indexes` once per release, and `pnpm create-admin` once.
- Build images on any container host:
  `docker build -f apps/api/Dockerfile .` and
  `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=… --build-arg NEXT_PUBLIC_SITE_URL=… --build-arg NEXT_PUBLIC_RAZORPAY_KEY_ID=… .`
- Background jobs (expiring unpaid orders, releasing seller earnings) run inside the API process
  and coordinate with MongoDB leases, so any number of replicas is safe. You can also set `JOBS_ENABLED=false`
  on web-facing replicas and run one replica with `true` as a dedicated worker.
- Point the Razorpay webhook at the production API and switch to live keys only after a full
  test-mode order, refund and webhook cycle.
- Performance: API responses for public catalogue data carry `Cache-Control`; the web app caches
  each API fetch (`next.revalidate`) and serves images through the
  Next.js optimiser as AVIF/WebP. Pages render per request because the CSP nonce is per request.

## Security notes

- helmet headers on the API; a per-request **nonce-based CSP** on the web app (`src/proxy.ts`)
  allowing only Razorpay Checkout, Cloudinary and the API
- credentialed CORS allowlist (never `*`), process-local rate limiting, 100 kb body limits
- zod validation that rejects unknown keys; NoSQL-injection guard; Mongoose `strictQuery`
- centralized errors without stack traces in production; request ids; log redaction
- authentication: Argon2id, HttpOnly cookies, rotating refresh tokens with reuse detection,
  signed double-submit CSRF, role and active-seller gates, lockout, per-IP/per-account limits
- payments: server-side pricing, Razorpay signature + API verification, raw-body webhook HMAC,
  idempotent checkout, webhooks and refunds; refunds can never exceed the captured amount
- inventory: atomic conditional stock reservation inside MongoDB transactions (no overselling)
- seller payout details encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`); only the last four
  digits are ever returned
- every privileged action is written to an append-only audit log
- non-root containers; no secrets in images, compose files or `NEXT_PUBLIC_*`

Full details are in [docs/SECURITY.md](docs/SECURITY.md).

## Authentication

| Page (web)                                   | API                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `/register`, `/login`                        | `POST /auth/register`, `POST /auth/login`                               |
| `/forgot-password`, `/reset-password?token=` | `POST /auth/forgot-password`, `POST /auth/reset-password`               |
| `/verify-email?token=`                       | `POST /auth/verify-email`, `POST /auth/resend-verification`             |
| `/account`, `/account/security`              | `GET /auth/me`, `POST /auth/change-password`, `POST /auth/logout[-all]` |
| `/seller`, `/admin` (role-gated shells)      | enforced per route with `requireRoles` / `requireActiveSeller`          |

In development, emails (verification, reset) land in Mailpit at http://localhost:8025.

## Catalogue API

| Endpoint                                              | Purpose                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /products`                                       | Listing and search with pagination. Filters: `q`, `category`, `brand`, `seller`, `minPrice`/`maxPrice` (₹), `rating`, `discount`, `inStock`, `featured`, `color`/`size`/`storage`/`ram`/`material`, `attr_<key>`. Sorts: `relevance`, `newest`, `price_asc`, `price_desc`, `rating`, `reviews`, `discount`, `popular`. |
| `GET /products/facets`                                | Filter options for a category and/or search                                                                                                                                                                                                                                                                            |
| `GET /products/suggestions?q=`                        | Autocomplete                                                                                                                                                                                                                                                                                                           |
| `GET /products/:slug`, `/:slug/related`               | Product detail and related products                                                                                                                                                                                                                                                                                    |
| `GET /categories`, `/categories/:slug`, `GET /brands` | Navigation                                                                                                                                                                                                                                                                                                             |
| `/seller/products…`, `/seller/inventory…`             | Seller product, variant and stock management (active sellers, own products only)                                                                                                                                                                                                                                       |
| `POST /uploads/images`                                | Image upload (multipart `images`; type checked from the file's content)                                                                                                                                                                                                                                                |
| `/admin/categories…`, `/admin/brands…`                | Catalogue administration (admin only)                                                                                                                                                                                                                                                                                  |

## Shopper API

All shopper endpoints are private to the caller (`Cache-Control: no-store`) and scoped to the
signed-in user taken from the session.

| Endpoint                                                          | Purpose                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /cart`                                                       | Account cart, priced from live data (issues flagged per line)                  |
| `POST /cart/items`, `PATCH/DELETE /cart/items/:variantId`         | Add, change quantity, remove (body: variant id and quantity only)              |
| `DELETE /cart`, `POST /cart/merge`                                | Empty the cart; merge a guest cart after sign-in                               |
| `POST /cart/preview`                                              | Price a guest cart (public, nothing stored)                                    |
| `GET /wishlist`, `GET /wishlist/ids`                              | Saved products; ids for heart icons                                            |
| `POST /wishlist`, `DELETE /wishlist/:productId`                   | Save (idempotent) and remove                                                   |
| `GET/POST /addresses`, `PATCH/DELETE /addresses/:id`              | Address book (max 20; first is default; deleting the default promotes another) |
| `POST /addresses/:id/default`                                     | Change the default address                                                     |
| `GET/PATCH /users/me`, `PATCH /users/me/notification-preferences` | Profile (name, phone) and email preferences (security alerts always on)        |
| `GET /products/cards?slugs=`                                      | Cards for recently viewed products, in the given order                         |

Search runs in three steps. It first tries full-word text search (MongoDB text index, weighted
towards names). If that finds nothing, it falls back to prefix matching on indexed name tokens,
so `kitch` finds Kitchora. SKU-shaped queries resolve directly to their product. Full details are in Swagger at `/api/docs`.

## Orders, sellers and admin

| Area             | Web                                       | API                                                            |
| ---------------- | ----------------------------------------- | -------------------------------------------------------------- |
| Checkout         | `/checkout`                               | `POST /checkout/quote`, `/checkout/orders`, `/checkout/verify` |
| Customer orders  | `/orders`, `/orders/[id]`                 | `/orders…` (cancel, return, retry payment)                     |
| Engagement       | `/notifications`, `/account/stock-alerts` | reviews, reports, notifications, stock alerts, `/coupons`      |
| Selling          | `/sell`, `/seller/*`                      | `/seller-applications`, `/seller/*`                            |
| Administration   | `/admin/*`                                | `/admin/*` (ADMIN role only)                                   |
| Payment webhooks | —                                         | `POST /webhooks/razorpay` (raw body, HMAC)                     |
| Public settings  | maintenance banner                        | `GET /settings`                                                |

Order statuses are driven by table-based state machines in `packages/shared/src/domain`, so the
buttons shown in each dashboard and the checks in the API come from the same rules.

## Roadmap

| Phase | Scope                                                               | Status |
| ----- | ------------------------------------------------------------------- | ------ |
| 1     | Architecture                                                        | ✅     |
| 2     | Project initialization                                              | ✅     |
| 3     | Database schemas, indexes, seed data                                | ✅     |
| 4     | Authentication, RBAC, CSRF                                          | ✅     |
| 5     | Products, categories, variants, search, filters, inventory          | ✅     |
| 6     | Storefront UX: home, listing, product page, cart, wishlist, account | ✅     |
| 7     | Seller onboarding and dashboard                                     | ✅     |
| 8     | Pricing, coupons, checkout, Razorpay, webhooks                      | ✅     |
| 9     | Admin dashboard                                                     | ✅     |
| 10    | Stock alerts, notifications, email, reviews, recommendations        | ✅     |
| 11    | Security review                                                     | ✅     |
| 12    | Testing (unit, integration, E2E)                                    | ✅     |
| 13    | Performance and deployment hardening                                | ✅     |
