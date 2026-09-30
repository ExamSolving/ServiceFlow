import { Pencil } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { ServiceTypeDetail } from "../types/service-type";
import { formatServiceDuration, ServiceTypeStatus } from "./service-type-status";

const date = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));

export function ServiceTypeDetailView({ serviceType }: { serviceType: ServiceTypeDetail }) {
  return <>
    <PageHeader title={serviceType.name} description="Service catalog configuration"
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Service types", href: "/service-types" }, { label: "Service type details" }]}
      actions={<Link href={`/service-types/${encodeURIComponent(serviceType.id)}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit service type</Link>} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
      <Card>
        <CardHeader className="border-b border-border"><SectionHeading title="Service information" description="A shared definition of the work your team offers." action={<ServiceTypeStatus active={serviceType.isActive} />} /></CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Service type name</dt><dd className="mt-2 text-sm break-words">{serviceType.name}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Estimated duration</dt><dd className="mt-2 text-sm">{formatServiceDuration(serviceType.estimatedDurationMinutes)}</dd></div>
            <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Description</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6 break-words">{serviceType.description || <span className="text-muted-foreground">No description added.</span>}</dd></div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b border-border"><SectionHeading title="Catalog record" /></CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6">{serviceType.isActive ? "This service type is active in your catalog." : "This service type is inactive. Its configuration is retained and can be reactivated at any time."}</p>
          <dl className="space-y-4 border-t border-border pt-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1.5"><time dateTime={serviceType.createdAt}>{date(serviceType.createdAt)}</time></dd></div>
            <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1.5"><time dateTime={serviceType.updatedAt}>{date(serviceType.updatedAt)}</time></dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">Dates shown in UTC.</p>
        </CardContent>
      </Card>
    </div>
  </>;
}
