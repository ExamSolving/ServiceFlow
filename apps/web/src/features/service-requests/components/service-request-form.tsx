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
import { serviceRequestFormSchema, serviceRequestIdSchema, serviceRequestStatuses } from "../schemas/service-request.schema";
import type { ServiceRequestDetail, ServiceRequestFormValues, ServiceRequestOption } from "../types/service-request";
import { ReferencePicker } from "./reference-picker";
import { serviceRequestPriorityOptions } from "./service-request-status";

const fields = ["customerId", "serviceTypeId", "title", "description", "priority"] as const;
const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";
const responseSchema = z.object({ serviceRequest: serviceRequestFormSchema.extend({
  id: serviceRequestIdSchema, status: z.enum(serviceRequestStatuses),
  customerName: z.string().min(1), customerNumber: z.string().min(1), serviceTypeName: z.string().min(1),
  version: z.number().int().positive(), requestedAt: z.iso.datetime(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}) });
type Notice = { kind: "error" | "session" | "conflict"; message: string };

const emptyValues: ServiceRequestFormValues = { customerId: "", serviceTypeId: "", title: "", description: "", priority: "NORMAL" };

export function ServiceRequestForm({ serviceRequest }: { serviceRequest?: ServiceRequestDetail }) {
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  const [customer, setCustomer] = useState<ServiceRequestOption | null>(serviceRequest ? { id: serviceRequest.customerId, name: serviceRequest.customerName, secondary: serviceRequest.customerNumber } : null);
  const [serviceType, setServiceType] = useState<ServiceRequestOption | null>(serviceRequest ? { id: serviceRequest.serviceTypeId, name: serviceRequest.serviceTypeName } : null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const form = useForm<ServiceRequestFormValues>({
    resolver: zodResolver(serviceRequestFormSchema),
    defaultValues: serviceRequest
      ? { customerId: serviceRequest.customerId, serviceTypeId: serviceRequest.serviceTypeId, title: serviceRequest.title, description: serviceRequest.description, priority: serviceRequest.priority }
      : emptyValues,
    mode: "onBlur",
  });
  const { errors, isDirty, isSubmitting, isSubmitted } = form.formState;
  const busy = saving || saved || isSubmitting;
  const detailPath = serviceRequest ? `/service-requests/${encodeURIComponent(serviceRequest.id)}` : "/service-requests";

  useEffect(() => {
    if (!isDirty || saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, saved]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  function chooseReference(name: "customerId" | "serviceTypeId", option: ServiceRequestOption | null) {
    (name === "customerId" ? setCustomer : setServiceType)(option);
    form.setValue(name, option?.id ?? "", { shouldDirty: true, shouldValidate: isSubmitted });
    if (option) form.clearErrors(name);
  }

  async function onSubmit(values: ServiceRequestFormValues) {
    if (saving || saved) return;
    setSaving(true);
    setNotice(null);
    try {
      const nextRequestId = requestId ?? crypto.randomUUID();
      if (!serviceRequest && !requestId) setRequestId(nextRequestId);
      const response = await fetch(serviceRequest ? `/api/service-requests/${encodeURIComponent(serviceRequest.id)}` : "/api/service-requests", {
        method: serviceRequest ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceRequest ? { ...values, version: serviceRequest.version } : { ...values, requestId: nextRequestId }),
      });
      if (response.redirected || response.status === 401) {
        setNotice({ kind: "session", message: "Your session has expired. Sign in again in another tab, then return here to save. Your entries are still here." });
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body ? body.code : undefined;
        const field = body && typeof body === "object" && "field" in body ? body.field : undefined;
        if (response.status === 409 && code === "INVALID_REFERENCE" && (field === "customerId" || field === "serviceTypeId")) {
          const message = field === "customerId" ? "This customer is no longer active in your workspace. Choose another customer." : "This service type is no longer active in your catalog. Choose another service type.";
          form.setError(field, { type: "server", message });
          setNotice({ kind: "error", message: `${message} Your other entries are still here.` });
          return;
        }
        if (response.status === 409 && code === "TRANSITION") {
          setNotice({ kind: "conflict", message: "This request’s status changed and it can no longer be edited. Open the latest version to see its current status. Your entries are still here." });
          return;
        }
        if (response.status === 409) {
          setNotice({ kind: "conflict", message: serviceRequest
            ? "This request has changed since you opened the form. Open the latest version in a new tab to compare. Your entries are still here."
            : "An earlier save may already have logged this request. Check the queue before trying again. Your entries are still here." });
          return;
        }
        if (body && typeof body === "object" && "fieldErrors" in body && body.fieldErrors && typeof body.fieldErrors === "object") {
          for (const name of fields) {
            const messages = (body.fieldErrors as Record<string, unknown>)[name];
            if (Array.isArray(messages) && typeof messages[0] === "string") form.setError(name, { type: "server", message: messages[0] });
          }
        }
        setNotice({ kind: "error", message: response.status === 400 ? "Check the highlighted fields and try again."
          : response.status === 403 ? "You don’t have permission to save service requests. Contact your workspace owner."
          : response.status === 404 ? "This service request is no longer available in your workspace. Your entries are still here."
          : "We couldn’t save this service request. Please try again. Your entries are still here." });
        return;
      }
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success || (serviceRequest && parsed.data.serviceRequest.id !== serviceRequest.id)) {
        setNotice({ kind: "error", message: "We couldn’t confirm the save. Try again. Your entries are still here." });
        return;
      }
      setSaved(true);
      router.replace(`/service-requests/${encodeURIComponent(parsed.data.serviceRequest.id)}`);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again. Your entries are still here." });
    } finally { setSaving(false); }
  }

  function fieldError(name: keyof ServiceRequestFormValues) {
    return errors[name] ? <p id={`service-request-${name}-error`} role="alert" className="text-xs leading-5 text-destructive">{errors[name]?.message}</p> : null;
  }

  return <>
    <PageHeader title={serviceRequest ? "Edit service request" : "New service request"}
      description={serviceRequest ? "Update what the customer needs before the work is scheduled." : "Log what a customer is asking for so your operations team can review and prioritize it."}
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Service requests", href: "/service-requests" }, { label: serviceRequest ? "Edit request" : "New request" }]} />
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-busy={busy} className="space-y-5">
      {notice && <div ref={noticeRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{notice.kind === "session" ? "Sign in to continue" : notice.kind === "conflict" ? "Review before saving" : "Request wasn’t saved"}</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.kind === "session" && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.kind === "conflict" && <Link href={serviceRequest ? detailPath : "/service-requests"} target="_blank" rel="noopener noreferrer">{serviceRequest ? "Open latest version in a new tab" : "Check the queue in a new tab"}</Link>}</AlertDescription></Alert></div>}
      <input type="hidden" {...form.register("customerId")} />
      <input type="hidden" {...form.register("serviceTypeId")} />
      <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <legend className="sr-only">Service request details</legend>
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="border-b border-border"><SectionHeading title="Who and what" description="Choose the customer and the service they are asking for." /></CardHeader>
            <CardContent className="space-y-5">
              <ReferencePicker kind="customers" fieldId="service-request-customerId" label="Customer" noun="customer" disabled={busy}
                hint="Only active customers can be chosen. Add new customers from the Customers page." selected={customer} error={errors.customerId?.message}
                onSelect={(option) => chooseReference("customerId", option)} />
              <div className="border-t border-border pt-5">
                <ReferencePicker kind="serviceTypes" fieldId="service-request-serviceTypeId" label="Service type" noun="service type" disabled={busy}
                  hint="Only active service types from your catalog can be chosen." selected={serviceType} error={errors.serviceTypeId?.message}
                  onSelect={(option) => chooseReference("serviceTypeId", option)} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b border-border"><SectionHeading title="Request details" description="Describe the problem or need in the customer’s words." /></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="service-request-title">Title <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                <Input id="service-request-title" maxLength={160} required aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "service-request-title-error" : "service-request-title-hint"} {...form.register("title")} />
                {fieldError("title") || <p id="service-request-title-hint" className="text-xs leading-5 text-muted-foreground">A short summary, for example “AC not cooling in main office”.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-request-description">Description <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                <textarea id="service-request-description" rows={6} maxLength={4000} required className="min-h-36 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "service-request-description-error" : "service-request-description-hint"} {...form.register("description")} />
                {fieldError("description") || <p id="service-request-description-hint" className="text-xs leading-5 text-muted-foreground">Include symptoms, location details and access instructions. Between 10 and 4,000 characters.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Priority" description="Help your team decide what to schedule first." /></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="service-request-priority">Priority</Label>
              <select id="service-request-priority" className={selectStyle} aria-invalid={Boolean(errors.priority)} aria-describedby={errors.priority ? "service-request-priority-error" : "service-request-priority-hint"} {...form.register("priority")}>
                {serviceRequestPriorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {fieldError("priority") || <p id="service-request-priority-hint" className="text-xs leading-5 text-muted-foreground">{serviceRequestPriorityOptions.map((option) => `${option.label}: ${option.description}`).join(" ")}</p>}
            </div>
            {serviceRequest && <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="mt-1 text-sm font-medium">{serviceRequest.status === "NEW" ? "New" : "Reviewing"}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Status changes are made from the request page, not here.</p>
            </div>}
          </CardContent>
        </Card>
      </fieldset>
      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-xs leading-5 text-muted-foreground">{saved ? "Request saved. Opening its record…" : busy ? "Saving request…" : isDirty ? "You have unsaved changes." : serviceRequest ? "This request is up to date." : "New requests start with the New status and appear on your dashboard."}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {busy ? <Button type="button" variant="outline" disabled>Cancel</Button> : <Link href={detailPath} className={buttonVariants({ variant: "outline" })}>Cancel</Link>}
          <Button type="submit" disabled={busy || Boolean(serviceRequest && !isDirty)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{saved ? "Opening request…" : busy ? "Saving…" : serviceRequest ? "Save changes" : "Log request"}</Button>
        </div>
      </div>
    </form>
  </>;
}
