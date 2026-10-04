"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { ROLE_LABELS } from "@/src/lib/auth/permissions";
import { invitableRoles } from "../schemas/member.schema";
import { InvitationLink } from "./invitation-link";

const formSchema = z.object({
  email: z.string().trim().min(3, "Enter an email address.").max(254, "Use 254 characters or fewer.").refine((value) => z.email().safeParse(value).success, "Enter a valid email address."),
  role: z.enum(invitableRoles),
});
type FormValues = z.infer<typeof formSchema>;
const responseSchema = z.object({ invitation: z.object({ id: z.string(), email: z.string(), role: z.enum(invitableRoles), acceptPath: z.string().nullable() }) });
const selectStyle = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const ROLE_HELP: Record<(typeof invitableRoles)[number], string> = {
  ADMIN: "Everything except organization settings.",
  MANAGER: "Customers, technicians, catalog, requests, jobs and inventory.",
  DISPATCHER: "Customers, requests and job dispatch.",
  TECHNICIAN: "Sees assigned work; gets a technician profile.",
  ACCOUNTANT: "Quotations, invoices and payments.",
};

export function InviteMemberForm() {
  const router = useRouter();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; acceptPath: string | null } | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email: "", role: "TECHNICIAN" }, mode: "onBlur" });
  const { errors } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });

  async function onSubmit(values: FormValues) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setCreated(null);
    const nextRequestId = requestId ?? crypto.randomUUID();
    if (!requestId) setRequestId(nextRequestId);
    try {
      const response = await fetch("/api/members/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, requestId: nextRequestId }) });
      if (response.redirected || response.status === 401) { setError("Your session has expired. Sign in again in another tab, then try again."); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "We couldn’t create this invitation. Please try again.";
        if (body && typeof body === "object" && "fieldErrors" in body && body.fieldErrors && typeof body.fieldErrors === "object") {
          const messages = (body.fieldErrors as Record<string, unknown>).email;
          if (Array.isArray(messages) && typeof messages[0] === "string") form.setError("email", { type: "server", message: messages[0] });
        }
        setError(message);
        return;
      }
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) { setError("We couldn’t confirm the invitation. Refresh the page to check pending invitations."); return; }
      setCreated({ email: parsed.data.invitation.email, acceptPath: parsed.data.invitation.acceptPath });
      setRequestId(null);
      form.reset({ email: "", role: values.role });
      router.refresh();
    } catch {
      setError("We couldn’t reach ServiceFlow. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border"><SectionHeading title="Invite a team member" description="Create a one-time link and share it with your colleague." /></CardHeader>
      <CardContent className="space-y-4">
        {created && (created.acceptPath ? <InvitationLink acceptPath={created.acceptPath} email={created.email} /> : (
          <Alert><AlertCircle aria-hidden="true" /><AlertTitle>Invitation already created</AlertTitle><AlertDescription>The link for {created.email} was generated earlier. Use “Regenerate link” in pending invitations to get a new one.</AlertDescription></Alert>
        ))}
        {error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Invitation wasn’t created</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" aria-busy={saving}>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Work email</Label>
            <Input id="invite-email" type="email" autoComplete="off" maxLength={254} placeholder="colleague@company.com" disabled={saving} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "invite-email-error" : undefined} {...form.register("email")} />
            {errors.email && <p id="invite-email-error" role="alert" className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <select id="invite-role" className={selectStyle} disabled={saving} aria-describedby="invite-role-hint" {...form.register("role")}>
              {invitableRoles.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
            </select>
            <p id="invite-role-hint" className="text-xs leading-5 text-muted-foreground">{ROLE_HELP[role]}</p>
          </div>
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Send aria-hidden="true" />}{saving ? "Creating link…" : "Create invitation link"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
