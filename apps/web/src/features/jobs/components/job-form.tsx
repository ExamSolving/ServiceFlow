"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle, Save } from "lucide-react";
import { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { ReferencePicker } from "@/src/features/service-requests/components/reference-picker";
import type { ServiceRequestDetail, ServiceRequestOption } from "@/src/features/service-requests/types/service-request";
import { jobDetailSchema, jobFormSchema } from "../schemas/job.schema";
import type { JobDetail, JobFormValues } from "../types/job";
import { jobPriorityOptions } from "./job-status";

const resultSchema = z.object({ job: jobDetailSchema });
const textAreaStyle = "min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
export function JobForm({ job, source }: { job?: JobDetail; source?: ServiceRequestDetail }) {
  const router = useRouter();
  const initial = job ?? source;
  const fixedReferences = Boolean(source || job?.serviceRequestId);
  const [customer, setCustomer] = useState<ServiceRequestOption | null>(initial ? { id: initial.customerId, name: initial.customerName, secondary: initial.customerNumber } : null);
  const [service, setService] = useState<ServiceRequestOption | null>(initial ? { id: initial.serviceTypeId, name: initial.serviceTypeName } : null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<{ message: string; session?: boolean; conflict?: boolean } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const form = useForm<JobFormValues>({ resolver: zodResolver(jobFormSchema), mode: "onBlur", defaultValues: {
    customerId: initial?.customerId ?? "", serviceTypeId: initial?.serviceTypeId ?? "", title: initial?.title ?? "", description: initial?.description ?? "", priority: initial?.priority ?? "NORMAL", serviceAddress: job?.serviceAddress ?? "",
  } });
  const { errors, isDirty, isSubmitting } = form.formState;
  const busy = isSubmitting || saved;
  const back = job ? `/jobs/${job.id}` : source ? `/service-requests/${source.id}` : "/jobs";
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);
  useEffect(() => {
    if (!isDirty || saved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, saved]);
  function choose(field: "customerId" | "serviceTypeId", option: ServiceRequestOption | null) {
    (field === "customerId" ? setCustomer : setService)(option);
    form.setValue(field, option?.id ?? "", { shouldDirty: true, shouldValidate: true });
  }
  async function save(values: JobFormValues) {
    if (saved) return;
    setNotice(null);
    const saveRequestId = requestId ?? crypto.randomUUID();
    if (!requestId) setRequestId(saveRequestId);
    const body = source ? { serviceRequestId: source.id, version: source.version, serviceAddress: values.serviceAddress }
      : job ? { ...values, version: job.version } : { ...values, requestId: saveRequestId };
    try {
      const response = await fetch(source ? "/api/jobs/convert" : job ? `/api/jobs/${job.id}` : "/api/jobs", { method: job ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (response.redirected || response.status === 401) { setNotice({ session: true, message: "Your session expired. Sign in in another tab, then return to save. Your entries are still here." }); return; }
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = data && typeof data === "object" && "code" in data ? data.code : null;
        setNotice({ conflict: response.status === 409 && code !== "INVALID_REFERENCE", message:
          code === "INVALID_REFERENCE" ? "The customer or service type is unavailable. Choose active records, or check the original request’s customer and service type before converting."
          : response.status === 409 ? "This record changed or was already saved. Open the latest record to review before trying again. Your entries are still here."
          : response.status === 403 ? "You don’t have permission to manage jobs."
          : response.status === 404 ? "This record is no longer available in your workspace."
          : response.status === 400 ? "Check the form details and try again."
          : "We couldn’t save this job. Please try again. Your entries are still here." });
        return;
      }
      const parsed = resultSchema.safeParse(data);
      if (!parsed.success || (job && parsed.data.job.id !== job.id)) { setNotice({ message: "We couldn’t confirm the save. Retry to check it safely." }); return; }
      setSaved(true);
      router.replace(`/jobs/${parsed.data.job.id}`);
      router.refresh();
    } catch { setNotice({ message: "We couldn’t reach ServiceFlow. Check your connection and try again." }); }
  }
  function error(field: keyof JobFormValues) { return errors[field] ? <p id={`job-${field}-error`} role="alert" className="text-xs text-destructive">{errors[field]?.message}</p> : null; }
  return <>
    <PageHeader title={job ? "Edit job" : source ? "Create job from request" : "New job"} description={source ? "Review the request and add the service location. The request will be linked to the new job." : "Prepare the work details and service location for your team."} breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Jobs", href: "/jobs" }, { label: job ? "Edit job" : "New job" }]} />
    <form noValidate onSubmit={form.handleSubmit(save, () => {
      if (!form.getValues("customerId")) document.getElementById("job-customerId-search")?.focus();
      else if (!form.getValues("serviceTypeId")) document.getElementById("job-serviceTypeId-search")?.focus();
    })} className="space-y-5" aria-busy={busy}>
      {notice && <div ref={noticeRef} tabIndex={-1}><Alert variant="destructive"><AlertTitle>Job wasn’t saved</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.session && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.conflict && <Link href={back} target="_blank" rel="noopener noreferrer">Open latest record in a new tab</Link>}</AlertDescription></Alert></div>}
      <input type="hidden" {...form.register("customerId")} /><input type="hidden" {...form.register("serviceTypeId")} />
      <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <legend className="sr-only">Job details</legend>
        <div className="min-w-0 space-y-5">
          <Card><CardHeader className="border-b border-border"><SectionHeading title="Customer and service" description={fixedReferences ? "Linked to the original service request." : "Choose active records from your workspace."} /></CardHeader><CardContent className="space-y-5">
            <ReferencePicker kind="customers" fieldId="job-customerId" label="Customer" noun="customer" hint="The customer receiving the service." selected={customer} onSelect={option => choose("customerId", option)} disabled={busy || fixedReferences} error={errors.customerId?.message} />
            <ReferencePicker kind="serviceTypes" fieldId="job-serviceTypeId" label="Service type" noun="service type" hint="The type of work required." selected={service} onSelect={option => choose("serviceTypeId", option)} disabled={busy || fixedReferences} error={errors.serviceTypeId?.message} />
          </CardContent></Card>
          <Card><CardHeader className="border-b border-border"><SectionHeading title="Work details" description={source ? "Copied from the request. You can edit the job after creating it." : "Give your team the information they need for the visit."} /></CardHeader><CardContent className="space-y-5">
            <div className="space-y-2"><Label htmlFor="job-title">Title</Label><Input id="job-title" required readOnly={Boolean(source)} maxLength={160} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "job-title-error" : undefined} {...form.register("title")} />{error("title")}</div>
            <div className="space-y-2"><Label htmlFor="job-description">Description</Label><textarea id="job-description" required readOnly={Boolean(source)} rows={5} maxLength={4000} className={textAreaStyle} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "job-description-error" : undefined} {...form.register("description")} />{error("description")}</div>
            <div className="space-y-2"><Label htmlFor="job-serviceAddress">Service location</Label><textarea id="job-serviceAddress" required rows={3} maxLength={1000} placeholder="Street address, city, postal code and access details" className={textAreaStyle} aria-invalid={Boolean(errors.serviceAddress)} aria-describedby={errors.serviceAddress ? "job-serviceAddress-error" : "job-address-hint"} {...form.register("serviceAddress")} />{error("serviceAddress")}<p id="job-address-hint" className="text-xs text-muted-foreground">The address where this job will be carried out.</p></div>
          </CardContent></Card>
        </div>
        <Card><CardHeader className="border-b border-border"><SectionHeading title="Job preparation" /></CardHeader><CardContent className="space-y-5">
          <div className="space-y-2"><Label htmlFor="job-priority">Priority</Label><select id="job-priority" disabled={busy || Boolean(source)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" {...form.register("priority")}>{jobPriorityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error("priority")}</div>
          <p className="text-xs leading-5 text-muted-foreground">The job number is assigned when saved. New jobs start unassigned and unscheduled.</p>
          {source && <Link href={back} className="text-sm text-primary underline">View original request</Link>}
        </CardContent></Card>
      </fieldset>
      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><p role="status" className="text-xs text-muted-foreground">{saved ? "Job saved. Opening its record…" : busy ? "Saving job…" : isDirty ? "You have unsaved changes." : "Ready to prepare your job."}</p><div className="flex flex-col-reverse gap-2 sm:flex-row">{busy ? <Button variant="outline" disabled>Cancel</Button> : <Link href={back} className={buttonVariants({ variant: "outline" })}>Cancel</Link>}<Button type="submit" disabled={busy || Boolean(job && !isDirty)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{saved ? "Opening job…" : busy ? "Saving…" : job ? "Save changes" : "Create job"}</Button></div></div>
    </form>
  </>;
}
