# Billing & Inventory — phase 11

## Scope

Products and stock, quotations, invoices and payments, and the dashboard billing snapshot. Public routes: `/inventory/products`, `/inventory/products/new`, `/inventory/products/[id]`, `/inventory/products/[id]/edit`, `/inventory/stock`, `/quotations`, `/quotations/new`, `/quotations/[id]`, `/quotations/[id]/edit`, `/invoices` (same shape), `/payments`.

## Permissions

Three permissions were added to `lib/auth/permissions.ts` and the shell test matrix: `manageQuotations` (OWNER, ADMIN, MANAGER, ACCOUNTANT), `manageInvoices` (OWNER, ADMIN, ACCOUNTANT) and `recordPayments` (OWNER, ADMIN, ACCOUNTANT). Inventory keeps `manageInventory` (OWNER, ADMIN, MANAGER); the dashboard snapshot keeps `viewFinancials`. Catalog and customer pickers used by billing forms accept billing roles without granting them inventory or customer management.

## Architecture and security

- **Money.** `lib/billing/money.ts` and `lib/billing/line-items.ts` compute every line and document total in integer minor units; amounts must have at most two decimals, quantities at most three. Documents store the computed `lineItems`, `subtotal`, `taxTotal` and `total`; clients never send totals.
- **Shared references.** `features/billing/repositories/billing-references.ts` resolves a tenant customer (inactive customers remain valid on documents that already reference them) and a job that must belong to the same customer (`CUSTOMER_MISMATCH`). `advanceJob` walks a linked job along `packages/domain` transitions and writes a `JOB_STATUS_CHANGED` audit with the document that caused it. `billing-settings.ts` reads prefixes, timezone, currency and defaults from `organizationSettings` and allocates sequential numbers from `quotationCounters` / `invoiceCounters` inside the caller's transaction.
- **Products** (`features/products`): SKUs are unique per tenant through `productSkus` reservations (case-insensitive); `taxRatePercent: null` means the workspace default; `trackStock` products keep `quantityOnHand`, `reorderLevel` and a denormalised `lowStock` flag used by filters and the stock page. Manual movements (`POST /api/stock/movements`, `IN`/`OUT`/`ADJUST`) are idempotent per request id, refuse negative stock, inactive or untracked products, and append to `stockMovements` with the quantity before/after. `consumeStock` / `restoreStock` run inside invoice transactions.
- **Quotations** (`features/quotations`): `DRAFT → SENT → APPROVED | REJECTED | EXPIRED`. Drafts are editable; sending locks the lines. `validUntil` is a calendar date in the organization timezone, defaulting to today plus `quoteValidityDays`. A job may have only one `SENT`/`APPROVED` quotation at a time. Sending moves a `DIAGNOSING`/`QUOTATION_REQUIRED` job to `WAITING_APPROVAL`; approving moves it to `APPROVED`; rejection leaves the job for the dispatcher. `POST /api/quotations/[id]/convert` (invoice rights) creates a draft invoice with the same lines once and records `invoiceId` on the quotation.
- **Invoices** (`features/invoices`): `DRAFT → ISSUED → PARTIALLY_PAID → PAID`, plus `VOID` from `DRAFT` or an unpaid `ISSUED`. Issuing requires a linked job to be `COMPLETED` (or already invoiced), sets `dueAt` (today plus `invoiceDueDays` unless given), deducts tracked products — whole units only, never below zero, with `INVOICE_ISSUED` ledger entries — stores `stockConsumed`, and moves the job to `INVOICED`. Voiding an issued invoice restores exactly the consumed stock; it never rewinds the job.
- **Payments** (`features/payments`): immutable records against open invoices, capped at the balance due, idempotent per request id. Each payment atomically updates `amountPaid`, `balanceDue` and status on the invoice and moves a linked job `INVOICED → PARTIAL → PAID`.
- **Dashboard**: `readFinance` adds pending quotations, open invoices with outstanding amount (aggregate sum), overdue count by calendar date and payments collected in the last 30 days for `viewFinancials` roles.
- All mutations use the shared same-origin check, JSON parsing with byte limits (64 KB for documents with up to 100 lines), `getApiSession(permission)`, optimistic versions and audit rows (`PRODUCT_*`, `STOCK_MOVED`, `QUOTATION_*`, `INVOICE_*`, `PAYMENT_RECORDED`). Clients validate API responses with the same Zod detail schemas.

## UI

One client `DocumentForm` serves quotations and invoices: customer picker (or a pinned customer when raised from a job via `?jobId=`), title, date, notes and a line-item table with live totals, "Add from catalog" (fills description, price and tax from the product) and custom lines. Detail pages show status badges (with derived *past validity* / *overdue* markers), line items, linked job/quotation/invoice, two-step actions with optional notes, and on invoices the payment history and a payment form for roles that record payments. The job page gains a Billing card listing linked documents with shortcuts to raise them. Product pages include a stock card, a movement form and recent movements; the Stock page is a filterable ledger with a low-stock panel. Everything reuses the existing primitives and theme tokens.

## Firestore

New collections: `products`, `productSkus`, `stockMovements`, `quotations`, `quotationCounters`, `invoices`, `invoiceCounters`, `payments`. `firestore.indexes.json` adds 26 indexes for these collections (name/SKU search and filters on products; ledger ordering on stock movements; `createdAt`/`titleSearch`/status/job lookups on quotations and invoices; `(organizationId, status, dueAt)` for the overdue count; `paidAt` orderings for payments), plus the phase 8 and 10 indexes. Deploy with `firebase deploy --only firestore:indexes --project <id>`. Deny-all client rules are unchanged.

## Files

Created: `lib/billing/**`, `features/billing/**`, `features/products/**`, `features/quotations/**`, `features/invoices/**`, `features/payments/**`, `app/api/{products,stock,billing,quotations,invoices,payments}/**`, `app/protected/{inventory,quotations,invoices,payments}/**`, `features/dashboard/components/dashboard-finance-card.tsx`, `scripts/test-inventory.mjs`, `scripts/test-billing.mjs`, domain types in `packages/domain/src/{inventory,quotation,invoice,payment}.ts`. Changed: permissions, navigation, shell test, dashboard repository/service/KPI grid/view, jobs service/types/detail view, `reference-picker.tsx`, `package.json` (`npm test` runs every suite), `firestore.indexes.json`, the test harness (null ordering).

## Known limitations

No PDF rendering or email delivery of documents yet; payments cannot be reversed (void and re-issue an invoice before any payment is recorded); voiding an issued invoice leaves a linked job `INVOICED`; stock is tracked in whole units.

## Test checklist

`npm test` (includes `test:inventory` 5/5 and `test:billing` 6/6), `npm run lint`, `npx tsc --noEmit`. Then, in a browser: create tracked and untracked products, receive stock, raise a quotation from a job in *Quote needed*, send and approve it (job moves to Awaiting approval, then Approved), complete the job, convert the quotation, issue the invoice (stock deducted, job Invoiced, due date set), record a partial and a final payment (job Partially paid, then Paid), void a draft, and confirm the dashboard billing card and the stock ledger reflect each step. Repeat the pickers as an accountant (customers and products visible, inventory pages refused).
