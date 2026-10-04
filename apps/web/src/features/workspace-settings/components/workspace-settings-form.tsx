"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Info, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { CURRENCY_OPTIONS, workspaceSettingsFormSchema, type WorkspaceSettingsInput } from "../schemas/workspace-settings.schema";
import type { WorkspaceSettingsData } from "../types/workspace-settings";

type Notice = { type: "success" | "error"; message: string } | null;
const fieldNames = ["currency", "defaultTaxRatePercent", "quoteValidityDays", "invoiceDueDays", "businessHoursStart", "businessHoursEnd", "weekStartsOn"] as const;
const selectStyle = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60";

export function WorkspaceSettingsForm({ data }: { data: WorkspaceSettingsData }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [isSaving, setIsSaving] = useState(false);
  const form = useForm<WorkspaceSettingsInput>({
    resolver: zodResolver(workspaceSettingsFormSchema),
    defaultValues: { ...data.settings },
    mode: "onBlur",
  });
  const errors = form.formState.errors;

  async function onSubmit(values: WorkspaceSettingsInput) {
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "We couldn’t save your workspace settings. Please try again.";
        if (body && typeof body === "object" && "fieldErrors" in body && body.fieldErrors && typeof body.fieldErrors === "object") {
          for (const name of fieldNames) {
            const messages = (body.fieldErrors as Record<string, unknown>)[name];
            if (Array.isArray(messages) && typeof messages[0] === "string") form.setError(name, { type: "server", message: messages[0] });
          }
        }
        setNotice({ type: "error", message });
        return;
      }
      form.reset(values);
      setNotice({ type: "success", message: "Workspace settings saved." });
      router.refresh();
    } catch {
      setNotice({ type: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    } finally {
      setIsSaving(false);
    }
  }

  function error(name: (typeof fieldNames)[number]) {
    const message = errors[name]?.message;
    return message ? <p id={`workspace-${name}-error`} role="alert" className="text-xs text-destructive">{message}</p> : null;
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} aria-busy={isSaving}>
      {notice?.type === "success" && <Alert className="border-primary/25 bg-primary/5 text-foreground"><CheckCircle2 aria-hidden="true" className="text-primary" /><AlertTitle>Changes saved</AlertTitle><AlertDescription>{notice.message}</AlertDescription></Alert>}
      {notice?.type === "error" && <Alert variant="destructive"><Info aria-hidden="true" /><AlertTitle>We couldn’t save those changes</AlertTitle><AlertDescription>{notice.message}</AlertDescription></Alert>}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border/70"><SectionHeading eyebrow="Billing defaults" title="Currency and tax" description="Used when new quotations and invoices are created." /></CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="space-y-2">
              <Label htmlFor="workspace-currency">Currency</Label>
              <select id="workspace-currency" className={selectStyle} aria-invalid={Boolean(errors.currency)} aria-describedby={errors.currency ? "workspace-currency-error" : "workspace-currency-hint"} {...form.register("currency")}>
                {CURRENCY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {error("currency") || <p id="workspace-currency-hint" className="text-xs leading-5 text-muted-foreground">Existing documents keep the currency they were issued in.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-tax">Default tax rate (%)</Label>
              <Input id="workspace-tax" type="number" inputMode="decimal" step="0.01" min={0} max={100} aria-invalid={Boolean(errors.defaultTaxRatePercent)} aria-describedby={errors.defaultTaxRatePercent ? "workspace-defaultTaxRatePercent-error" : "workspace-tax-hint"} {...form.register("defaultTaxRatePercent", { valueAsNumber: true })} />
              {error("defaultTaxRatePercent") || <p id="workspace-tax-hint" className="text-xs leading-5 text-muted-foreground">Applied to new line items; each line can override it.</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="workspace-quote-days">Quote validity (days)</Label>
                <Input id="workspace-quote-days" type="number" inputMode="numeric" min={1} max={365} aria-invalid={Boolean(errors.quoteValidityDays)} aria-describedby={errors.quoteValidityDays ? "workspace-quoteValidityDays-error" : undefined} {...form.register("quoteValidityDays", { valueAsNumber: true })} />
                {error("quoteValidityDays")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-due-days">Invoice due (days)</Label>
                <Input id="workspace-due-days" type="number" inputMode="numeric" min={0} max={365} aria-invalid={Boolean(errors.invoiceDueDays)} aria-describedby={errors.invoiceDueDays ? "workspace-invoiceDueDays-error" : undefined} {...form.register("invoiceDueDays", { valueAsNumber: true })} />
                {error("invoiceDueDays")}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/70"><SectionHeading eyebrow="Scheduling" title="Working hours" description={`Shown on the schedule in ${data.timezone}. Change the timezone under Organization.`} /></CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="workspace-hours-start">Opens</Label>
                <Input id="workspace-hours-start" type="time" aria-invalid={Boolean(errors.businessHoursStart)} aria-describedby={errors.businessHoursStart ? "workspace-businessHoursStart-error" : undefined} {...form.register("businessHoursStart")} />
                {error("businessHoursStart")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-hours-end">Closes</Label>
                <Input id="workspace-hours-end" type="time" aria-invalid={Boolean(errors.businessHoursEnd)} aria-describedby={errors.businessHoursEnd ? "workspace-businessHoursEnd-error" : undefined} {...form.register("businessHoursEnd")} />
                {error("businessHoursEnd")}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-week-start">Week starts on</Label>
              <select id="workspace-week-start" className={selectStyle} aria-invalid={Boolean(errors.weekStartsOn)} {...form.register("weekStartsOn", { valueAsNumber: true })}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
              {error("weekStartsOn")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm font-medium">Apply workspace preferences</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Changes are recorded in the organization audit history.</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => { form.reset(); setNotice(null); }} disabled={isSaving || !form.formState.isDirty}><RotateCcw aria-hidden="true" />Reset</Button>
            <Button type="submit" disabled={isSaving || !form.formState.isDirty}><Save aria-hidden="true" />{isSaving ? "Saving…" : "Save changes"}</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
