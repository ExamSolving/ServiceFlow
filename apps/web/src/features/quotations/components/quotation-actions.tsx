"use client";

import { Check, FileOutput, LoaderCircle, Send, TimerOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { billingIdSchema } from "@/src/features/billing/schemas/billing.schema";
import { quotationDetailSchema, type QuotationActionInput } from "../schemas/quotation.schema";
import type { QuotationDetail } from "../types/quotation";

const resultSchema = z.object({ quotation: quotationDetailSchema });
const convertSchema = z.object({ invoice: z.object({ id: billingIdSchema }).loose() });
type Action = QuotationActionInput["action"];
const ACTIONS: Record<Action, { label: string; busy: string; icon: typeof Send; variant: "default" | "outline" | "destructive"; confirm: string }> = {
  SEND: { label: "Mark as sent", busy: "Sending…", icon: Send, variant: "default", confirm: "Sending locks the line items. A linked job moves to Awaiting approval." },
  APPROVE: { label: "Approve", busy: "Approving…", icon: Check, variant: "default", confirm: "Records the customer’s approval. A linked job moves to Approved." },
  REJECT: { label: "Reject", busy: "Rejecting…", icon: X, variant: "outline", confirm: "Records that the customer declined. You can send a new quotation for the job." },
  EXPIRE: { label: "Mark expired", busy: "Updating…", icon: TimerOff, variant: "outline", confirm: "Closes the quotation without a decision." },
};
const textarea = "min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function QuotationActions({ quotation, canConvert, expired }: { quotation: QuotationDetail; canConvert: boolean; expired: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | "CONVERT" | null>(null);
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<{ message: string; session?: boolean } | null>(null);
  const available: Action[] = quotation.status === "DRAFT" ? ["SEND"] : quotation.status === "SENT" ? (expired ? ["APPROVE", "REJECT", "EXPIRE"] : ["APPROVE", "REJECT"]) : [];
  const convertible = quotation.status === "APPROVED" && !quotation.invoiceId && canConvert;

  async function run(action: Action | "CONVERT") {
    if (working || done) return;
    setWorking(true);
    setNotice(null);
    try {
      const response = action === "CONVERT"
        ? await fetch(`/api/quotations/${encodeURIComponent(quotation.id)}/convert`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: quotation.version, requestId: crypto.randomUUID() }) })
        : await fetch(`/api/quotations/${encodeURIComponent(quotation.id)}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, version: quotation.version, ...(note.trim() ? { note: note.trim() } : {}) }) });
      if (response.redirected || response.status === 401) { setNotice({ session: true, message: "Your session expired. Sign in in another tab, then refresh this page." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null;
        setNotice({ message: response.status === 409 && message ? message : response.status === 403 ? "You don’t have permission to do this." : "We couldn’t update the quotation. Please try again." });
        return;
      }
      if (action === "CONVERT") {
        const parsed = convertSchema.safeParse(body);
        if (!parsed.success) { setNotice({ message: "We couldn’t confirm the conversion. Refresh to check." }); return; }
        setDone(true);
        router.push(`/invoices/${encodeURIComponent(parsed.data.invoice.id)}`);
        router.refresh();
        return;
      }
      if (!resultSchema.safeParse(body).success) { setNotice({ message: "We couldn’t confirm the update. Refresh to check." }); return; }
      setDone(true);
      router.refresh();
    } catch {
      setNotice({ message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally { setWorking(false); }
  }

  if (!available.length && !convertible) {
    return <p className="text-sm leading-6 text-muted-foreground">{quotation.status === "APPROVED" && quotation.invoiceId ? "This quotation has been converted to an invoice." : quotation.status === "APPROVED" ? "Approved. An invoice can be raised from it by someone who manages invoices." : quotation.status === "REJECTED" ? "The customer declined this quotation." : quotation.status === "EXPIRED" ? "This quotation expired without a decision." : "No actions are available."}</p>;
  }
  const busy = working || done;
  return (
    <div className="space-y-4" aria-busy={busy}>
      {notice && <Alert variant="destructive"><AlertTitle>Quotation wasn’t updated</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.session && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}</AlertDescription></Alert>}
      {pending ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">{pending === "CONVERT" ? "Create an invoice from this quotation?" : `${ACTIONS[pending].label}?`}</p>
          <p className="text-xs leading-5 text-muted-foreground">{pending === "CONVERT" ? "A draft invoice is created with the same lines. The quotation stays approved." : ACTIONS[pending].confirm}</p>
          {pending !== "CONVERT" && <div className="space-y-1.5"><Label htmlFor="quotation-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><textarea id="quotation-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className={textarea} disabled={busy} /></div>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={pending === "CONVERT" ? "default" : ACTIONS[pending].variant} disabled={busy} onClick={() => void run(pending)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{done ? "Done, refreshing…" : working ? (pending === "CONVERT" ? "Creating…" : ACTIONS[pending].busy) : "Confirm"}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPending(null); setNote(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {available.map((action) => { const Icon = ACTIONS[action].icon; return <Button key={action} type="button" variant={ACTIONS[action].variant} onClick={() => setPending(action)}><Icon aria-hidden="true" />{ACTIONS[action].label}</Button>; })}
          {convertible && <Button type="button" onClick={() => setPending("CONVERT")}><FileOutput aria-hidden="true" />Convert to invoice</Button>}
        </div>
      )}
    </div>
  );
}
