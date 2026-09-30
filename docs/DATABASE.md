# ZYVENTA database guide

MongoDB 8 (replica set) via Mongoose 9. Models live next to their feature in
`apps/api/src/modules/<feature>/*.model.ts`. The registry of all 31 models is in
`src/database/models.ts`.

## Conventions

| Topic           | Rule                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mongoose import | Always `import { mongoose, Schema, model } from 'src/database/mongoose.js'`. ESLint blocks importing `mongoose` directly, so the global settings always apply.                                                                            |
| Money           | Integer **paise**, validated by `requiredMoney()` / `money()` / `optionalMoney()` in `src/database/schemas.ts`. Rates are basis points (`1800` = 18%).                                                                                    |
| Prices & tax    | Prices include GST (the MRP convention), so tax is _extracted_ with `includedTax()` from `@zyventa/shared`.                                                                                                                               |
| Enums           | Every status and enum comes from `@zyventa/shared`, so the API and web can't drift apart.                                                                                                                                                 |
| Status changes  | Only through services that check the table-driven state machines (`sellerOrderStateMachine`, `returnStateMachine`) and append to `statusHistory`.                                                                                         |
| Snapshots       | Orders copy the address, product name, SKU, price and image at purchase. Later edits never rewrite history.                                                                                                                               |
| Deletion        | Catalogue data is soft-deleted (`status: ARCHIVED`), because order items reference it. Only ephemeral data is hard-deleted, via TTL indexes.                                                                                              |
| Secrets         | `passwordHash`, token hashes and encrypted payout data use `select: false` **and** are stripped from `toJSON`.                                                                                                                            |
| Injection       | Requests with `$`, `.` or `__proto__` keys are rejected at the edge (`rejectOperatorKeys`), and zod schemas accept primitives only where primitives are expected.                                                                         |
| Indexes         | Every index maps to a concrete query, noted in a comment beside it. `tests/models/indexes.test.ts` snapshots the full set, so index changes show up in review. Production builds indexes with `db:sync-indexes --apply`, not `autoIndex`. |

## Relationships

```
User ─1:1─ Seller ─1:N─ Product ─1:N─ ProductVariant ─1:N─ StockAlert
 │                        ├─N:1 Category (parent + ancestors[] + level)
 │                        └─N:1 Brand
 ├─1:N─ Address (partial unique: one default)       ├─ Session (refresh tokens, TTL)
 ├─1:1─ Cart (embedded lines)                       ├─ AuthToken (verify/reset, TTL)
 ├─1:1─ Wishlist (embedded items)                   ├─ Notification (TTL 180 d)
 ├─1:N─ SellerApplication ──approve──▶ Seller       └─ Report ─▶ Product | Review | Seller
 └─1:N─ Order
          ├─1:N─ SellerOrder (per-seller shipment, state machine)
          │        └─1:N─ OrderItem ─0:1─ Review (unique per line)
          │                          └─0:N─ ReturnRequest (one open per line)
          ├─1:N─ Payment (Razorpay attempts) ─1:N─ Refund
          └─0:1─ CouponRedemption ─N:1─ Coupon
Offer · SellerLedgerEntry · AuditLog (append-only) · WebhookEvent (TTL 90 d)
IdempotencyKey (TTL 24 h) · PlatformSetting (singleton) · Counter (sequences)
```

## Collections

| Model                     | Purpose                                              | Key constraints                                                                             |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| User                      | Accounts; `roles[]` of USER, SELLER, ADMIN           | unique email (lowercased)                                                                   |
| Address                   | Address book                                         | one default per user (partial unique)                                                       |
| Session                   | Refresh-token rotation and reuse detection           | unique `tokenHash`; TTL on `expiresAt`                                                      |
| AuthToken                 | Email-verification and password-reset tokens         | unique `tokenHash`; TTL                                                                     |
| Seller                    | Store profile, commission, payout account            | unique `user`, unique `slug`                                                                |
| SellerApplication         | Onboarding requests                                  | one PENDING per user                                                                        |
| SellerLedgerEntry         | Signed-paise earnings, commission, refunds, payouts  | one SALE/COMMISSION per shipment                                                            |
| Category                  | Tree with denormalised `ancestors`                   | unique `slug`; level = ancestors.length                                                     |
| Brand                     | Brands                                               | unique `slug`; case-insensitive unique name                                                 |
| Product                   | Listing; denormalised price, stock and rating fields | unique `slug`; weighted text index; one listing index per sort                              |
| ProductVariant            | Price, stock, reservations                           | unique `sku`; unique `(product, optionsKey)`; price ≤ MRP; reserved ≤ stock                 |
| Cart / Wishlist           | One per user, bounded embedded lines                 | unique `user`; no duplicate lines                                                           |
| Order                     | One per checkout: totals and payment state           | unique `orderNumber`; unique `(user, idempotencyKey)`; total = subtotal − coupon + shipping |
| SellerOrder               | Per-seller fulfilment                                | unique `subOrderNumber`                                                                     |
| OrderItem                 | Line snapshot and money split                        | line arithmetic validated; refunds ≤ line total                                             |
| ReturnRequest             | Item-level returns                                   | one open return per line                                                                    |
| Payment / Refund          | Razorpay records                                     | unique Razorpay order, payment and refund ids; refund idempotency key                       |
| WebhookEvent              | Webhook dedupe                                       | unique `(provider, eventId)`                                                                |
| Coupon / CouponRedemption | Codes and usage                                      | unique `code`; one redemption per order                                                     |
| Offer                     | Automatic sales                                      | best single offer per line                                                                  |
| Review                    | Verified reviews                                     | unique per `orderItem`                                                                      |
| Notification              | In-app inbox                                         | unique `(user, dedupeKey)` when set                                                         |
| StockAlert                | Back-in-stock subscriptions                          | unique `(user, variant)`                                                                    |
| AuditLog                  | Privileged-action trail                              | append-only (updates and deletes throw)                                                     |
| Report                    | User reports                                         | one per `(reporter, target)`                                                                |
| IdempotencyKey            | Replay protection for POSTs                          | unique `(user, scope, key)`; TTL                                                            |
| PlatformSetting           | Typed singleton config                               | unique `key`                                                                                |
| Counter                   | Atomic sequences for order numbers                   | `_id` = sequence name                                                                       |

## Inventory model (overselling prevention)

`available = stock − reserved`

1. **Checkout** reserves stock inside the order transaction:
   ```js
   updateOne(
     { _id, $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, qty] } },
     { $inc: { reserved: qty } },
   );
   ```
   `modifiedCount === 0` means not enough stock, and the transaction aborts.
2. **Payment confirmed:** `$inc: { stock: -qty, reserved: -qty }`.
3. **Expired or failed:** `$inc: { reserved: -qty }`.

The integration test fires 10 concurrent reservations at 5 units and asserts exactly 5 succeed.

## Scripts

```bash
pnpm db:sync-indexes            # dry run: list index differences
pnpm db:sync-indexes --apply    # create missing and drop stale indexes (deploy step)
pnpm db:seed                    # demo data into an empty database (refuses production)
pnpm db:seed --reset            # DROP the database, then seed
pnpm create-admin --email you@example.com --name "Your Name"
```

Inside the production container: `node dist/scripts/sync-indexes.js --apply` and
`node dist/scripts/create-admin.js …`. Seeding is development-only.

### Demo data (`db:seed`)

- **Accounts:** 1 admin, 3 customers with default addresses, and 4 active sellers.
  - Emails use `@zyventa.test`, a reserved domain that can never receive mail.
  - Every account's password is `SEED_USER_PASSWORD`, or `Zyventa@dev2026` if unset.
- **Catalogue:** 34 categories (8 roots, up to 3 levels deep), 21 fictional brands, and 91
  products with 296 variants (sizes, colours, storage and RAM). About 8% of variants
  are out of stock, to exercise stock alerts.
- **Promotions:** coupons `WELCOME10`, `FLAT150`, `LOOM20` (seller-funded) and `EXPIRED5`, plus
  one "Electronics Week" offer.
- **Reproducible:** a seeded PRNG makes every developer get identical data.
