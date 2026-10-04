"use client";

import { ArrowDownToLine, ArrowUpFromLine, LoaderCircle, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferencePicker } from "@/src/features/service-requests/components/reference-picker";
import { productIdSchema, productPickSchema, stockMovementSchema, type ProductPick, type StockMovementType } from "../schemas/product.schema";
import type { ProductDetail } from "../types/product";

const optionSchema = productPickSchema;
type PickedProduct = ProductPick;
const resultSchema = z.object({ movement: z.object({ id: productIdSchema }).loose(), product: z.object({ id: productIdSchema, quantityOnHand: z.number() }).loose() });
const TYPES: { value: StockMovementType; label: string; hint: string; icon: typeof Scale }[] = [
  { value: "IN", label: "Stock in", hint: "Received or returned units", icon: ArrowDownToLine },
  { value: "OUT", label: "Stock out", hint: "Used, sold or written off", icon: ArrowUpFromLine },
  { value: "ADJUST", label: "Count", hint: "Set the counted quantity", icon: Scale },
];
const textarea = "min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** Records a manual stock movement for a fixed product, or any tracked product when none is given. */
export function StockMovementForm({ product, compact = false }: { product?: Pick<ProductDetail, "id" | "name" | "unit" | "quantityOnHand" | "trackStock" | "isActive">; compact?: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<PickedProduct | null>(null);
  const [type, setType] = useState<StockMovementType>("IN");
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ message: string; session?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const productId = product?.id ?? picked?.id ?? null;
  const unit = product?.unit ?? picked?.unit ?? "units";
  const locked = product ? !product.trackStock || !product.isActive : false;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setNotice(null);
    setSaved(null);
    const parsed = stockMovementSchema.safeParse({ productId: productId ?? "", type, quantity: quantity.trim() === "" ? NaN : Number(quantity), reason, reference, requestId: crypto.randomUUID() });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors(Object.fromEntries(Object.entries(flat).map(([key, value]) => [key, value?.[0] ?? "Check this field."])));
      if (!productId) setFieldErrors((current) => ({ ...current, productId: "Choose a product." }));
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const response = await fetch("/api/stock/movements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (response.redirected || response.status === 401) { setNotice({ session: true, message: "Your session expired. Sign in in another tab, then try again." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null;
        setNotice({ message: response.status === 409 && message ? message : response.status === 403 ? "You don’t have permission to manage inventory." : response.status === 400 ? "Check the quantity and try again." : "We couldn’t record this movement. Please try again." });
        return;
      }
      const result = resultSchema.safeParse(body);
      if (!result.success) { setNotice({ message: "We couldn’t confirm the save. Refresh to check the ledger." }); return; }
      setSaved(`Recorded. ${picked?.name ?? product?.name ?? "Product"} now has ${result.data.product.quantityOnHand} ${unit} on hand.`);
      setQuantity(""); setReference(""); setReason("");
      if (!product) setPicked(null);
      router.refresh();
    } catch {
      setNotice({ message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally { setSaving(false); }
  }

  if (locked) return <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">{!product?.isActive ? "Reactivate this product to record stock movements." : "Turn on stock tracking to record movements for this product."}</p>;

  return (
    <form noValidate onSubmit={(event) => void submit(event)} aria-busy={saving} className="space-y-4">
      {notice && <Alert variant="destructive"><AlertTitle>Movement wasn’t recorded</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.session && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}</AlertDescription></Alert>}
      {saved && <p role="status" className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs leading-5 text-secondary-foreground">{saved}</p>}
      <fieldset disabled={saving} className={compact ? "space-y-4" : "grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"}>
        <legend className="sr-only">Stock movement</legend>
        <div className="space-y-4">
          {!product && <ReferencePicker kind="products" endpoint="/api/products/options" optionSchema={optionSchema} fieldId="stock-product" label="Product" noun="product" hint="Only active products appear. The movement is rejected for products that don’t track stock." selected={picked} onSelect={setPicked} disabled={saving} error={fieldErrors.productId} />}
          <div className="space-y-2">
            <p className="text-sm font-medium" id="stock-type-label">Movement type</p>
            <div role="radiogroup" aria-labelledby="stock-type-label" className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((option) => {
                const Icon = option.icon;
                const active = type === option.value;
                return <label key={option.value} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                  <input type="radio" name="stock-type" value={option.value} checked={active} onChange={() => setType(option.value)} className="sr-only" />
                  <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span><span className="block font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.hint}</span></span>
                </label>;
              })}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">{type === "ADJUST" ? `Counted quantity (${unit})` : `Quantity (${unit})`} <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
            <Input id="stock-quantity" type="number" inputMode="numeric" min={0} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={Boolean(fieldErrors.quantity)} aria-describedby={fieldErrors.quantity ? "stock-quantity-error" : "stock-quantity-hint"} />
            {fieldErrors.quantity ? <p id="stock-quantity-error" role="alert" className="text-xs text-destructive">{fieldErrors.quantity}</p> : <p id="stock-quantity-hint" className="text-xs leading-5 text-muted-foreground">{type === "ADJUST" ? "The ledger records the difference from the current count." : product ? `Currently ${product.quantityOnHand} ${unit} on hand.` : "Whole units only."}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="stock-reference" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PO number, delivery note, job…" aria-invalid={Boolean(fieldErrors.reference)} />
            {fieldErrors.reference && <p role="alert" className="text-xs text-destructive">{fieldErrors.reference}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <textarea id="stock-reason" rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className={textarea} aria-invalid={Boolean(fieldErrors.reason)} />
            {fieldErrors.reason && <p role="alert" className="text-xs text-destructive">{fieldErrors.reason}</p>}
          </div>
        </div>
      </fieldset>
      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={saving}>{saving ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{saving ? "Recording…" : "Record movement"}</Button>
      </div>
    </form>
  );
}
