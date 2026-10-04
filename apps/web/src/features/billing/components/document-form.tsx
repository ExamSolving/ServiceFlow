"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { productPickSchema, type ProductPick } from "@/src/features/products/schemas/product.schema";
import { ReferencePicker } from "@/src/features/service-requests/components/reference-picker";
import type { ServiceRequestOption } from "@/src/features/service-requests/types/service-request";
import { computeTotals, type LineItemInput } from "@/src/lib/billing/line-items";
import { formatMoney } from "@/src/lib/billing/money";
import { billingDocumentFormSchema, billingIdSchema, type BillingDocumentFormValues, type BillingDocumentSource } from "../schemas/billing.schema";

export type DocumentKind = "quotation" | "invoice";
export interface EditableDocument {
  id: string; version: number; customerId: string; customerName: string; customerNumber: string; jobId: string | null; jobNumber: string | null;
  title: string; notes: string; date: string | null; lineItems: LineItemInput[];
}
const COPY: Record<DocumentKind, { noun: string; plural: string; path: string; api: string; dateLabel: string; dateHint: (days: number) => string; description: string; responseKey: string }> = {
  quotation: { noun: "quotation", plural: "Quotations", path: "/quotations", api: "/api/quotations", dateLabel: "Valid until", dateHint: (days) => `Leave empty to use the workspace default of ${days} days from today.`, description: "Price the work before it starts. Drafts can be edited until they are sent.", responseKey: "quotation" },
  invoice: { noun: "invoice", plural: "Invoices", path: "/invoices", api: "/api/invoices", dateLabel: "Due date", dateHint: (days) => `Leave empty to set it when the invoice is issued, ${days} days after issue by default.`, description: "Bill completed work. Drafts can be edited until they are issued.", responseKey: "invoice" },
};
const textarea = "min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const cell = "h-9 min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
type Notice = { kind: "error" | "session" | "conflict" | "reference"; message: string };

const blankLine = (taxRatePercent: number): LineItemInput => ({ productId: null, description: "", quantity: 1, unitPrice: 0, taxRatePercent });

export function DocumentForm({ kind, document, source, currency, defaultTaxRatePercent, defaultDays }: {
  kind: DocumentKind; document?: EditableDocument; source?: BillingDocumentSource; currency: string; defaultTaxRatePercent: number; defaultDays: number;
}) {
  const copy = COPY[kind];
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const pinnedCustomer = source ? { id: source.customerId, name: source.customerName, secondary: source.customerNumber } : document?.jobId ? { id: document.customerId, name: document.customerName, secondary: document.customerNumber } : null;
  const [customer, setCustomer] = useState<ServiceRequestOption | null>(pinnedCustomer ?? (document ? { id: document.customerId, name: document.customerName, secondary: document.customerNumber } : null));
  const responseSchema = useMemo(() => z.object({ [copy.responseKey]: z.object({ id: billingIdSchema, version: z.number().int().positive() }).loose() }), [copy.responseKey]);
  const form = useForm<BillingDocumentFormValues>({
    resolver: zodResolver(billingDocumentFormSchema),
    defaultValues: document
      ? { customerId: document.customerId, jobId: document.jobId, title: document.title, notes: document.notes, date: document.date, lineItems: document.lineItems.map((item) => ({ productId: item.productId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, taxRatePercent: item.taxRatePercent })) }
      : { customerId: source?.customerId ?? "", jobId: source?.jobId ?? null, title: source?.title ?? "", notes: "", date: null, lineItems: [blankLine(defaultTaxRatePercent)] },
    mode: "onBlur",
  });
  const lines = useFieldArray({ control: form.control, name: "lineItems" });
  const watched = useWatch({ control: form.control, name: "lineItems" });
  const { errors, isDirty, isSubmitting } = form.formState;
  const busy = saving || saved || isSubmitting;
  const detailPath = document ? `${copy.path}/${encodeURIComponent(document.id)}` : copy.path;
  const totals = useMemo(() => {
    const valid = (watched ?? []).filter((item): item is LineItemInput => Boolean(item) && Number.isFinite(item.quantity) && Number.isFinite(item.unitPrice) && Number.isFinite(item.taxRatePercent) && item.quantity > 0 && item.unitPrice >= 0 && item.taxRatePercent >= 0);
    return computeTotals(valid);
  }, [watched]);

  useEffect(() => {
    if (!isDirty || saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, saved]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  function chooseCustomer(option: ServiceRequestOption | null) {
    setCustomer(option);
    form.setValue("customerId", option?.id ?? "", { shouldDirty: true, shouldValidate: Boolean(option) });
  }
  function addFromCatalog(product: ProductPick | null) {
    if (!product) return;
    const taxRate = product.taxRatePercent ?? defaultTaxRatePercent;
    const first = lines.fields.length === 1 ? form.getValues("lineItems.0") : null;
    const row = { productId: product.id, description: product.name, quantity: 1, unitPrice: product.unitPrice, taxRatePercent: taxRate };
    if (first && !first.description && !first.unitPrice && !first.productId) lines.update(0, row); else lines.append(row);
  }

  async function onSubmit(values: BillingDocumentFormValues) {
    if (saving || saved) return;
    setSaving(true);
    setNotice(null);
    try {
      const nextRequestId = requestId ?? crypto.randomUUID();
      if (!document && !requestId) setRequestId(nextRequestId);
      const { date, ...rest } = values;
      const payload = { ...rest, [kind === "quotation" ? "validUntil" : "dueAt"]: date };
      const response = await fetch(document ? `${copy.api}/${encodeURIComponent(document.id)}` : copy.api, {
        method: document ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(document ? { ...payload, version: document.version } : { ...payload, requestId: nextRequestId }),
      });
      if (response.redirected || response.status === 401) { setNotice({ kind: "session", message: "Your session has expired. Sign in again in another tab, then return here to save. Your entries are still here." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body ? body.code : undefined;
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null;
        if (response.status === 409 && code === "INVALID_REFERENCE") { setNotice({ kind: "reference", message: message ?? "Check the customer and linked job, then try again." }); return; }
        if (response.status === 409 && code === "STATE") { setNotice({ kind: "conflict", message: `This ${copy.noun} can no longer be edited. Open the latest version to review it.` }); return; }
        if (response.status === 409) { setNotice({ kind: "conflict", message: document ? `This ${copy.noun} has changed since you opened the form. Open the latest version in a new tab to compare. Your entries are still here.` : `An earlier save may already have created this ${copy.noun}. Check the list before trying again. Your entries are still here.` }); return; }
        if (body && typeof body === "object" && "fieldErrors" in body && body.fieldErrors && typeof body.fieldErrors === "object") {
          for (const name of ["customerId", "title", "notes", "lineItems"] as const) {
            const messages = (body.fieldErrors as Record<string, unknown>)[name];
            if (Array.isArray(messages) && typeof messages[0] === "string") form.setError(name, { type: "server", message: messages[0] });
          }
          const dateMessages = (body.fieldErrors as Record<string, unknown>)[kind === "quotation" ? "validUntil" : "dueAt"];
          if (Array.isArray(dateMessages) && typeof dateMessages[0] === "string") form.setError("date", { type: "server", message: dateMessages[0] });
        }
        setNotice({ kind: "error", message: response.status === 400 ? "Check the highlighted fields and try again." : response.status === 403 ? `You don’t have permission to manage ${copy.plural.toLowerCase()}. Contact your workspace owner.` : response.status === 404 ? `This ${copy.noun} is no longer available in your workspace. Your entries are still here.` : `We couldn’t save this ${copy.noun}. Please try again. Your entries are still here.` });
        return;
      }
      const parsed = responseSchema.safeParse(body);
      const result = parsed.success ? (parsed.data as Record<string, { id: string }>)[copy.responseKey] : null;
      if (!result || (document && result.id !== document.id)) { setNotice({ kind: "error", message: "We couldn’t confirm the save. Try again. Your entries are still here." }); return; }
      setSaved(true);
      router.replace(`${copy.path}/${encodeURIComponent(result.id)}`);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again. Your entries are still here." });
    } finally { setSaving(false); }
  }

  const lineErrors = Array.isArray(errors.lineItems) ? errors.lineItems : [];
  const lineItemsError = errors.lineItems as { message?: string; root?: { message?: string } } | undefined;
  const lineRootError = Array.isArray(lineItemsError) ? undefined : lineItemsError?.message ?? lineItemsError?.root?.message;
  const Title = document ? `Edit ${copy.noun}` : `New ${copy.noun}`;

  return <>
    <PageHeader title={Title} description={copy.description}
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: copy.plural, href: copy.path }, { label: Title }]} />
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-busy={busy} className="space-y-5">
      {notice && <div ref={noticeRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{notice.kind === "session" ? "Sign in to continue" : notice.kind === "conflict" ? "Review before saving" : notice.kind === "reference" ? "Check the references" : `${copy.plural.slice(0, -1)} wasn’t saved`}</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.kind === "session" && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.kind === "conflict" && <Link href={detailPath} target="_blank" rel="noopener noreferrer">Open the latest version in a new tab</Link>}</AlertDescription></Alert></div>}
      <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <legend className="sr-only">{copy.noun} details</legend>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="border-b border-border"><SectionHeading title="Customer & summary" description={source || document?.jobId ? "The customer comes from the linked job." : "Pick the customer this document is addressed to."} /></CardHeader>
            <CardContent className="space-y-5">
              {pinnedCustomer ? (
                <dl className="grid gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Customer</dt><dd className="mt-1 font-medium break-words">{pinnedCustomer.name}<span className="block text-xs font-normal text-muted-foreground">{pinnedCustomer.secondary}</span></dd></div>
                  <div><dt className="text-xs text-muted-foreground">Linked job</dt><dd className="mt-1 font-medium"><Link href={`/jobs/${encodeURIComponent(source?.jobId ?? document?.jobId ?? "")}`} className="hover:text-primary">{source?.jobNumber ?? document?.jobNumber}</Link></dd></div>
                </dl>
              ) : (
                <ReferencePicker kind="customers" endpoint="/api/billing/options" fieldId={`${kind}-customer`} label="Customer" noun="customer" hint="Only active customers can be billed." selected={customer} onSelect={chooseCustomer} disabled={busy} error={errors.customerId?.message} />
              )}
              <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor={`${kind}-title`}>Title <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                  <Input id={`${kind}-title`} maxLength={120} required aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? `${kind}-title-error` : `${kind}-title-hint`} {...form.register("title")} />
                  {errors.title ? <p id={`${kind}-title-error`} role="alert" className="text-xs leading-5 text-destructive">{errors.title.message}</p> : <p id={`${kind}-title-hint`} className="text-xs leading-5 text-muted-foreground">Shown to your team and on the document, for example “Boiler replacement”.</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${kind}-date`}>{copy.dateLabel}</Label>
                  <Input id={`${kind}-date`} type="date" aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? `${kind}-date-error` : `${kind}-date-hint`} {...form.register("date", { setValueAs: (value: unknown) => (value === "" || value === null || value === undefined ? null : String(value)) })} />
                  {errors.date ? <p id={`${kind}-date-error`} role="alert" className="text-xs leading-5 text-destructive">{errors.date.message}</p> : <p id={`${kind}-date-hint`} className="text-xs leading-5 text-muted-foreground">{copy.dateHint(defaultDays)}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${kind}-notes`}>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <textarea id={`${kind}-notes`} rows={3} maxLength={1000} className={textarea} aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? `${kind}-notes-error` : `${kind}-notes-hint`} {...form.register("notes")} />
                {errors.notes ? <p id={`${kind}-notes-error`} role="alert" className="text-xs leading-5 text-destructive">{errors.notes.message}</p> : <p id={`${kind}-notes-hint`} className="text-xs leading-5 text-muted-foreground">Terms, scope or payment details. Up to 1,000 characters.</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <div className="border-b border-border p-4 sm:p-5"><SectionHeading title="Line items" description="Amounts are before tax. Totals update as you type." /></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Editable line items</caption>
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr><th scope="col" className="px-4 py-3 font-medium">Description</th><th scope="col" className="w-24 px-2 py-3 font-medium">Qty</th><th scope="col" className="w-32 px-2 py-3 font-medium">Unit price</th><th scope="col" className="w-24 px-2 py-3 font-medium">Tax %</th><th scope="col" className="w-28 px-2 py-3 text-right font-medium">Amount</th><th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Remove</span></th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.fields.map((field, index) => {
                    const rowErrors = lineErrors[index];
                    const current = watched?.[index];
                    const amount = current && Number.isFinite(current.quantity) && Number.isFinite(current.unitPrice) ? computeTotals([{ ...current, taxRatePercent: Number.isFinite(current.taxRatePercent) ? current.taxRatePercent : 0 }]).subtotal : 0;
                    return (
                      <tr key={field.id} className="align-top">
                        <td className="px-4 py-2">
                          <label htmlFor={`${kind}-line-${index}-description`} className="sr-only">Description for line {index + 1}</label>
                          <input id={`${kind}-line-${index}-description`} maxLength={300} className={`${cell} w-full`} placeholder="Describe the work or item" aria-invalid={Boolean(rowErrors?.description)} {...form.register(`lineItems.${index}.description`)} />
                          {rowErrors?.description && <p role="alert" className="mt-1 text-xs text-destructive">{rowErrors.description.message}</p>}
                          {current?.productId && <p className="mt-1 text-xs text-muted-foreground">Catalog item</p>}
                        </td>
                        <td className="px-2 py-2"><label htmlFor={`${kind}-line-${index}-quantity`} className="sr-only">Quantity for line {index + 1}</label><input id={`${kind}-line-${index}-quantity`} type="number" inputMode="decimal" min={0} step={0.001} className={`${cell} w-full text-right`} aria-invalid={Boolean(rowErrors?.quantity)} {...form.register(`lineItems.${index}.quantity`, { valueAsNumber: true })} />{rowErrors?.quantity && <p role="alert" className="mt-1 text-xs text-destructive">{rowErrors.quantity.message}</p>}</td>
                        <td className="px-2 py-2"><label htmlFor={`${kind}-line-${index}-unitPrice`} className="sr-only">Unit price for line {index + 1}</label><input id={`${kind}-line-${index}-unitPrice`} type="number" inputMode="decimal" min={0} step={0.01} className={`${cell} w-full text-right`} aria-invalid={Boolean(rowErrors?.unitPrice)} {...form.register(`lineItems.${index}.unitPrice`, { valueAsNumber: true })} />{rowErrors?.unitPrice && <p role="alert" className="mt-1 text-xs text-destructive">{rowErrors.unitPrice.message}</p>}</td>
                        <td className="px-2 py-2"><label htmlFor={`${kind}-line-${index}-tax`} className="sr-only">Tax rate for line {index + 1}</label><input id={`${kind}-line-${index}-tax`} type="number" inputMode="decimal" min={0} max={100} step={0.01} className={`${cell} w-full text-right`} aria-invalid={Boolean(rowErrors?.taxRatePercent)} {...form.register(`lineItems.${index}.taxRatePercent`, { valueAsNumber: true })} />{rowErrors?.taxRatePercent && <p role="alert" className="mt-1 text-xs text-destructive">{rowErrors.taxRatePercent.message}</p>}</td>
                        <td className="whitespace-nowrap px-2 py-2 pt-4 text-right tabular-nums">{formatMoney(amount, currency)}</td>
                        <td className="px-2 py-2"><Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={lines.fields.length === 1} onClick={() => lines.remove(index)}><Trash2 aria-hidden="true" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border">
                  <tr><th scope="row" colSpan={4} className="px-4 py-2 text-right font-normal text-muted-foreground">Subtotal</th><td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatMoney(totals.subtotal, currency)}</td><td /></tr>
                  <tr><th scope="row" colSpan={4} className="px-4 py-2 text-right font-normal text-muted-foreground">Tax</th><td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatMoney(totals.taxTotal, currency)}</td><td /></tr>
                  <tr className="border-t border-border"><th scope="row" colSpan={4} className="px-4 py-3 text-right font-semibold">Total</th><td className="whitespace-nowrap px-2 py-3 text-right font-heading text-base font-semibold tabular-nums">{formatMoney(totals.total, currency)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
            {lineRootError && <p role="alert" className="px-4 pt-3 text-xs text-destructive sm:px-5">{lineRootError}</p>}
            <div className="grid gap-4 border-t border-border p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <ReferencePicker kind="products" endpoint="/api/products/options" optionSchema={productPickSchema} fieldId={`${kind}-catalog`} label="Add from catalog" noun="product" hint="Choosing a product adds a line with its price and tax rate." selected={null} onSelect={addFromCatalog} disabled={busy} required={false} />
              <Button type="button" variant="outline" className="lg:mt-7" disabled={lines.fields.length >= 100} onClick={() => lines.append(blankLine(defaultTaxRatePercent))}><Plus aria-hidden="true" />Add custom line</Button>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Summary" description={`Amounts in ${currency}.`} /></CardHeader>
          <CardContent className="space-y-5">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Lines</dt><dd className="tabular-nums">{lines.fields.length}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatMoney(totals.subtotal, currency)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{formatMoney(totals.taxTotal, currency)}</dd></div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3"><dt className="font-semibold">Total</dt><dd className="font-heading text-lg font-semibold tabular-nums">{formatMoney(totals.total, currency)}</dd></div>
            </dl>
            <p className="text-xs leading-5 text-muted-foreground">{kind === "quotation" ? "Sending a quotation locks its lines. Approving it moves a linked job to Approved." : "Issuing an invoice locks its lines, deducts tracked stock and marks a linked job as Invoiced."}</p>
          </CardContent>
        </Card>
      </fieldset>
      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-xs leading-5 text-muted-foreground">{saved ? `${copy.plural.slice(0, -1)} saved. Opening it…` : busy ? "Saving…" : isDirty ? "You have unsaved changes." : document ? `This ${copy.noun} is up to date.` : `Drafts are visible to everyone who manages ${copy.plural.toLowerCase()}.`}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {busy ? <Button type="button" variant="outline" disabled>Cancel</Button> : <Link href={source ? `/jobs/${encodeURIComponent(source.jobId)}` : detailPath} className={buttonVariants({ variant: "outline" })}>Cancel</Link>}
          <Button type="submit" disabled={busy || Boolean(document && !isDirty)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{saved ? "Opening…" : busy ? "Saving…" : document ? "Save changes" : `Create ${copy.noun}`}</Button>
        </div>
      </div>
    </form>
  </>;
}
