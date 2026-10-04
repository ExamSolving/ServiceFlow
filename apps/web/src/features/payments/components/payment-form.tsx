"use client";

import { LoaderCircle, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paymentMethodOptions } from "@/src/features/billing/components/billing-format";
import { billingIdSchema } from "@/src/features/billing/schemas/billing.schema";
import { isoToZonedWallTime, zonedWallTimeToIso } from "@/src/lib/dates/zoned";
import { formatMoney } from "@/src/lib/billing/money";
import { paymentCreateSchema } from "../schemas/payment.schema";
import type { PaymentMethod } from "../types/payment";

const resultSchema = z.object({ payment: z.object({ id: billingIdSchema }).loose(), invoice: z.object({ id: billingIdSchema, balanceDue: z.number(), status: z.string() }).loose() });
const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Record a payment against an open invoice from its detail page. */
export function PaymentForm({ invoice, timezone }: { invoice: { id: string; balanceDue: number; currency: string; status: string }; timezone: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(invoice.balanceDue));
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paidAt, setPaidAt] = useState(() => isoToZonedWallTime(new Date().toISOString(), timezone));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ message: string; session?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  if (invoice.status !== "ISSUED" && invoice.status !== "PARTIALLY_PAID") return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || done) return;
    setNotice(null);
    const paidAtIso = paidAt ? zonedWallTimeToIso(paidAt, timezone) : null;
    const parsed = paymentCreateSchema.safeParse({ invoiceId: invoice.id, amount: amount.trim() === "" ? NaN : Number(amount), method, paidAt: paidAtIso ?? "", reference, notes, requestId: crypto.randomUUID() });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors(Object.fromEntries(Object.entries(flat).map(([key, value]) => [key, key === "paidAt" ? "Enter a valid date and time." : value?.[0] ?? "Check this field."])));
      return;
    }
    if (parsed.data.amount > invoice.balanceDue) { setFieldErrors({ amount: `Enter up to ${formatMoney(invoice.balanceDue, invoice.currency)}.` }); return; }
    setFieldErrors({});
    setSaving(true);
    try {
      const response = await fetch("/api/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (response.redirected || response.status === 401) { setNotice({ session: true, message: "Your session expired. Sign in in another tab, then try again." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null;
        setNotice({ message: response.status === 409 && message ? message : response.status === 403 ? "You don’t have permission to record payments." : response.status === 400 ? "Check the amount and date, then try again." : "We couldn’t record this payment. Please try again." });
        return;
      }
      if (!resultSchema.safeParse(body).success) { setNotice({ message: "We couldn’t confirm the payment. Refresh to check the invoice." }); return; }
      setDone(true);
      router.refresh();
    } catch {
      setNotice({ message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally { setSaving(false); }
  }

  const busy = saving || done;
  return (
    <form noValidate onSubmit={(event) => void submit(event)} aria-busy={busy} className="space-y-4">
      {notice && <Alert variant="destructive"><AlertTitle>Payment wasn’t recorded</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.session && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}</AlertDescription></Alert>}
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Payment details</legend>
        <div className="space-y-2">
          <Label htmlFor="payment-amount">Amount ({invoice.currency}) <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
          <Input id="payment-amount" type="number" inputMode="decimal" min={0.01} max={invoice.balanceDue} step={0.01} value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? "payment-amount-error" : "payment-amount-hint"} />
          {fieldErrors.amount ? <p id="payment-amount-error" role="alert" className="text-xs text-destructive">{fieldErrors.amount}</p> : <p id="payment-amount-hint" className="text-xs leading-5 text-muted-foreground">Balance due: {formatMoney(invoice.balanceDue, invoice.currency)}.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-method">Method</Label>
          <select id="payment-method" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} className={selectStyle}>
            {paymentMethodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-paidAt">Received on <span className="font-normal text-muted-foreground">({timezone})</span></Label>
          <Input id="payment-paidAt" type="datetime-local" step={60} value={paidAt} onChange={(event) => setPaidAt(event.target.value)} aria-invalid={Boolean(fieldErrors.paidAt)} />
          {fieldErrors.paidAt && <p role="alert" className="text-xs text-destructive">{fieldErrors.paidAt}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-reference">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="payment-reference" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transaction id, cheque number…" aria-invalid={Boolean(fieldErrors.reference)} />
          {fieldErrors.reference && <p role="alert" className="text-xs text-destructive">{fieldErrors.reference}</p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="payment-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="payment-notes" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} aria-invalid={Boolean(fieldErrors.notes)} />
          {fieldErrors.notes && <p role="alert" className="text-xs text-destructive">{fieldErrors.notes}</p>}
        </div>
      </fieldset>
      <div className="flex items-center justify-end">
        <Button type="submit" disabled={busy}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Wallet aria-hidden="true" />}{done ? "Recorded, refreshing…" : saving ? "Recording…" : "Record payment"}</Button>
      </div>
    </form>
  );
}
