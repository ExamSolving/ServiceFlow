import { Pencil, Phone } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { TechnicianDetail } from "../types/technician";
import { TechnicianStatus, technicianStatuses } from "./technician-status";

function recordDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not available" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function TechnicianDetailView({ technician }: { technician: TechnicianDetail }) {
  const status = technicianStatuses.find((item) => item.value === technician.status)!;
  return (
    <>
      <PageHeader title={technician.displayName} description={`${technician.employeeNumber} · Technician profile`}
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Technicians", href: "/technicians" }, { label: "Technician details" }]}
        actions={<Link href={`/technicians/${encodeURIComponent(technician.id)}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit technician</Link>} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Technician information" description="Contact details and availability for your operations team." action={<TechnicianStatus status={technician.status} />} /></CardHeader>
          <CardContent>
            <dl className="grid gap-6 sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Display name</dt><dd className="mt-2 text-sm break-words">{technician.displayName}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Phone number</dt><dd className="mt-2">{technician.phone ? <a href={`tel:${technician.phone.replace(/[^+\d]/g, "")}`} className="inline-flex max-w-full items-start gap-2 rounded py-1 text-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="break-all">{technician.phone}</span></a> : <span className="text-sm text-muted-foreground">No phone number added</span>}</dd></div>
            </dl>
            <section aria-labelledby="technician-availability-heading" className="mt-6 border-t border-border pt-5">
              <SectionHeading id="technician-availability-heading" title="Availability" />
              <p className="mt-3 text-sm leading-6">{status.description}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Availability is maintained by your operations team. Update it when the technician’s working status changes.</p>
            </section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Technician record" description="A consistent reference for your workspace." /></CardHeader>
          <CardContent>
            <dl className="space-y-5 text-sm">
              <div><dt className="text-xs text-muted-foreground">Employee number</dt><dd className="mt-1.5 font-medium break-all">{technician.employeeNumber}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Account</dt><dd className="mt-1.5">Linked team member</dd></div>
              <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1.5"><time dateTime={technician.createdAt}>{recordDate(technician.createdAt)}</time></dd></div>
              <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1.5"><time dateTime={technician.updatedAt}>{recordDate(technician.updatedAt)}</time></dd></div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Dates shown in UTC.</p>
            {technician.status === "INACTIVE" && <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">This profile is inactive. Edit the technician to return them to active operations. Account access is managed separately.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
