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
import { serviceTypeFormSchema, serviceTypeIdSchema } from "../schemas/service-type.schema";
import type { ServiceTypeDetail, ServiceTypeFormValues } from "../types/service-type";

const fields = ["name", "description", "estimatedDurationMinutes", "isActive"] as const;
const responseSchema = z.object({ serviceType: serviceTypeFormSchema.extend({
  id: serviceTypeIdSchema, version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}) });
type Notice = { kind: "error" | "session" | "conflict"; message: string };

export function ServiceTypeForm({ serviceType }: { serviceType?: ServiceTypeDetail }) {
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const form = useForm<ServiceTypeFormValues>({
    resolver: zodResolver(serviceTypeFormSchema),
    defaultValues: serviceType ? { name: serviceType.name, description: serviceType.description, estimatedDurationMinutes: serviceType.estimatedDurationMinutes, isActive: serviceType.isActive }
      : { name: "", description: "", estimatedDurationMinutes: 60, isActive: true },
    mode: "onBlur",
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const busy = saving || saved || isSubmitting;
  const detailPath = serviceType ? `/service-types/${encodeURIComponent(serviceType.id)}` : "/service-types";

  useEffect(() => {
    if (!isDirty || saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, saved]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  async function onSubmit(values: ServiceTypeFormValues) {
    if (saving || saved) return;
    setSaving(true);
    setNotice(null);
    try {
      const nextRequestId = requestId ?? crypto.randomUUID();
      if (!serviceType && !requestId) setRequestId(nextRequestId);
      const response = await fetch(serviceType ? `/api/service-types/${encodeURIComponent(serviceType.id)}` : "/api/service-types", {
        method: serviceType ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceType ? { ...values, version: serviceType.version } : { ...values, requestId: nextRequestId }),
      });
      if (response.redirected || response.status === 401) {
        setNotice({ kind: "session", message: "Your session has expired. Sign in again in another tab, then return here to save. Your entries are still here." });
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body ? body.code : undefined;
        if (response.status === 409 && code === "DUPLICATE_NAME") {
          form.setError("name", { type: "server", message: "This name is already used in your workspace, including inactive service types." });
          setNotice({ kind: "error", message: "Choose another name or edit the existing service type. Your entries are still here." });
          return;
        }
        if (response.status === 409) {
          setNotice({ kind: "conflict", message: serviceType
            ? "This service type has changed since you opened the form. Open the latest version in a new tab to compare. Your entries are still here."
            : "An earlier save may already have created this service type. Check the catalog before trying again. Your entries are still here." });
          return;
        }
        if (body && typeof body === "object" && "fieldErrors" in body && body.fieldErrors && typeof body.fieldErrors === "object") {
          for (const name of fields) {
            const messages = (body.fieldErrors as Record<string, unknown>)[name];
            if (Array.isArray(messages) && typeof messages[0] === "string") form.setError(name, { type: "server", message: messages[0] });
          }
        }
        setNotice({ kind: "error", message: response.status === 400 ? "Check the highlighted fields and try again."
          : response.status === 403 ? "You don’t have permission to save service types. Contact your workspace owner."
          : response.status === 404 ? "This service type is no longer available in your workspace. Your entries are still here."
          : "We couldn’t save this service type. Please try again. Your entries are still here." });
        return;
      }
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success || (serviceType && parsed.data.serviceType.id !== serviceType.id)) {
        setNotice({ kind: "error", message: "We couldn’t confirm the save. Try again. Your entries are still here." });
        return;
      }
      setSaved(true);
      router.replace(`/service-types/${encodeURIComponent(parsed.data.serviceType.id)}`);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again. Your entries are still here." });
    } finally { setSaving(false); }
  }

  function fieldError(name: keyof ServiceTypeFormValues) {
    return errors[name] ? <p id={`service-type-${name}-error`} role="alert" className="text-xs leading-5 text-destructive">{errors[name]?.message}</p> : null;
  }

  return <>
    <PageHeader title={serviceType ? "Edit service type" : "Add service type"}
      description="Define the work your team offers and the time to allow for each visit."
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Service types", href: "/service-types" }, { label: serviceType ? "Edit service type" : "Add service type" }]} />
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-busy={busy} className="space-y-5">
      {notice && <div ref={noticeRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{notice.kind === "session" ? "Sign in to continue" : notice.kind === "conflict" ? "Review before saving" : "Service type wasn’t saved"}</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.kind === "session" && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.kind === "conflict" && <Link href={serviceType ? `${detailPath}/edit` : "/service-types"} target="_blank" rel="noopener noreferrer">{serviceType ? "Open latest version in a new tab" : "Check the catalog in a new tab"}</Link>}</AlertDescription></Alert></div>}
      <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <legend className="sr-only">Service type configuration</legend>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Service details" description="Use a clear name that your team can recognize." /></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="service-type-name">Name <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
              <Input id="service-type-name" maxLength={120} required aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "service-type-name-error" : "service-type-name-hint"} {...form.register("name")} />
              {fieldError("name") || <p id="service-type-name-hint" className="text-xs leading-5 text-muted-foreground">For example, AC Repair or Solar Inspection. Names must be unique in this workspace.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-type-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <textarea id="service-type-description" rows={5} maxLength={500} className="min-h-32 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "service-type-description-error" : "service-type-description-hint"} {...form.register("description")} />
              {fieldError("description") || <p id="service-type-description-hint" className="text-xs leading-5 text-muted-foreground">Describe what this service covers. Up to 500 characters.</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Planning defaults" description="Set a useful starting point for your operations team." /></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="service-type-duration">Estimated duration (minutes) <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
              <Input id="service-type-duration" type="number" inputMode="numeric" min={5} max={1440} step={1} required aria-invalid={Boolean(errors.estimatedDurationMinutes)} aria-describedby={errors.estimatedDurationMinutes ? "service-type-estimatedDurationMinutes-error" : "service-type-duration-hint"} {...form.register("estimatedDurationMinutes", { valueAsNumber: true })} />
              {fieldError("estimatedDurationMinutes") || <p id="service-type-duration-hint" className="text-xs leading-5 text-muted-foreground">Allow 5 to 1,440 minutes. This is an estimate, not a booking or a price.</p>}
            </div>
            <div className="flex items-start gap-3 border-t border-border pt-5">
              <input id="service-type-active" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-describedby={errors.isActive ? "service-type-isActive-error" : "service-type-active-hint"} {...form.register("isActive")} />
              <div className="space-y-2"><Label htmlFor="service-type-active">Active service type</Label><p id="service-type-active-hint" className="text-xs leading-5 text-muted-foreground">Uncheck to retire this service from your active catalog. Its record remains available.</p>{fieldError("isActive")}</div>
            </div>
          </CardContent>
        </Card>
      </fieldset>
      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-xs leading-5 text-muted-foreground">{saved ? "Service type saved. Opening its record…" : busy ? "Saving service type…" : isDirty ? "You have unsaved changes." : serviceType ? "This service type is up to date." : "This configuration will be shared across your workspace."}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {busy ? <Button type="button" variant="outline" disabled>Cancel</Button> : <Link href={detailPath} className={buttonVariants({ variant: "outline" })}>Cancel</Link>}
          <Button type="submit" disabled={busy || Boolean(serviceType && !isDirty)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{saved ? "Opening service type…" : busy ? "Saving…" : serviceType ? "Save changes" : "Create service type"}</Button>
        </div>
      </div>
    </form>
  </>;
}
