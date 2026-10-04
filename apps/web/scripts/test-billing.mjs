import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { moduleLoader, MemoryFirestore, firestoreMock } from "./helpers/firestore-harness.mjs";

const owner = { uid: "owner-a", organizationId: "org-a", role: "OWNER", displayName: "Olive Owner" };
const manager = { ...owner, uid: "manager-a", role: "MANAGER", displayName: "Manny Manager" };
const accountant = { ...owner, uid: "acct-a", role: "ACCOUNTANT", displayName: "Ann Accountant" };
const dispatcher = { ...owner, uid: "disp-a", role: "DISPATCHER", displayName: "Dee Dispatcher" };
const tests = [];
const test = (name, run) => tests.push({ name, run });
function same(actual, expected, message) { assert.equal(JSON.stringify(actual), JSON.stringify(expected), message); }
const T = firestoreMock.Timestamp;

const lines = [
  { productId: null, description: "Diagnostic visit", quantity: 1, unitPrice: 100, taxRatePercent: 10 },
  { productId: null, description: "Labour", quantity: 2.5, unitPrice: 60, taxRatePercent: 18 },
];
const draft = { customerId: "cust-a", jobId: null, title: "Boiler repair", notes: "Parts extra.", validUntil: null, lineItems: lines };

function fixture({ jobStatus = "QUOTATION_REQUIRED" } = {}) {
  const db = new MemoryFirestore();
  db.seed("organizationSettings/org-a", { organizationId: "org-a", timezone: "Asia/Kolkata", jobNumberPrefix: "JOB", quotationNumberPrefix: "quo", invoiceNumberPrefix: "INV", currency: "INR", defaultTaxRatePercent: 18, quoteValidityDays: 30, invoiceDueDays: 14 });
  db.seed("customers/cust-a", { organizationId: "org-a", name: "Acme Hotels", customerNumber: "CUS-000001", nameSearch: "acme hotels", isActive: true });
  db.seed("customers/cust-b", { organizationId: "org-a", name: "Beta Flats", customerNumber: "CUS-000002", nameSearch: "beta flats", isActive: true });
  db.seed("customers/cust-inactive", { organizationId: "org-a", name: "Gone Ltd", customerNumber: "CUS-000003", nameSearch: "gone ltd", isActive: false });
  db.seed("jobs/job-a", { organizationId: "org-a", jobNumber: "JOB-000007", customerId: "cust-a", customerName: "Acme Hotels", customerNumber: "CUS-000001", serviceTypeId: "svc", serviceTypeName: "Boiler", title: "Boiler repair", titleSearch: "boiler repair", description: "", priority: "NORMAL", serviceAddress: "1 High St", status: jobStatus, assignedTechnicianId: "tech-a", assignedTechnicianName: "Tess", scheduledAt: null, completedAt: null, serviceRequestId: null, version: 3, createdAt: T.now(), updatedAt: T.now() });
  db.seed("products/pipe", { organizationId: "org-a", name: "Copper pipe", nameSearch: "copper pipe", sku: "PIPE", description: "", unit: "m", unitPrice: 4.5, taxRatePercent: null, trackStock: true, reorderLevel: 2, isActive: true, quantityOnHand: 10, lowStock: false, version: 1, createdAt: T.now(), updatedAt: T.now() });
  db.seed("products/labour", { organizationId: "org-a", name: "Labour hour", nameSearch: "labour hour", sku: "LAB", description: "", unit: "hr", unitPrice: 60, taxRatePercent: 0, trackStock: false, reorderLevel: 0, isActive: true, quantityOnHand: 0, lowStock: false, version: 1, createdAt: T.now(), updatedAt: T.now() });
  const load = moduleLoader({
    "firebase-admin/firestore": firestoreMock,
    "@/src/lib/firebase/admin": { adminDb: db },
    console: { error() {}, warn() {}, log() {}, info() {}, debug() {} },
  });
  return {
    db, load,
    quotations: load("src/features/quotations/repositories/quotation.repository.ts"), qErrors: load("src/features/quotations/repositories/quotation-errors.ts"),
    invoices: load("src/features/invoices/repositories/invoice.repository.ts"), iErrors: load("src/features/invoices/repositories/invoice-errors.ts"),
    payments: load("src/features/payments/repositories/payment.repository.ts"), pErrors: load("src/features/payments/repositories/payment-errors.ts"),
    refs: load("src/features/billing/repositories/billing-references.ts"), stockErrors: load("src/features/products/repositories/product-errors.ts"),
    money: load("src/lib/billing/line-items.ts"),
  };
}
const job = (f) => f.db.records.get("jobs/job-a");
const product = (f, id) => f.db.records.get(`products/${id}`);
const quote = (f, values = {}, session = owner) => f.quotations.createQuotation(session, { ...draft, ...values, requestId: randomUUID() });

test("line totals are computed in minor units and the schema rejects empty or oversized documents", () => {
  const f = fixture();
  const totals = f.money.computeTotals(lines);
  assert.equal(totals.subtotal, 250);
  assert.equal(totals.taxTotal, 37);
  assert.equal(totals.total, 287);
  assert.equal(totals.lineItems[1].lineSubtotal, 150);
  assert.equal(f.money.computeTotals([{ productId: null, description: "x", quantity: 3, unitPrice: 0.1, taxRatePercent: 0 }]).total, 0.3, "no floating point drift");
  const schema = f.load("src/features/quotations/schemas/quotation.schema.ts");
  assert.equal(schema.quotationFormSchema.safeParse({ ...draft, lineItems: [] }).success, false);
  assert.equal(schema.quotationFormSchema.safeParse({ ...draft, validUntil: "2026-13-01" }).success, false);
  assert.equal(schema.quotationFormSchema.safeParse({ ...draft, status: "APPROVED" }).success, false, "status is never set through the form");
  assert.equal(schema.quotationFormSchema.safeParse({ ...draft, lineItems: [{ ...lines[0], unitPrice: 1.005 }] }).success, false);
});

test("quotations are numbered from settings, default their validity, and verify customer and job references", async () => {
  const f = fixture();
  const requestId = randomUUID();
  const created = await f.quotations.createQuotation(manager, { ...draft, requestId });
  assert.equal(created.quotationNumber, "QUO-000001", "prefix is upper-cased from organization settings");
  assert.equal(created.currency, "INR");
  assert.equal(created.total, 287);
  assert.equal(created.validUntil, "2026-10-29", "today in Asia/Kolkata plus 30 days");
  assert.equal(created.customerName, "Acme Hotels");
  assert.equal(created.status, "DRAFT");
  const replay = await f.quotations.createQuotation(manager, { ...draft, requestId });
  assert.equal(replay.id, created.id);
  assert.equal(f.db.values("quotations").length, 1);
  const second = await quote(f, { jobId: "job-a", validUntil: "2026-11-15" });
  assert.equal(second.quotationNumber, "QUO-000002");
  assert.equal(second.jobNumber, "JOB-000007");
  await assert.rejects(quote(f, { customerId: "cust-b", jobId: "job-a" }), (error) => error instanceof f.refs.BillingReferenceError && error.reference === "CUSTOMER_MISMATCH");
  await assert.rejects(quote(f, { customerId: "cust-inactive" }), (error) => error instanceof f.refs.BillingReferenceError && error.reference === "CUSTOMER");
  await assert.rejects(quote(f, { jobId: "missing" }), (error) => error instanceof f.refs.BillingReferenceError && error.reference === "JOB");
  await assert.rejects(quote(f, {}, dispatcher), f.qErrors.QuotationAccessError);
  await assert.rejects(quote(f, {}, { ...owner, organizationId: "org-b" }), f.refs.BillingReferenceError, "another tenant cannot bill this customer");
  const updated = await f.quotations.updateQuotation(owner, created.id, { ...draft, title: "Boiler repair and flush", lineItems: [lines[0]], version: 1 });
  assert.equal(updated.total, 110);
  assert.equal(updated.version, 2);
  assert.equal(updated.validUntil, "2026-10-29", "validity is kept when the form leaves it empty");
  await assert.rejects(f.quotations.updateQuotation(owner, created.id, { ...draft, version: 1 }), f.qErrors.QuotationConflictError);
  const list = await f.quotations.listQuotations(owner, {});
  assert.equal(list.quotations.length, 2);
  same((await f.quotations.listQuotations(owner, { q: "boiler repair and" })).quotations.map((row) => row.id), [created.id]);
});

test("sending and approving a quotation walks the linked job through approval", async () => {
  const f = fixture({ jobStatus: "DIAGNOSING" });
  const first = await quote(f, { jobId: "job-a" });
  await assert.rejects(f.quotations.transitionQuotation(owner, first.id, { action: "APPROVE", version: 1 }), f.qErrors.QuotationStateError, "drafts cannot be approved");
  const sent = await f.quotations.transitionQuotation(owner, first.id, { action: "SEND", version: 1, note: "Emailed to site manager" });
  assert.equal(sent.status, "SENT");
  assert.ok(sent.sentAt);
  assert.equal(job(f).status, "WAITING_APPROVAL");
  assert.equal(job(f).version, 4);
  const jobAudit = f.db.values("auditLogs").filter((row) => row.data.entityType === "JOB").at(-1).data;
  same(jobAudit.metadata.path, ["QUOTATION_REQUIRED", "WAITING_APPROVAL"]);
  assert.equal(jobAudit.metadata.quotationNumber, "QUO-000001");
  const second = await quote(f, { jobId: "job-a", title: "Alternative" });
  await assert.rejects(f.quotations.transitionQuotation(owner, second.id, { action: "SEND", version: 1 }), (error) => error instanceof f.qErrors.QuotationRuleError && error.rule === "JOB_HAS_ACTIVE_QUOTATION");
  const rejected = await f.quotations.transitionQuotation(owner, first.id, { action: "REJECT", version: 2 });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(job(f).status, "WAITING_APPROVAL", "a rejection leaves the job for the dispatcher");
  const resent = await f.quotations.transitionQuotation(owner, second.id, { action: "SEND", version: 1 });
  assert.equal(resent.status, "SENT");
  assert.equal(job(f).version, 4, "the job is already awaiting approval");
  const approved = await f.quotations.transitionQuotation(accountant, second.id, { action: "APPROVE", version: 2 });
  assert.equal(approved.status, "APPROVED");
  assert.ok(approved.decidedAt);
  assert.equal(job(f).status, "APPROVED");
  await assert.rejects(f.quotations.transitionQuotation(owner, second.id, { action: "EXPIRE", version: 3 }), f.qErrors.QuotationStateError);
  await assert.rejects(f.quotations.transitionQuotation(owner, second.id, { action: "APPROVE", version: 2 }), f.qErrors.QuotationConflictError);
  const unlinked = await quote(f);
  await f.quotations.transitionQuotation(owner, unlinked.id, { action: "SEND", version: 1 });
  const expired = await f.quotations.transitionQuotation(owner, unlinked.id, { action: "EXPIRE", version: 2 });
  assert.equal(expired.status, "EXPIRED");
  same((await f.quotations.listQuotationsForJob(dispatcher, "job-a")).map((row) => row.status).sort(), ["APPROVED", "REJECTED"], "dispatchers can see a job's quotations");
});

test("approved quotations convert once into a draft invoice that keeps the lines", async () => {
  const f = fixture({ jobStatus: "WAITING_APPROVAL" });
  const quotation = await quote(f, { jobId: "job-a" });
  await assert.rejects(f.invoices.createInvoiceFromQuotation(accountant, quotation.id, { version: 1, requestId: randomUUID() }), f.qErrors.QuotationStateError, "drafts cannot be converted");
  await f.quotations.transitionQuotation(owner, quotation.id, { action: "SEND", version: 1 });
  await f.quotations.transitionQuotation(owner, quotation.id, { action: "APPROVE", version: 2 });
  await assert.rejects(f.invoices.createInvoiceFromQuotation(manager, quotation.id, { version: 3, requestId: randomUUID() }), f.iErrors.InvoiceAccessError, "managers do not manage invoices");
  const requestId = randomUUID();
  const invoice = await f.invoices.createInvoiceFromQuotation(accountant, quotation.id, { version: 3, requestId });
  assert.equal(invoice.invoiceNumber, "INV-000001");
  assert.equal(invoice.status, "DRAFT");
  assert.equal(invoice.quotationNumber, "QUO-000001");
  assert.equal(invoice.jobNumber, "JOB-000007");
  assert.equal(invoice.total, 287);
  assert.equal(invoice.balanceDue, 287);
  assert.equal(invoice.dueAt, null, "due date is set when the invoice is issued");
  const replay = await f.invoices.createInvoiceFromQuotation(accountant, quotation.id, { version: 3, requestId });
  assert.equal(replay.id, invoice.id);
  const converted = await f.quotations.readQuotation(owner, quotation.id);
  assert.equal(converted.invoiceId, invoice.id);
  assert.equal(converted.invoiceNumber, "INV-000001");
  assert.equal(converted.version, 4);
  await assert.rejects(f.invoices.createInvoiceFromQuotation(accountant, quotation.id, { version: 4, requestId: randomUUID() }), (error) => error instanceof f.qErrors.QuotationRuleError && error.rule === "ALREADY_CONVERTED");
  assert.equal(f.db.values("invoices").length, 1);
  assert.equal(f.db.values("auditLogs").filter((row) => row.data.action === "QUOTATION_CONVERTED").length, 1);
});

test("issuing an invoice needs a completed job, deducts tracked stock, and sets the due date", async () => {
  const f = fixture({ jobStatus: "APPROVED" });
  const invoiceLines = [
    { productId: "pipe", description: "Copper pipe", quantity: 4, unitPrice: 4.5, taxRatePercent: 18 },
    { productId: "labour", description: "Labour", quantity: 1.5, unitPrice: 60, taxRatePercent: 0 },
  ];
  const invoice = await f.invoices.createInvoice(accountant, { customerId: "cust-a", jobId: "job-a", title: "Boiler repair", notes: "", dueAt: null, lineItems: invoiceLines, requestId: randomUUID() });
  assert.equal(invoice.invoiceNumber, "INV-000001");
  assert.equal(invoice.total, 111.24);
  await assert.rejects(f.invoices.transitionInvoice(accountant, invoice.id, { action: "ISSUE", version: 1 }), (error) => error instanceof f.iErrors.InvoiceRuleError && error.rule === "JOB_NOT_COMPLETED");
  assert.equal(product(f, "pipe").quantityOnHand, 10, "a failed issue never touches stock");
  f.db.seed("jobs/job-a", { ...job(f), status: "COMPLETED", completedAt: T.now() });
  const tooMany = await f.invoices.createInvoice(accountant, { customerId: "cust-a", jobId: null, title: "Big order", notes: "", dueAt: null, lineItems: [{ productId: "pipe", description: "Pipe", quantity: 11, unitPrice: 4.5, taxRatePercent: 0 }], requestId: randomUUID() });
  await assert.rejects(f.invoices.transitionInvoice(accountant, tooMany.id, { action: "ISSUE", version: 1 }), (error) => error instanceof f.stockErrors.StockRuleError && error.rule === "INSUFFICIENT_STOCK" && error.productName === "Copper pipe");
  const fractional = await f.invoices.createInvoice(accountant, { customerId: "cust-a", jobId: null, title: "Half metre", notes: "", dueAt: null, lineItems: [{ productId: "pipe", description: "Pipe", quantity: 0.5, unitPrice: 4.5, taxRatePercent: 0 }], requestId: randomUUID() });
  await assert.rejects(f.invoices.transitionInvoice(accountant, fractional.id, { action: "ISSUE", version: 1 }), (error) => error instanceof f.stockErrors.StockRuleError && error.rule === "FRACTIONAL_QUANTITY");
  const issued = await f.invoices.transitionInvoice(accountant, invoice.id, { action: "ISSUE", version: 1 });
  assert.equal(issued.status, "ISSUED");
  assert.equal(issued.dueAt, "2026-10-13", "today in Asia/Kolkata plus 14 days");
  assert.ok(issued.issuedAt);
  assert.equal(job(f).status, "INVOICED");
  assert.equal(product(f, "pipe").quantityOnHand, 6);
  assert.equal(product(f, "pipe").version, 2);
  assert.equal(product(f, "labour").quantityOnHand, 0, "untracked products are untouched");
  const movements = f.db.values("stockMovements").map((row) => row.data);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].source, "INVOICE_ISSUED");
  assert.equal(movements[0].reference, "INV-000001");
  assert.equal(movements[0].quantityDelta, -4);
  same(f.db.records.get(`invoices/${invoice.id}`).stockConsumed, [{ productId: "pipe", quantity: 4 }]);
  await assert.rejects(f.invoices.transitionInvoice(accountant, invoice.id, { action: "ISSUE", version: 2 }), f.iErrors.InvoiceStateError);
  await assert.rejects(f.invoices.updateInvoice(accountant, invoice.id, { customerId: "cust-a", jobId: "job-a", title: "Changed", notes: "", dueAt: null, lineItems: invoiceLines, version: 2 }), f.iErrors.InvoiceStateError, "issued invoices are locked");
  const voided = await f.invoices.transitionInvoice(accountant, invoice.id, { action: "VOID", version: 2, note: "Wrong customer PO" });
  assert.equal(voided.status, "VOID");
  assert.equal(voided.balanceDue, 0);
  assert.equal(product(f, "pipe").quantityOnHand, 10, "voiding returns the stock");
  assert.equal(f.db.values("stockMovements").filter((row) => row.data.source === "INVOICE_VOIDED").length, 1);
  assert.equal(job(f).status, "INVOICED", "voiding does not rewind the job");
  const reissue = await f.invoices.createInvoice(accountant, { customerId: "cust-a", jobId: "job-a", title: "Boiler repair", notes: "", dueAt: "2026-12-01", lineItems: invoiceLines, requestId: randomUUID() });
  const reissued = await f.invoices.transitionInvoice(accountant, reissue.id, { action: "ISSUE", version: 1 });
  assert.equal(reissued.dueAt, "2026-12-01", "an explicit due date is kept");
  assert.equal(reissued.invoiceNumber, "INV-000004");
  assert.equal(job(f).status, "INVOICED", "an already invoiced job accepts another invoice");
});

test("payments settle invoices and move the job to partially paid, then paid", async () => {
  const f = fixture({ jobStatus: "COMPLETED" });
  const invoice = await f.invoices.createInvoice(accountant, { customerId: "cust-a", jobId: "job-a", title: "Boiler repair", notes: "", dueAt: null, lineItems: lines, requestId: randomUUID() });
  const pay = (amount, session = accountant, extra = {}) => f.payments.recordPayment(session, { invoiceId: invoice.id, amount, method: "UPI", paidAt: "2026-09-29T10:00:00.000Z", reference: "", notes: "", requestId: randomUUID(), ...extra });
  await assert.rejects(pay(100), (error) => error instanceof f.pErrors.PaymentRuleError && error.rule === "INVOICE_NOT_OPEN", "drafts cannot take payments");
  await f.invoices.transitionInvoice(accountant, invoice.id, { action: "ISSUE", version: 1 });
  await assert.rejects(pay(300), (error) => error instanceof f.pErrors.PaymentRuleError && error.rule === "EXCEEDS_BALANCE");
  await assert.rejects(pay(100, dispatcher), f.pErrors.PaymentAccessError);
  await assert.rejects(pay(100, manager), f.pErrors.PaymentAccessError, "managers do not record payments");
  const requestId = randomUUID();
  const partial = await pay(87, accountant, { requestId, reference: "UPI-1" });
  assert.equal(partial.invoice.status, "PARTIALLY_PAID");
  assert.equal(partial.invoice.amountPaid, 87);
  assert.equal(partial.invoice.balanceDue, 200);
  assert.equal(partial.payment.currency, "INR");
  assert.equal(job(f).status, "PARTIAL");
  const replay = await pay(87, accountant, { requestId, reference: "UPI-1" });
  assert.equal(replay.payment.id, partial.payment.id);
  assert.equal(f.db.values("payments").length, 1, "replays do not double count");
  await assert.rejects(pay(87, accountant, { requestId, reference: "UPI-2" }), f.pErrors.PaymentConflictError);
  await assert.rejects(f.invoices.transitionInvoice(accountant, invoice.id, { action: "VOID", version: 3 }), (error) => error instanceof f.iErrors.InvoiceRuleError && error.rule === "HAS_PAYMENTS");
  const final = await pay(200, owner, { method: "CASH" });
  assert.equal(final.invoice.status, "PAID");
  assert.equal(final.invoice.balanceDue, 0);
  assert.ok(final.invoice.paidAt);
  assert.equal(job(f).status, "PAID");
  await assert.rejects(pay(1), (error) => error instanceof f.pErrors.PaymentRuleError && error.rule === "INVOICE_NOT_OPEN");
  const ledger = await f.payments.listPayments(accountant, {});
  assert.equal(ledger.payments.length, 2);
  same((await f.payments.listPayments(accountant, { method: "CASH" })).payments.map((row) => row.amount), [200]);
  same((await f.payments.listPaymentsForInvoice(owner, invoice.id)).map((row) => row.method).sort(), ["CASH", "UPI"]);
  const audits = f.db.values("auditLogs").map((row) => row.data.action);
  assert.equal(audits.filter((action) => action === "PAYMENT_RECORDED").length, 2);
  assert.equal(audits.filter((action) => action === "INVOICE_PAYMENT_APPLIED").length, 2);
  const stored = await f.invoices.readInvoice(dispatcher, invoice.id);
  assert.equal(stored.amountPaid, 287, "dispatchers can read invoice state for the job page");
  await assert.rejects(f.invoices.listInvoices(dispatcher, {}), f.iErrors.InvoiceAccessError);
});

let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}`); console.error(error); }
}
if (failed) { console.error(`Billing checks failed: ${failed}/${tests.length}.`); process.exit(1); }
console.log(`Billing checks passed: ${tests.length}/${tests.length}.`);
