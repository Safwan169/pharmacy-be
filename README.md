# Pharmacy Management System — Backend

NestJS + PostgreSQL (TypeORM) API.

Three things drive the design:

1. The catalogue is bulk-imported from `medicine.csv` **without price or stock**.
2. An admin then works through the SKUs one at a time, filling in price and stock.
3. Priced items are sold through a direct POS checkout that produces a PDF invoice.

A single admin account (seeded, no registration endpoint) guards the write
operations; browsing and searching are public.

## Features

| # | Feature | Module | Endpoints |
| --- | --- | --- | --- |
| 1 | Admin login with JWT (seeded account, no public registration) | `auth` | `POST /auth/login`, `GET /auth/me` |
| 2 | Bulk catalogue import from `medicine.csv` — idempotent, transactional | `import` | `POST /import/csv` + `npm run import:csv` |
| 3 | Reference data for filter dropdowns | `manufacturers`, `generics` | `GET /manufacturers`, `GET /generics` |
| 4 | Alternative-brand lookup — every brand built on one active ingredient | `generics` | `GET /generics/:id/variants` |
| 5 | Browse brand lines with their SKU count | `products` | `GET /products`, `GET /products/:id` |
| 6 | SKU search with filters + the **pricing worklist** | `product-variants` | `GET /variants`, `GET /variants/:id` |
| 7 | Price & stock entry (independent of each other) | `product-variants` | `PATCH /variants/:id/pricing` |
| 8 | Withdraw / restore a SKU (soft delete, never hard) | `product-variants` | `DELETE /variants/:id`, `POST /variants/:id/restore` |
| 9 | POS checkout — all-or-nothing, race-safe stock deduction | `sales` | `POST /sales/checkout` |
| 10 | Sales history & receipt lookup | `sales` | `GET /sales`, `GET /sales/:id` |
| 11 | Auto-numbered PDF invoice (`INV-YYYYMMDD-NNNN`) | `sales` | `GET /sales/:id/invoice/pdf` |
| 12 | Low-stock alerts, computed live | `dashboard` | `GET /dashboard/low-stock` |
| 13 | Sales summary by preset or custom period | `dashboard` | `GET /dashboard/summary` |
| 14 | Swagger/OpenAPI docs for every route | — | `GET /api/docs` |

Cross-cutting: Joi-validated env at boot, global `ValidationPipe`
(`whitelist` + `forbidNonWhitelisted`, so an unknown query param is a `400`),
uniform pagination envelope, migration-owned schema, and CORS enabled.

## Workflow

The system runs in four stages. Each stage names the endpoint that drives it.

### Stage 1 — Load the catalogue (one time, then whenever the source file changes)

```text
medicine.csv ──▶ npm run import:csv ──▶ manufacturers + generics + products + product_variants
                 (or POST /import/csv)     price = NULL, stock_quantity = NULL
```

21,714 CSV rows become 232 manufacturers, 1,661 generics, 14,013 products and
21,714 variants. **Price and stock are deliberately left `NULL`** — the source
file's prices are unusable (see [Import](#import)). The whole load is one
transaction and re-running it never overwrites pricing work.

### Stage 2 — Admin prices the catalogue (the daily back-office loop)

```text
POST /auth/login                          → JWT
GET  /variants?pricing_status=missing     → the worklist: SKUs with no price yet
GET  /variants/:id                        → inspect one SKU
PATCH /variants/:id/pricing               → set price and/or stock
DELETE /variants/:id                      → withdraw a SKU the shop won't carry
POST  /variants/:id/restore               → undo that
```

The worklist shrinks as the admin works: setting a price moves the SKU out of
`pricing_status=missing` and into `pricing_status=set`, where it becomes
sellable. `GET /variants` narrows the queue by `manufacturer_id`, `generic_id`,
`dosage_form`, `type` and free-text `search`, so the admin can price one
company's shelf at a time.

### Stage 3 — Sell at the counter (POS)

```text
GET  /variants?search=napa        → find the item (or GET /generics/:id/variants for an alternative brand)
POST /sales/checkout              → submit the whole basket in one request
        ├─ ✅ 201 → stock deducted, sale + line items written, invoice number issued
        └─ ❌ 422 → nothing written, per-line reasons returned
GET  /sales/:id/invoice/pdf       → hand the customer the invoice
```

There is no cart resource and no server-side session — the client holds the
basket and posts it once. Validation, stock deduction and the sale record all
happen inside a single transaction, so a rejected line leaves the database
exactly as it was. See [Checkout](#checkout).

### Stage 4 — Monitor and restock

```text
GET /dashboard/low-stock                       → what to reorder, lowest stock first
     └─▶ PATCH /variants/:id/pricing {"stock_quantity": 300}   ← back to Stage 2
GET /dashboard/summary?period=this_week        → earnings, units, transactions
GET /sales?search=INV-20260817&from=&to=       → find a past sale, re-download its PDF
```

Restocking closes the loop: the low-stock widget links straight back to the same
pricing endpoint Stage 2 uses.

### Who can call what

Browsing is public; anything that writes, or that exposes money, needs the admin
JWT as `Authorization: Bearer <token>`.

| Public | Admin only (Bearer) |
| --- | --- |
| `/manufacturers`, `/generics`, `/generics/:id/variants`, `/products`, `/products/:id`, `/variants`, `/variants/:id` | `/auth/me`, `/variants/:id/pricing`, `/variants/:id` (DELETE), `/variants/:id/restore`, `/import/csv`, all of `/sales`, all of `/dashboard` |

## Requirements

- Node.js 22+
- A running PostgreSQL instance

## Setup

```bash
npm install
cp .env.example .env        # then fill in your database credentials
createdb pharmacy_db
npm run migration:run       # creates all five tables
npm run seed:admin          # creates the admin user from ADMIN_EMAIL/ADMIN_PASSWORD
npm run import:csv          # loads the 21,714-row catalogue
npm run start:dev
```

Swagger UI: <http://localhost:3000/api/docs>

### Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `3000`) |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Postgres connection |
| `DB_SYNCHRONIZE` | Leave `false`. Migrations own the schema. |
| `JWT_SECRET` | Signing key. Use a long random value per environment. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `1d`, `12h` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credentials the seed script writes. Read by `seed:admin` only. |
| `LOW_STOCK_THRESHOLD` | Stock below this flags a variant as low (default `5`) — see [Dashboard](#dashboard). |
| `INVOICE_FONT_PATH` | Optional. Path to a Unicode TTF so invoices can print `৳` — see [Invoices](#invoices). |

Validated with Joi at startup, so a missing or malformed value fails the boot
immediately rather than surfacing later on a query.

## Data model

```text
manufacturers ──< products ──< product_variants >── generics
                                     │
                          price & stock live here
                                     │
                              sale_items >── sales >── users
```

- **products** is a brand line, identified by **(brand_name, manufacturer_id)
  together** — 70 brand names in the source are reused by unrelated companies,
  so brand name alone would merge different medicines.
- **product_variants** is the sellable SKU, one per CSV row. `generic_id` sits
  here rather than on the product because ~5% of multi-variant brands differ in
  generic between variants (e.g. oral vs lotion).
- `strength` and `generic_id` are nullable (849 and 2 source rows respectively).
- `price` / `stock_quantity` start `NULL`. **`NULL` means "no admin has set this
  yet"; `0` means "confirmed out of stock"** — a deliberate distinction.
- `is_active` on a variant is the soft-delete flag. The row is never removed,
  because `sale_items` points at it — see [Withdrawing a SKU](#withdrawing-a-sku).
- **sale_items** snapshots the brand name, dosage form, strength and unit price
  at checkout time. A later catalogue edit must never rewrite a past invoice, so
  invoices render from those snapshots, not a live join.

### Migrations

The schema is owned by migrations, never by `synchronize`.

```bash
npm run migration:run       # apply
npm run migration:show      # status
npm run migration:revert    # roll back the last one
npm run migration:generate -- src/database/migrations/<Date.now()>-YourChange
```

Migration timestamps must come from a real `Date.now()` — TypeORM orders and
tracks migrations by that number, so a guessed value can sort behind an
already-applied migration and silently never run.

## Import

Idempotent, and safe to re-run. Variants are matched on the CSV's `brand id`
(stored as `legacy_brand_id`); an existing row has its descriptive fields
refreshed while **`price`, `stock_quantity` and `price_updated_at` are left
untouched**, so a re-import never wipes out pricing work. The whole load runs in
one transaction.

```bash
npm run import:csv                      # defaults to src/docs/medicine.csv
npm run import:csv -- path/to/file.csv
```

`POST /import/csv` does the same thing from an admin-authenticated upload. Prefer
the CLI for the initial load — 21,714 rows takes long enough to risk an HTTP
timeout.

Prices in the source file are ignored entirely: 42 rows have none, and the rest
bundle several prices as unstructured text (`Unit Price: ৳ 3.50,(100's pack: ৳ 350.00)`).

### A note on slugs

The source CSV's slugs are **not unique** — 111 slugs are shared by 234 rows,
both within a single brand and across unrelated manufacturers. Since the schema
declares `slug UNIQUE`, the importer appends the row's `legacy_brand_id` to any
slug that collides (`albuteiniv-infusion5` → `albuteiniv-infusion5-414` and
`albuteiniv-infusion5-14907`). Collisions are detected up front across the whole
file, so the result does not depend on row order and re-imports are stable.

## API

Every route is documented and callable in Swagger UI at `/api/docs`. Protected
routes take `Authorization: Bearer <token>` from `POST /auth/login`.

| Method | Route | Auth | Query / body | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | — | `{ email, password }` | Exchanges email + password for a JWT |
| `GET` | `/auth/me` | **Bearer** | — | Returns the token holder's `id`, `email`, `role` |
| `GET` | `/manufacturers` | — | `search`, `page`, `limit` | List/search companies |
| `GET` | `/generics` | — | `search`, `page`, `limit` | List/search generics |
| `GET` | `/generics/:id/variants` | — | `page`, `limit` | Alternative brands sharing this generic |
| `GET` | `/products` | — | `search`, `manufacturer_id`, `type`, `page`, `limit` | Browse brand lines, each with `variantCount` |
| `GET` | `/products/:id` | — | — | One product with all variants nested |
| `GET` | `/variants` | — | see filters below | The main admin search |
| `GET` | `/variants/:id` | — | — | One SKU with product, manufacturer, generic |
| `PATCH` | `/variants/:id/pricing` | **Bearer** | `{ price?, stock_quantity? }` | Sets price and/or stock; either alone is fine |
| `DELETE` | `/variants/:id` | **Bearer** | — | Withdraws a SKU (soft delete) |
| `POST` | `/variants/:id/restore` | **Bearer** | — | Puts a withdrawn SKU back |
| `POST` | `/import/csv` | **Bearer** | `multipart/form-data`, field `file` | Imports a CSV upload (max 25 MB) |
| `POST` | `/sales/checkout` | **Bearer** | `{ items[], discount?, payment_method? }` | Direct POS checkout of a whole basket |
| `GET` | `/sales` | **Bearer** | `search`, `from`, `to`, `page`, `limit` | List/search past sales |
| `GET` | `/sales/:id` | **Bearer** | — | Full sale with items and discount breakdown |
| `GET` | `/sales/:id/invoice/pdf` | **Bearer** | — | Downloads the invoice PDF |
| `GET` | `/dashboard/low-stock` | **Bearer** | — | Variants needing restock, lowest first |
| `GET` | `/dashboard/summary` | **Bearer** | `period` or `from`+`to` | Earnings and volume for a period |

`GET /variants` filters: `search` (brand or generic name), `manufacturer_id`,
`generic_id`, `dosage_form`, `type` (`allopathic` | `herbal`), `pricing_status`
(`missing` | `set`), `status` (`active` | `inactive` | `all`), `page`, `limit`.
Unknown query params are rejected with a `400` rather than silently ignored.

**The pricing worklist** is `pricing_status=missing`, which selects variants with
no price yet — backed by the `idx_variants_price_null` partial index:

```bash
curl 'http://localhost:3000/variants?pricing_status=missing&manufacturer_id=12&limit=50'

curl -X PATCH http://localhost:3000/variants/1/pricing \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"price": 40.12, "stock_quantity": 250}'
```

**Price and stock are independent.** Send either on its own — a restock does not
have to resend a price that hasn't changed:

```bash
-d '{"stock_quantity": 300}'      # restock only
-d '{"price": 42.00}'             # re-price only
```

`price_updated_at` is stamped only when `price` is in the request; a stock-only
restock leaves it alone, since restocking says nothing about whether the price
was reconfirmed. An empty body is a `400` rather than a 200 that changed
nothing.

### Withdrawing a SKU

`DELETE /variants/:id` is a **soft delete** — it sets `is_active = false`.

```bash
curl -X DELETE http://localhost:3000/variants/9002 -H "Authorization: Bearer <token>"
curl -X POST http://localhost:3000/variants/9002/restore -H "Authorization: Bearer <token>"
curl 'http://localhost:3000/variants?status=inactive'   # review what was withdrawn
```

There is deliberately **no hard delete**. `sale_items.product_variant_id`
references `product_variants` with no `ON DELETE` rule, so removing a variant
that has ever sold would fail on the foreign key — and relaxing that constraint
would destroy the line items past invoices render from. Deactivating is
reversible, and works the same whether or not the SKU has ever sold.

A withdrawn variant disappears from `GET /variants`, from the nested list and
`variantCount` on products, and from the low-stock widget; `POST /sales/checkout`
rejects it with reason `inactive`. `GET /variants/:id` still returns it, so the
admin can inspect and restore it. Price and stock are preserved untouched.

`status` on `GET /variants` is `active` (default), `inactive`, or `all`.

A re-import will not resurrect a withdrawn SKU — the importer's `orUpdate`
column list doesn't include `is_active`.

All list endpoints return `{ data, meta: { total, page, limit, totalPages } }`,
default 20 per page, max 100.

## Checkout

There is no cart resource. The client collects the basket itself and submits it
in one request; the backend holds no session state.

```bash
curl -X POST http://localhost:3000/sales/checkout \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{
        "items": [ {"variant_id": 123, "quantity": 2},
                   {"variant_id": 456, "quantity": 1} ],
        "discount": { "type": "percentage", "value": 10 }
      }'
```

**All or nothing.** Every line must have a price and enough stock. If any line
fails, nothing is written and no stock moves — the response is `422` with a
per-line breakdown, so the client needs no second lookup:

```json
{
  "statusCode": 422,
  "message": "Checkout rejected: no stock was deducted and no sale was recorded.",
  "errors": [
    { "variant_id": 456, "reason": "insufficient_stock",
      "message": "Only 3 in stock, 5 requested.",
      "requested_quantity": 5, "available_quantity": 3 }
  ]
}
```

Reasons are `not_found`, `inactive` (withdrawn from the catalogue), `not_priced`,
`insufficient_stock`, `duplicate_item` (the same variant listed twice — combine
it into one line), and `stock_changed`.

**Concurrency.** Checkout runs in one transaction and deducts stock with a
conditional update per line:

```sql
UPDATE product_variants SET stock_quantity = stock_quantity - $1
WHERE id = $2 AND stock_quantity >= $1 AND is_active = true
```

If that matches zero rows, someone else bought the item — or it was withdrawn —
in the meantime; the whole transaction rolls back and the response says to retry
(`stock_changed`). The `is_active` check is repeated here rather than trusted
from the validation pass, so a withdrawal landing mid-checkout is caught too.
Lines are deducted in variant-id order so two concurrent checkouts touching the
same items take locks in the same sequence and cannot deadlock.

**Money** is computed in integer poisha and only converted back at the edges —
in floats, `300 * 0.10` is `30.000000000000004`, which would land in a
`NUMERIC(10,2)` column. The discount applies once to the subtotal, never per
line, and is clamped to it so a total can never go negative.

## Invoices

Every successful checkout gets an `INV-YYYYMMDD-NNNN` number, where `NNNN` is
that day's counter. The counter lives in `invoice_sequences` and is bumped with
a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, which takes a row
lock — counting the day's sales instead would race and hand two concurrent
checkouts the same number.

`GET /sales/:id/invoice/pdf` streams the PDF (pdfkit). It renders the invoice
number and timestamp, the line items from their snapshots, subtotal, the
discount line (omitted entirely when there was none), total, payment method and
the processing admin.

> **On the ৳ sign.** pdfkit's built-in Helvetica is WinAnsi-encoded and has no
> Taka glyph — it encodes with zero advance width and renders as *nothing*,
> silently. Amounts are therefore labelled `BDT 270.00` by default. To print
> `৳270.00` instead, point `INVOICE_FONT_PATH` at a Unicode TTF that covers
> U+09F3 (e.g. Noto Sans Bengali); the service picks it up at startup and falls
> back with a warning if the file can't be read.

## Dashboard

Two read-only views over data the catalogue and sales modules already own. The
module adds **no tables and no columns**.

### Low stock

```bash
curl http://localhost:3000/dashboard/low-stock -H "Authorization: Bearer <token>"
```

Every variant with `stock_quantity < LOW_STOCK_THRESHOLD`, lowest first, ties
broken by id so repeated polls don't reshuffle the widget. The badge count is
just the array length.

Computed **live** on every request rather than stored. An `alerts` table would
have to be kept in step with every stock movement and would be wrong the moment
it drifted; a filtered scan of `product_variants` is always correct and, at this
size, cheap.

Variants whose stock is `NULL` are excluded — that means "never counted", which
is not the same as running out.

There is no push stream. The dashboard polls this endpoint (~30s is plenty). SSE
via `@Sse()` would be the natural upgrade if live push is ever wanted, emitting
from the checkout transaction — the only place stock ever falls — but nothing
about this endpoint would have to change to add it.

### Sales summary

```bash
curl 'http://localhost:3000/dashboard/summary?period=this_week' -H "Authorization: Bearer <token>"
curl 'http://localhost:3000/dashboard/summary?from=2026-07-10&to=2026-07-15' -H "Authorization: Bearer <token>"
```

```json
{
  "period": { "from": "2026-07-10", "to": "2026-07-15" },
  "total_earning": 45250.00,
  "total_units_sold": 320,
  "total_transactions": 58,
  "distinct_products_sold": 74
}
```

`period` is `today` | `this_week` | `this_month`. An explicit `from`/`to` pair
wins over it; with neither, it's `today`. Both halves of a custom range are
required together, and `from` after `to` is a `400` rather than a silent zero.
`total_earning` is the sum of `total_amount` — **after** discount, the money
actually taken.

**Two grains, not one join.** Aggregating over `sales JOIN sale_items` would
return a row per *line*, so `SUM(total_amount)` would add each sale's total once
per line it contains — a three-line sale of ৳100 would report ৳300. Sale-level
and item-level figures are therefore summed in separate CTEs and combined after.

**Timezone.** `created_at` is `TIMESTAMPTZ`, but the pharmacy's day is an
`Asia/Dhaka` day. Presets resolve to local civil dates first and convert to
instants once; deriving "today" from UTC would push the boundary six hours back
into the previous evening and file that evening's sales under the wrong day.

**The upper bound is exclusive** — `created_at < start of the day after to`,
never `<= to`. Compared against midnight, `<=` would keep only the first instant
of the final day and drop the rest of it.

The date scan is served by `idx_sales_created_at`, which already exists from the
sales migration.

## Structure

```text
src/
  config/configuration.ts        # env loading + Joi validation
  database/
    data-source.ts               # standalone DataSource for the TypeORM CLI
    migrations/
    seeds/                       # admin-user + medicine-import scripts
  docs/medicine.csv              # source data
  common/                        # guards, decorators, pagination, transformers
  modules/
    auth/  manufacturers/  generics/  products/  product-variants/
    import/  sales/  dashboard/
```

Feature modules own their entities via `TypeOrmModule.forFeature([...])`;
`autoLoadEntities` picks them up, so a new module needs no change to
`DatabaseModule`.

## Tests

```bash
npm test           # unit tests — no database required
npm run test:e2e   # boots the real AppModule, so Postgres must be reachable
```

The unit suite covers the parts that must be right and don't need a database:

- **Import parser** — runs the real 21,714-row `medicine.csv` and asserts the
  documented cardinality (232 manufacturers, 1,661 generics, 14,013 products),
  the null-tolerance rules, slug disambiguation, and that parsing twice gives
  byte-identical output.
- **Checkout totals** — the spec's worked example, flat and percentage
  discounts, clamping at the subtotal, and cent-level precision.
- **Invoice PDF** — renders real documents and decodes the content stream to
  assert the drawn text, including that the discount line disappears when there
  is no discount.
- **Auth** — token payload, generic 401s, and the timing-attack mitigation.
- **Dashboard date ranges** — preset resolution, month/year/leap-day rollover,
  and the two boundary bugs this code exists to avoid: a sale at 23:00 local
  landing in the wrong day when read off UTC, and the last day of a range being
  truncated by an inclusive upper bound.
- **Dashboard queries** — the low-stock threshold and null-stock exclusion, and
  that summary figures stay at the sale grain instead of multiplying by line
  count.
