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
import {
  organizationSettingsFormSchema,
  type OrganizationSettingsInput,
} from "../schemas/organization-settings.schema";
import {
  TIMEZONE_OPTIONS,
  type OrganizationSettingsData,
  type OrganizationSettingsFormValues,
} from "../types/organization-settings";

type Notice =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

const fieldNames = [
  "name",
  "timezone",
  "jobNumberPrefix",
  "invoiceNumberPrefix",
  "quotationNumberPrefix",
] as const;

function fieldError(
  errors: ReturnType<
    typeof useForm<OrganizationSettingsFormValues>
  >["formState"]["errors"],
  name: (typeof fieldNames)[number],
) {
  return errors[name]?.message;
}

export function OrganizationSettingsForm({
  data,
}: {
  data: OrganizationSettingsData;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [isSaving, setIsSaving] = useState(false);
  const form = useForm<OrganizationSettingsFormValues>({
    resolver: zodResolver(organizationSettingsFormSchema),
    defaultValues: {
      name: data.organization.name,
      timezone: data.settings.timezone,
      jobNumberPrefix: data.settings.jobNumberPrefix,
      invoiceNumberPrefix: data.settings.invoiceNumberPrefix,
      quotationNumberPrefix: data.settings.quotationNumberPrefix,
    },
    mode: "onBlur",
  });
  const errors = form.formState.errors;
  const timezoneOptions = TIMEZONE_OPTIONS.some(
    (option) => option.value === data.settings.timezone,
  )
    ? TIMEZONE_OPTIONS
    : [
        {
          value: data.settings.timezone,
          label: data.settings.timezone,
        },
        ...TIMEZONE_OPTIONS,
      ];

  async function onSubmit(values: OrganizationSettingsInput) {
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : "We couldn’t save your organization settings. Please try again.";
        if (
          body &&
          typeof body === "object" &&
          "fieldErrors" in body &&
          body.fieldErrors &&
          typeof body.fieldErrors === "object"
        ) {
          for (const name of fieldNames) {
            const messages = (body.fieldErrors as Record<string, unknown>)[name];
            if (Array.isArray(messages) && typeof messages[0] === "string") {
              form.setError(name, { type: "server", message: messages[0] });
            }
          }
        }
        setNotice({ type: "error", message });
        return;
      }
      form.reset(values);
      setNotice({ type: "success", message: "Organization settings saved." });
      router.refresh();
    } catch {
      setNotice({
        type: "error",
        message: "We couldn’t reach ServiceFlow. Check your connection and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function resetForm() {
    form.reset();
    setNotice(null);
  }

  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit(onSubmit)}
      aria-busy={isSaving}
    >
      {notice?.type === "success" && (
        <Alert className="border-primary/25 bg-primary/5 text-foreground">
          <CheckCircle2 aria-hidden="true" className="text-primary" />
          <AlertTitle>Changes saved</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      )}
      {notice?.type === "error" && (
        <Alert variant="destructive">
          <Info aria-hidden="true" />
          <AlertTitle>We couldn’t save those changes</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border/70">
            <SectionHeading
              eyebrow="Workspace identity"
              title="Organization profile"
              description="The name your team sees across ServiceFlow."
            />
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="space-y-2">
              <Label htmlFor="organization-name">Organization name</Label>
              <Input
                id="organization-name"
                autoComplete="organization"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "organization-name-error" : undefined}
                {...form.register("name")}
              />
              {fieldError(errors, "name") && (
                <p id="organization-name-error" role="alert" className="text-xs text-destructive">
                  {fieldError(errors, "name")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization-slug">Workspace slug</Label>
              <Input
                id="organization-slug"
                value={data.organization.slug}
                readOnly
                disabled
                aria-describedby="organization-slug-hint"
              />
              <p id="organization-slug-hint" className="text-xs leading-5 text-muted-foreground">
                This stable identifier is used in internal links and cannot be edited here.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/70">
            <SectionHeading
              eyebrow="Workspace defaults"
              title="Regional preferences"
              description="Choose how dates and future work numbers are displayed."
            />
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="space-y-2">
              <Label htmlFor="organization-timezone">Timezone</Label>
              <select
                id="organization-timezone"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60"
                aria-invalid={Boolean(errors.timezone)}
                aria-describedby={errors.timezone ? "organization-timezone-error" : "organization-timezone-hint"}
                {...form.register("timezone")}
              >
                {timezoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldError(errors, "timezone") ? (
                <p id="organization-timezone-error" role="alert" className="text-xs text-destructive">
                  {fieldError(errors, "timezone")}
                </p>
              ) : (
                <p id="organization-timezone-hint" className="text-xs leading-5 text-muted-foreground">
                  Used for dashboard dates and scheduling views.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {([
                ["jobNumberPrefix", "Job prefix"],
                ["invoiceNumberPrefix", "Invoice prefix"],
                ["quotationNumberPrefix", "Quote prefix"],
              ] as const).map(([name, label]) => {
                const error = fieldError(errors, name);
                const id = `organization-${name}`;
                return (
                  <div key={name} className="space-y-2">
                    <Label htmlFor={id}>{label}</Label>
                    <Input
                      id={id}
                      maxLength={8}
                      autoCapitalize="characters"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : `${id}-hint`}
                      {...form.register(name)}
                    />
                    {error ? (
                      <p id={`${id}-error`} role="alert" className="text-xs leading-4 text-destructive">
                        {error}
                      </p>
                    ) : (
                      <p id={`${id}-hint`} className="text-xs leading-4 text-muted-foreground">
                        2–8 characters
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm font-medium">Ready to apply your workspace defaults?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Changes are recorded in the organization audit history.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              disabled={isSaving || !form.formState.isDirty}
            >
              <RotateCcw aria-hidden="true" />
              Reset
            </Button>
            <Button type="submit" disabled={isSaving || !form.formState.isDirty}>
              <Save aria-hidden="true" />
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
