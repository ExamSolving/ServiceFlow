"use client";

import { Ban, LoaderCircle, SendHorizonal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { invoiceDetailSchema, type InvoiceActionInput } from "../schemas/invoice.schema";
import type { InvoiceDetail } from "../types/invoice";

const resultSchema = z.object({ invoice: invoiceDetailSchema });
type Action = InvoiceActionInput["action"];
const textarea = "min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function InvoiceActions({ invoice, hasTrackedLines }: { invoice: InvoiceDetail; hasTrackedLines: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<{ message: string; session?: boolean } | null>(null);
  const canIssue = invoice.status === "DRAFT";
  const canVoid = (invoice.status === "DRAFT" || invoice.status === "ISSUED") && invoice.amountPaid === 0;

  async function run(action: Action) {
    if (working || done) return;
    setWorking(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, version: invoice.version, ...(note.trim() ? { note: note.trim() } : {}) }) });
      if (response.redirected || response.status === 401) { setNotice({ session: true, message: "Your session expired. Sign in in another tab, then refresh this page." }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null;
        setNotice({ message: response.status === 409 && message ? message : response.status === 403 ? "You don’t have permission to manage invoices." : "We couldn’t update the invoice. Please try again." });
        return;
      }
      if (!resultSchema.safeParse(body).success) { setNotice({ message: "We couldn’t confirm the update. Refresh to check." }); return; }
      setDone(true);
      router.refresh();
    } catch {
      setNotice({ message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally { setWorking(false); }
  }

  if (!canIssue && !canVoid) {
    return <p className="text-sm leading-6 text-muted-foreground">{invoice.status === "PAID" ? "This invoice is fully paid." : invoice.status === "VOID" ? "This invoice was voided." : invoice.status === "PARTIALLY_PAID" ? "Payments have been recorded; the invoice stays open until the balance is cleared." : "No actions are available."}</p>;
  }
  const busy = working || done;
  return (
    <div className="space-y-4" aria-busy={busy}>
      {notice && <Alert variant="destructive"><AlertTitle>Invoice wasn’t updated</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.session && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}</AlertDescription></Alert>}
      {pending ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">{pending === "ISSUE" ? "Issue this invoice?" : "Void this invoice?"}</p>
          <p className="text-xs leading-5 text-muted-foreground">{pending === "ISSUE" ? `Issuing locks the line items, sets the due date${hasTrackedLines ? ", deducts tracked products from stock" : ""} and marks a linked job as Invoiced.` : invoice.status === "ISSUED" ? "The invoice is closed with no balance due and any stock it deducted is returned. A linked job keeps its status." : "The draft is closed and its number is retired."}</p>
          <div className="space-y-1.5"><Label htmlFor="invoice-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><textarea id="invoice-note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className={textarea} disabled={busy} /></div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={pending === "VOID" ? "destructive" : "default"} disabled={busy} onClick={() => void run(pending)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{done ? "Done, refreshing…" : working ? (pending === "ISSUE" ? "Issuing…" : "Voiding…") : "Confirm"}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPending(null); setNote(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canIssue && <Button type="button" onClick={() => setPending("ISSUE")}><SendHorizonal aria-hidden="true" />Issue invoice</Button>}
          {canVoid && <Button type="button" variant="outline" onClick={() => setPending("VOID")}><Ban aria-hidden="true" />Void</Button>}
        </div>
      )}
    </div>
  );
}
