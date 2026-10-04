import { ArrowUpRight, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { ServiceRequestDetail } from "../types/service-request";
import { canEditServiceRequest } from "../utils/request-workflow";
import { ServiceRequestActions } from "./service-request-actions";
import { formatRequestDate, ServiceRequestPriority, serviceRequestPriorityOptions, ServiceRequestStatus, serviceRequestStatusOptions } from "./service-request-status";

export function ServiceRequestDetailView({ serviceRequest }: { serviceRequest: ServiceRequestDetail }) {
  const editable = canEditServiceRequest(serviceRequest.status);
  const status = serviceRequestStatusOptions.find((option) => option.value === serviceRequest.status)!;
  const priority = serviceRequestPriorityOptions.find((option) => option.value === serviceRequest.priority)!;
  return <>
    <PageHeader title={serviceRequest.title} description="Service request"
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Service requests", href: "/service-requests" }, { label: "Request details" }]}
      actions={editable ? <><Link href={`/service-requests/${encodeURIComponent(serviceRequest.id)}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit request</Link><Link href={`/jobs/new?serviceRequestId=${encodeURIComponent(serviceRequest.id)}`} className={buttonVariants()}><Plus aria-hidden="true" />Create job</Link></> : serviceRequest.convertedJobId ? <Link href={`/jobs/${encodeURIComponent(serviceRequest.convertedJobId)}`} className={buttonVariants()}>View job<ArrowUpRight aria-hidden="true" /></Link> : undefined} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Card>
        <CardHeader className="border-b border-border"><SectionHeading title="Request details" description="What the customer asked for and how urgent it is." action={<ServiceRequestPriority priority={serviceRequest.priority} />} /></CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Customer</dt>
              <dd className="mt-2 text-sm break-words">
                <Link href={`/customers/${encodeURIComponent(serviceRequest.customerId)}`} className="inline-flex items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{serviceRequest.customerName}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
                <span className="mt-1 block text-xs text-muted-foreground">{serviceRequest.customerNumber}</span>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Service type</dt>
              <dd className="mt-2 text-sm break-words">
                <Link href={`/service-types/${encodeURIComponent(serviceRequest.serviceTypeId)}`} className="inline-flex items-center gap-1 rounded font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{serviceRequest.serviceTypeName}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
              </dd>
            </div>
            <div><dt className="text-xs text-muted-foreground">Priority</dt><dd className="mt-2 text-sm">{priority.label} <span className="text-muted-foreground">· {priority.description}</span></dd></div>
            <div><dt className="text-xs text-muted-foreground">Requested</dt><dd className="mt-2 text-sm"><time dateTime={serviceRequest.requestedAt}>{formatRequestDate(serviceRequest.requestedAt)}</time></dd></div>
            <div className="min-w-0 border-t border-border pt-5 sm:col-span-2"><dt className="text-xs text-muted-foreground">Description</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6 break-words">{serviceRequest.description}</dd></div>
          </dl>
          <p className="mt-5 text-xs text-muted-foreground">Customer and service type names are captured when the request is saved. Open the linked records for current details.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b border-border"><SectionHeading title="Status" action={<ServiceRequestStatus status={serviceRequest.status} />} /></CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6">{status.description}</p>
          <ServiceRequestActions key={`${serviceRequest.id}:${serviceRequest.version}`} serviceRequest={serviceRequest} />
          <dl className="space-y-4 border-t border-border pt-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1.5"><time dateTime={serviceRequest.createdAt}>{formatRequestDate(serviceRequest.createdAt)}</time></dd></div>
            <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1.5"><time dateTime={serviceRequest.updatedAt}>{formatRequestDate(serviceRequest.updatedAt)}</time></dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">Dates shown in UTC.</p>
        </CardContent>
      </Card>
    </div>
  </>;
}
