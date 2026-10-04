"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { productFormSchema, productIdSchema } from "../schemas/product.schema";
import type { ProductDetail, ProductFormValues } from "../types/product";

const fields = ["name", "sku", "description", "unit", "unitPrice", "taxRatePercent", "trackStock", "reorderLevel", "isActive"] as const;
const responseSchema = z.object({ product: z.object({ id: productIdSchema, version: z.number().int().positive() }).loose() });
type Notice = { kind: "error" | "session" | "conflict"; message: string };
const textarea = "min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const checkbox = "mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ProductForm({ product, currency, defaultTaxRatePercent }: { product?: ProductDetail; currency: string; defaultTaxRatePercent: number }) {
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [useDefaultTax, setUseDefaultTax] = useState(product ? product.taxRatePercent === null : true);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product
      ? { name: product.name, sku: product.sku, description: product.description, unit: product.unit, unitPrice: product.unitPrice, taxRatePercent: product.taxRatePercent, trackStock: product.trackStock, reorderLevel: product.reorderLevel, isActive: product.isActive }
      : { name: "", sku: "", description: "", unit: "pc", unitPrice: 0, taxRatePercent: null, trackStock: true, reorderLevel: 0, isActive: true },
    mode: "onBlur",
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const trackStock = useWatch({ control: form.control, name: "trackStock" });
  const busy = saving || saved || isSubmitting;
  const detailPath = product ? `/inventory/products/${encodeURIComponent(product.id)}` : "/inventory/products";

  useEffect(() => {
    if (!isDirty || saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, saved]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  async function onSubmit(values: ProductFormValues) {
    if (saving || saved) return;
    setSaving(true);
    setNotice(null);
    try {
      const nextRequestId = requestId ?? crypto.randomUUID();
      if (!product && !requestId) setRequestId(nextRequestId);
      const payload = { ...values, taxRatePercent: useDefaultTax ? null : values.taxRatePercent };
      const response = await fetch(product ? `/api/products/${encodeURIComponent(product.id)}` : "/api/products", {
        method: product ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(product ? { ...payload, version: product.version } : { ...payload, requestId: nextRequestId }),
      });
      if (response.redirected || response.status === 401) { setNotice({ kind: "session", message: "Your session has expired. Sign in again in another tab, then return here to save. Your entries are still here." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body ? body.code : undefined;
        if (response.status === 409 && code === "DUPLICATE_SKU") {
          form.setError("sku", { type: "server", message: "This SKU is already used in your workspace, including inactive products." });
          setNotice({ kind: "error", message: "Choose another SKU or edit the existing product. Your entries are still here." });
          return;
        }
        if (response.status === 409) {
          setNotice({ kind: "conflict", message: product ? "This product has changed since you opened the form. Open the latest version in a new tab to compare. Your entries are still here." : "An earlier save may already have created this product. Check the catalog before trying again. Your entries are still here." });
          return;
        }
        if (body && typeof body === "object" && "fieldErrors" in body && body.fieldErrors && typeof body.fieldErrors === "object") {
          for (const name of fields) {
            const messages = (body.fieldErrors as Record<string, unknown>)[name];
            if (Array.isArray(messages) && typeof messages[0] === "string") form.setError(name, { type: "server", message: messages[0] });
          }
        }
        setNotice({ kind: "error", message: response.status === 400 ? "Check the highlighted fields and try again." : response.status === 403 ? "You don’t have permission to manage inventory. Contact your workspace owner." : response.status === 404 ? "This product is no longer available in your workspace. Your entries are still here." : "We couldn’t save this product. Please try again. Your entries are still here." });
        return;
      }
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success || (product && parsed.data.product.id !== product.id)) { setNotice({ kind: "error", message: "We couldn’t confirm the save. Try again. Your entries are still here." }); return; }
      setSaved(true);
      router.replace(`/inventory/products/${encodeURIComponent(parsed.data.product.id)}`);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again. Your entries are still here." });
    } finally { setSaving(false); }
  }

  const fieldError = (name: keyof ProductFormValues) => errors[name] ? <p id={`product-${name}-error`} role="alert" className="text-xs leading-5 text-destructive">{errors[name]?.message}</p> : null;
  const describe = (name: keyof ProductFormValues) => (errors[name] ? `product-${name}-error` : `product-${name}-hint`);

  return <>
    <PageHeader title={product ? "Edit product" : "Add product"} description="Catalog items are picked on quotations and invoices; tracked items also keep a stock count."
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Inventory" }, { label: "Products", href: "/inventory/products" }, { label: product ? "Edit product" : "Add product" }]} />
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-busy={busy} className="space-y-5">
      {notice && <div ref={noticeRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{notice.kind === "session" ? "Sign in to continue" : notice.kind === "conflict" ? "Review before saving" : "Product wasn’t saved"}</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.kind === "session" && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.kind === "conflict" && <Link href={product ? `${detailPath}/edit` : "/inventory/products"} target="_blank" rel="noopener noreferrer">{product ? "Open latest version in a new tab" : "Check the catalog in a new tab"}</Link>}</AlertDescription></Alert></div>}
      <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <legend className="sr-only">Product configuration</legend>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Product details" description="Use the name your team and customers recognize." /></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="product-name">Name <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                <Input id="product-name" maxLength={120} required aria-invalid={Boolean(errors.name)} aria-describedby={describe("name")} {...form.register("name")} />
                {fieldError("name") || <p id="product-name-hint" className="text-xs leading-5 text-muted-foreground">For example, Copper pipe 15 mm or Diagnostic visit.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-sku">SKU <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                <Input id="product-sku" maxLength={40} required autoCapitalize="characters" className="font-mono uppercase" aria-invalid={Boolean(errors.sku)} aria-describedby={describe("sku")} {...form.register("sku")} />
                {fieldError("sku") || <p id="product-sku-hint" className="text-xs leading-5 text-muted-foreground">Unique code, such as PIPE-CU-15. Saved in upper case.</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <textarea id="product-description" rows={4} maxLength={500} className={textarea} aria-invalid={Boolean(errors.description)} aria-describedby={describe("description")} {...form.register("description")} />
              {fieldError("description") || <p id="product-description-hint" className="text-xs leading-5 text-muted-foreground">Shown to your team when picking line items. Up to 500 characters.</p>}
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="product-unit">Unit <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                <Input id="product-unit" maxLength={16} required aria-invalid={Boolean(errors.unit)} aria-describedby={describe("unit")} {...form.register("unit")} />
                {fieldError("unit") || <p id="product-unit-hint" className="text-xs leading-5 text-muted-foreground">pc, hr, m, kg, set…</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-unitPrice">Unit price ({currency}) <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                <Input id="product-unitPrice" type="number" inputMode="decimal" min={0} step={0.01} required aria-invalid={Boolean(errors.unitPrice)} aria-describedby={describe("unitPrice")} {...form.register("unitPrice", { valueAsNumber: true })} />
                {fieldError("unitPrice") || <p id="product-unitPrice-hint" className="text-xs leading-5 text-muted-foreground">Before tax. Line items can override it.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-taxRatePercent">Tax rate (%)</Label>
                <Input id="product-taxRatePercent" type="number" inputMode="decimal" min={0} max={100} step={0.01} disabled={useDefaultTax} placeholder={useDefaultTax ? String(defaultTaxRatePercent) : undefined} aria-invalid={Boolean(errors.taxRatePercent)} aria-describedby={describe("taxRatePercent")}
                  {...form.register("taxRatePercent", { setValueAs: (value: unknown) => (value === "" || value === null || value === undefined ? null : Number(value)) })} />
                {fieldError("taxRatePercent") || <p id="product-taxRatePercent-hint" className="text-xs leading-5 text-muted-foreground">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" className="size-3.5 accent-primary" checked={useDefaultTax} onChange={(event) => { setUseDefaultTax(event.target.checked); if (event.target.checked) form.setValue("taxRatePercent", null, { shouldDirty: true, shouldValidate: true }); }} />Use workspace default ({defaultTaxRatePercent}%)</label>
                </p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Stock & availability" description="Tracked items are deducted when invoices are issued." /></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3">
              <input id="product-trackStock" type="checkbox" className={checkbox} aria-describedby={describe("trackStock")} {...form.register("trackStock")} />
              <div className="space-y-2"><Label htmlFor="product-trackStock">Track stock</Label><p id="product-trackStock-hint" className="text-xs leading-5 text-muted-foreground">Keep a quantity on hand. Turn off for services and labour.</p>{fieldError("trackStock")}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-reorderLevel">Reorder level</Label>
              <Input id="product-reorderLevel" type="number" inputMode="numeric" min={0} step={1} disabled={!trackStock} aria-invalid={Boolean(errors.reorderLevel)} aria-describedby={describe("reorderLevel")} {...form.register("reorderLevel", { valueAsNumber: true })} />
              {fieldError("reorderLevel") || <p id="product-reorderLevel-hint" className="text-xs leading-5 text-muted-foreground">Flag the product as low stock at or below this quantity.</p>}
            </div>
            {product?.trackStock && <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">On hand: <span className="font-medium text-foreground">{product.quantityOnHand} {product.unit}</span>. Change it from the stock ledger, not here.</p>}
            <div className="flex items-start gap-3 border-t border-border pt-5">
              <input id="product-isActive" type="checkbox" className={checkbox} aria-describedby={describe("isActive")} {...form.register("isActive")} />
              <div className="space-y-2"><Label htmlFor="product-isActive">Active product</Label><p id="product-isActive-hint" className="text-xs leading-5 text-muted-foreground">Inactive products stay on existing documents but can’t be picked for new ones.</p>{fieldError("isActive")}</div>
            </div>
          </CardContent>
        </Card>
      </fieldset>
      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-xs leading-5 text-muted-foreground">{saved ? "Product saved. Opening its record…" : busy ? "Saving product…" : isDirty ? "You have unsaved changes." : product ? "This product is up to date." : "Products are shared across your workspace."}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {busy ? <Button type="button" variant="outline" disabled>Cancel</Button> : <Link href={detailPath} className={buttonVariants({ variant: "outline" })}>Cancel</Link>}
          <Button type="submit" disabled={busy || Boolean(product && !isDirty)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{saved ? "Opening product…" : busy ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
        </div>
      </div>
    </form>
  </>;
}
