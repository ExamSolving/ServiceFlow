"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { customerFormSchema, customerIdSchema } from "../schemas/customer.schema";
import type { CustomerDetail, CustomerFormValues } from "../types/customer";

const fields = ["type", "name", "phone", "email", "notes", "isActive"] as const;
const controlStyle = "w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";
const responseSchema = z.object({ customer: customerFormSchema.extend({
  id: customerIdSchema,
  customerNumber: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}) });

type Notice = { message: string; kind: "error" | "session" | "conflict" };

export function CustomerForm({ customer }: { customer?: CustomerDetail }) {
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: customer ? {
      type: customer.type,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      notes: customer.notes,
      isActive: customer.isActive,
    } : { type: "INDIVIDUAL", name: "", email: "", phone: "", notes: "", isActive: true },
    mode: "onBlur",
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const busy = isSubmitting || saving || saved;
  const customerPath = customer ? `/customers/${encodeURIComponent(customer.id)}` : "/customers";

  useEffect(() => {
    if (!isDirty || saved) return;
    const warnOnExit = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warnOnExit);
    return () => window.removeEventListener("beforeunload", warnOnExit);
  }, [isDirty, saved]);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  async function onSubmit(values: CustomerFormValues) {
    if (saving || saved) return;
    setSaving(true);
    setNotice(null);
    try {
      const nextRequestId = requestId ?? crypto.randomUUID();
      if (!customer && !requestId) setRequestId(nextRequestId);
      const response = await fetch(customer ? `/api/customers/${encodeURIComponent(customer.id)}` : "/api/customers", {
        method: customer ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(customer ? { ...values, version: customer.version } : { ...values, requestId: nextRequestId }),
      });

      if (response.redirected || response.status === 401) {
        setNotice({ kind: "session", message: "Your session has expired. Sign in again in another tab, then return here to save. Your entries are still here." });
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          setNotice({ kind: "conflict", message: customer
            ? "This customer has changed since you opened the form. Your entries are still here. Open the latest version in a new tab to compare before saving again."
            : "An earlier save may already have created this customer. Check the directory in a new tab before adding another customer. Your entries are still here." });
          return;
        }
        if (body && typeof body === "object" && "fieldErrors" in body && body.fieldErrors && typeof body.fieldErrors === "object") {
          for (const name of fields) {
            const messages = (body.fieldErrors as Record<string, unknown>)[name];
            if (Array.isArray(messages) && typeof messages[0] === "string") form.setError(name, { type: "server", message: messages[0] });
          }
        }
        setNotice({ kind: "error", message: response.status === 400
          ? "Check the highlighted fields and try again."
          : response.status === 403 ? "You don’t have permission to save this customer. Contact your workspace owner."
          : response.status === 404 ? "This customer is no longer available in your workspace. Your entries are still here."
          : "We couldn’t save this customer. Please try again. Your entries are still here." });
        return;
      }

      const result = responseSchema.safeParse(body);
      if (!result.success || (customer && result.data.customer.id !== customer.id)) {
        setNotice({ kind: "error", message: "We couldn’t confirm the save. Please try again. Your entries are still here." });
        return;
      }
      setSaved(true);
      router.replace(`/customers/${encodeURIComponent(result.data.customer.id)}`);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again. Your entries are still here." });
    } finally {
      setSaving(false);
    }
  }

  function errorFor(name: keyof CustomerFormValues) {
    return errors[name] ? <p id={`customer-${name}-error`} role="alert" className="text-xs leading-5 text-destructive">{errors[name]?.message}</p> : null;
  }

  return (
    <>
      <PageHeader
        title={customer ? "Edit customer" : "Add customer"}
        description={customer ? "Keep contact details and service preferences up to date." : "Create a customer record for your team’s next service."}
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Customers", href: "/customers" }, { label: customer ? "Edit customer" : "Add customer" }]}
      />
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-busy={busy} className="space-y-5">
        {notice && <div ref={noticeRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{notice.kind === "session" ? "Sign in to continue" : notice.kind === "conflict" ? "Review before saving" : "Customer wasn’t saved"}</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.kind === "session" && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.kind === "conflict" && <Link href={customer ? `${customerPath}/edit` : "/customers"} target="_blank" rel="noopener noreferrer">{customer ? "Open latest version in a new tab" : "Check customers in a new tab"}</Link>}</AlertDescription></Alert></div>}

        <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          <legend className="sr-only">Customer details</legend>
          <Card>
            <CardHeader className="border-b border-border"><SectionHeading title="Customer details" description="Name and phone number are required. Email and notes are optional." /></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="customer-name">Customer name <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                  <Input id="customer-name" autoComplete="name" maxLength={120} required aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "customer-name-error" : "customer-name-hint"} {...form.register("name")} />
                  {errorFor("name") || <p id="customer-name-hint" className="text-xs leading-5 text-muted-foreground">The person or business your team serves.</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-type">Customer type</Label>
                  <select id="customer-type" className={`${controlStyle} h-10`} aria-invalid={Boolean(errors.type)} aria-describedby={errors.type ? "customer-type-error" : undefined} {...form.register("type")}><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select>
                  {errorFor("type")}
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="customer-phone">Phone number <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                  <Input id="customer-phone" type="tel" autoComplete="tel" maxLength={32} required aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "customer-phone-error" : "customer-phone-hint"} {...form.register("phone")} />
                  {errorFor("phone") || <p id="customer-phone-hint" className="text-xs leading-5 text-muted-foreground">Include the country code when needed.</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="customer-email">Email address <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="customer-email" type="email" autoComplete="email" maxLength={254} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "customer-email-error" : undefined} {...form.register("email")} />
                  {errorFor("email")}
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-5">
                <Label htmlFor="customer-notes">Internal notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <textarea id="customer-notes" rows={5} maxLength={2000} className={`${controlStyle} min-h-32 resize-y py-3 leading-6`} aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? "customer-notes-error" : "customer-notes-hint"} {...form.register("notes")} />
                {errorFor("notes") || <p id="customer-notes-hint" className="text-xs leading-5 text-muted-foreground">Add service preferences or contact instructions for your team. Up to 2,000 characters.</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b border-border"><SectionHeading title="Customer status" description="Keep your directory current as relationships change." /></CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <input id="customer-isActive" type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed" aria-describedby={errors.isActive ? "customer-isActive-error" : "customer-status-hint"} {...form.register("isActive")} />
                <div className="space-y-2"><Label htmlFor="customer-isActive" className="cursor-pointer">Active customer</Label><p id="customer-status-hint" className="text-xs leading-5 text-muted-foreground">Uncheck to mark this customer inactive. Their details stay in your directory, and you can reactivate them at any time.</p>{errorFor("isActive")}</div>
              </div>
              {customer && <div className="mt-5 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Customer number</p><p className="mt-1 text-sm font-medium break-all">{customer.customerNumber}</p></div>}
            </CardContent>
          </Card>
        </fieldset>

        <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-xs leading-5 text-muted-foreground">{saved ? "Customer saved. Opening their record…" : busy ? "Saving customer…" : isDirty ? "You have unsaved changes." : customer ? "Your customer details are up to date." : "Your customer will be available across this workspace."}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {busy ? <Button type="button" variant="outline" disabled>Cancel</Button> : <Link href={customerPath} className={buttonVariants({ variant: "outline" })}>Cancel</Link>}
            <Button type="submit" disabled={busy || Boolean(customer && !isDirty)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{saved ? "Opening customer…" : busy ? "Saving…" : customer ? "Save changes" : "Create customer"}</Button>
          </div>
        </div>
      </form>
    </>
  );
}
