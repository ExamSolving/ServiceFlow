"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, LoaderCircle, Save, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { technicianFormSchema, technicianIdSchema } from "../schemas/technician.schema";
import type { TechnicianDetail, TechnicianFormContext, TechnicianFormValues, TechnicianMemberOption } from "../types/technician";
import { technicianStatuses } from "./technician-status";

const fields = ["displayName", "phone", "status"] as const;
const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";
const responseSchema = z.object({ technician: technicianFormSchema.extend({
  id: technicianIdSchema,
  userId: technicianIdSchema,
  employeeNumber: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}) });

type Notice = { kind: "error" | "session" | "conflict"; message: string };

function memberPageHref(cursor?: string) {
  return `/technicians/new${cursor ? `?memberCursor=${encodeURIComponent(cursor)}` : ""}`;
}

export function TechnicianForm({ technician, context }: { technician?: TechnicianDetail; context?: TechnicianFormContext }) {
  const router = useRouter();
  const noticeRef = useRef<HTMLDivElement>(null);
  const [selectedMember, setSelectedMember] = useState<TechnicianMemberOption | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const form = useForm<TechnicianFormValues>({
    resolver: zodResolver(technicianFormSchema),
    defaultValues: technician
      ? { displayName: technician.displayName, phone: technician.phone, status: technician.status }
      : { displayName: "", phone: "", status: "OFFLINE" },
    mode: "onBlur",
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const busy = saving || saved || isSubmitting;
  const technicianPath = technician ? `/technicians/${encodeURIComponent(technician.id)}` : "/technicians";

  useEffect(() => {
    if (!isDirty || saved) return;
    const warnOnExit = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warnOnExit);
    return () => window.removeEventListener("beforeunload", warnOnExit);
  }, [isDirty, saved]);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  function chooseMember(member: TechnicianMemberOption) {
    if (member.linked || busy) return;
    setSelectedMember(member);
    setNotice(null);
    setRequestId(null);
    form.reset({ displayName: member.displayName, phone: "", status: "OFFLINE" });
  }

  function chooseAnotherMember() {
    setSelectedMember(null);
    setNotice(null);
    setRequestId(null);
    form.reset({ displayName: "", phone: "", status: "OFFLINE" });
  }

  async function onSubmit(values: TechnicianFormValues) {
    if (busy || (!technician && !selectedMember)) return;
    setSaving(true);
    setNotice(null);
    try {
      const nextRequestId = requestId ?? crypto.randomUUID();
      if (!technician && !requestId) setRequestId(nextRequestId);
      const response = await fetch(technician ? `/api/technicians/${encodeURIComponent(technician.id)}` : "/api/technicians", {
        method: technician ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(technician
          ? { ...values, version: technician.version }
          : { ...values, userId: selectedMember!.userId, requestId: nextRequestId }),
      });

      if (response.redirected || response.status === 401) {
        setNotice({ kind: "session", message: "Your session has expired. Sign in again in another tab, then return here to save. Your entries are still here." });
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          const code = body && typeof body === "object" && "code" in body ? body.code : undefined;
          setNotice({ kind: "conflict", message: technician
            ? "This technician has changed since you opened the form. Your entries are still here. Open the latest version in a new tab to compare before saving again."
            : code === "ALREADY_LINKED" ? "This member already has a technician profile. Check the directory before adding another. Your entries are still here."
            : code === "INELIGIBLE_MEMBER" ? "This member no longer has an active technician account in this workspace. Choose another member or ask an administrator to review their access."
            : "An earlier save may have created this profile. Check the directory before trying again. Your entries are still here." });
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
          : response.status === 403 ? "You don’t have permission to save technicians. Contact your workspace owner."
          : response.status === 404 ? "This technician is no longer available in your workspace. Your entries are still here."
          : "We couldn’t save this technician. Please try again. Your entries are still here." });
        return;
      }

      const result = responseSchema.safeParse(body);
      if (!result.success || (technician && result.data.technician.id !== technician.id) ||
          (selectedMember && result.data.technician.userId !== selectedMember.userId)) {
        setNotice({ kind: "error", message: "We couldn’t confirm the save. Please try again. Your entries are still here." });
        return;
      }
      setSaved(true);
      router.replace(`/technicians/${encodeURIComponent(result.data.technician.id)}`);
      router.refresh();
    } catch {
      setNotice({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again. Your entries are still here." });
    } finally {
      setSaving(false);
    }
  }

  function errorFor(name: keyof TechnicianFormValues) {
    return errors[name] ? <p id={`technician-${name}-error`} role="alert" className="text-xs leading-5 text-destructive">{errors[name]?.message}</p> : null;
  }

  return (
    <>
      <PageHeader
        title={technician ? "Edit technician" : "Add technician"}
        description={technician ? "Keep your field team’s contact details and availability current." : "Link an existing team member to an operational technician profile."}
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Technicians", href: "/technicians" }, { label: technician ? "Edit technician" : "Add technician" }]}
      />

      {!technician && !selectedMember && context && (
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Choose a team member" description="Select an active technician member in this workspace. Their account and role are managed separately." /></CardHeader>
          <CardContent className="space-y-4">
            {context.filterError && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Member page unavailable</AlertTitle><AlertDescription>{context.filterError}</AlertDescription></Alert>}
            {context.members.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {context.members.map((member) => (
                  <li key={member.userId} className="min-w-0">
                    {member.linked ? (
                      <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="min-w-0"><p className="font-medium break-words">{member.displayName}</p><p className="mt-1 text-xs text-muted-foreground break-all">{member.email}</p></div>
                        <span className="text-xs text-muted-foreground">Profile already linked</span>
                      </div>
                    ) : (
                      <button type="button" onClick={() => chooseMember(member)} className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="min-w-0"><span className="block font-medium break-words">{member.displayName}</span><span className="mt-1 block text-xs text-muted-foreground break-all">{member.email}</span></span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">Choose member <ArrowRight aria-hidden="true" className="size-4" /></span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Users} title={context.filterError ? "Return to the first page" : context.memberCursor ? "No eligible members on this page" : "No active technician members yet"}
                description={context.filterError ? "The selected member page is no longer available." : context.memberCursor ? "Try the first page or ask an administrator about team membership." : "An administrator must first add a team member with an active Technician role. Then you can create their operational profile here."}
                className="min-h-56" />
            )}
            <nav aria-label="Team member pages" className="flex flex-wrap gap-2">
              {context.memberCursor && <Link href={memberPageHref()} className={buttonVariants({ variant: "outline" })}>First page</Link>}
              {context.nextMemberCursor && <Link href={memberPageHref(context.nextMemberCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
            </nav>
          </CardContent>
        </Card>
      )}

      {(technician || selectedMember) && (
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-busy={busy} className="space-y-5">
          {notice && <div ref={noticeRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{notice.kind === "session" ? "Sign in to continue" : notice.kind === "conflict" ? "Review before saving" : "Technician wasn’t saved"}</AlertTitle><AlertDescription><p>{notice.message}</p>{notice.kind === "session" && <Link href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}{notice.kind === "conflict" && <Link href={technician ? `${technicianPath}/edit` : "/technicians"} target="_blank" rel="noopener noreferrer">{technician ? "Open latest version in a new tab" : "Check technicians in a new tab"}</Link>}</AlertDescription></Alert></div>}
          <fieldset disabled={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <legend className="sr-only">Technician details</legend>
            <Card>
              <CardHeader className="border-b border-border"><SectionHeading title="Technician details" description="Set the name your team sees and an optional contact number." /></CardHeader>
              <CardContent className="space-y-5">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="technician-displayName">Display name <span aria-hidden="true" className="text-muted-foreground">*</span></Label>
                  <Input id="technician-displayName" autoComplete="name" maxLength={120} required aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? "technician-displayName-error" : "technician-displayName-hint"} {...form.register("displayName")} />
                  {errorFor("displayName") || <p id="technician-displayName-hint" className="text-xs leading-5 text-muted-foreground">Use the name shown in technician directories and assignments.</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="technician-phone">Phone number <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="technician-phone" type="tel" autoComplete="tel" maxLength={32} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "technician-phone-error" : "technician-phone-hint"} {...form.register("phone")} />
                  {errorFor("phone") || <p id="technician-phone-hint" className="text-xs leading-5 text-muted-foreground">Include the country code when needed. This does not change the member’s account phone.</p>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="border-b border-border"><SectionHeading title="Availability" description="Your operations team can update this as work changes." /></CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="technician-status">Status</Label>
                  <select id="technician-status" className={selectStyle} aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? "technician-status-error" : "technician-status-hint"} {...form.register("status")}>
                    {technicianStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  {errorFor("status") || <p id="technician-status-hint" className="text-xs leading-5 text-muted-foreground">{technician ? "Change this as the technician’s working status changes." : "New profiles start Offline until you mark them available."} This does not change account access.</p>}
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">{technician ? "Employee number" : "Linked team member"}</p>
                  <p className="mt-1 text-sm font-medium break-words">{technician ? technician.employeeNumber : selectedMember?.displayName}</p>
                  {selectedMember && <p className="mt-1 text-xs text-muted-foreground break-all">{selectedMember.email}</p>}
                  {selectedMember && <Button type="button" variant="ghost" onClick={chooseAnotherMember} className="mt-3">Choose another member</Button>}
                </div>
              </CardContent>
            </Card>
          </fieldset>
          <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="text-xs leading-5 text-muted-foreground">{saved ? "Technician saved. Opening their record…" : busy ? "Saving technician…" : isDirty ? "You have unsaved changes." : technician ? "This technician profile is up to date." : "The technician profile will be available across this workspace."}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {busy ? <Button type="button" variant="outline" disabled>Cancel</Button> : <Link href={technicianPath} className={buttonVariants({ variant: "outline" })}>Cancel</Link>}
              <Button type="submit" disabled={busy || Boolean(technician && !isDirty)}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{saved ? "Opening technician…" : busy ? "Saving…" : technician ? "Save changes" : "Create technician"}</Button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}
