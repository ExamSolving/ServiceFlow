import { Mail, Pencil, Phone } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { CustomerDetail } from "../types/customer";

function recordDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Not available" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function CustomerDetailView({ customer }: { customer: CustomerDetail }) {
  return (
    <>
      <PageHeader
        title={customer.name}
        description={`${customer.customerNumber} · ${customer.type === "BUSINESS" ? "Business customer" : "Individual customer"}`}
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Customers", href: "/customers" }, { label: "Customer details" }]}
        actions={<Link href={`/customers/${encodeURIComponent(customer.id)}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit customer</Link>}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Customer information" description="Contact details and context for your team." action={<Badge variant={customer.isActive ? "positive" : "neutral"}>{customer.isActive ? "Active" : "Inactive"}</Badge>} /></CardHeader>
          <CardContent>
            <dl className="grid gap-6 sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Phone number</dt><dd className="mt-2"><a href={`tel:${customer.phone.replace(/[^+\d]/g, "")}`} className="inline-flex max-w-full items-start gap-2 rounded py-1 text-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="break-all">{customer.phone}</span></a></dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Email address</dt><dd className="mt-2">{customer.email ? <a href={`mailto:${customer.email}`} className="inline-flex max-w-full items-start gap-2 rounded py-1 text-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="break-all">{customer.email}</span></a> : <span className="text-sm text-muted-foreground">No email address added</span>}</dd></div>
            </dl>
            <section aria-labelledby="customer-notes-heading" className="mt-6 border-t border-border pt-5">
              <SectionHeading id="customer-notes-heading" title="Internal notes" />
              {customer.notes ? <p className="mt-3 text-sm leading-6 break-words whitespace-pre-wrap">{customer.notes}</p> : <p className="mt-3 text-sm leading-6 text-muted-foreground">No notes yet. Add useful service preferences or contact instructions when editing this customer.</p>}
            </section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Customer record" description="A consistent reference for your workspace." /></CardHeader>
          <CardContent>
            <dl className="space-y-5 text-sm">
              <div><dt className="text-xs text-muted-foreground">Customer number</dt><dd className="mt-1.5 font-medium break-all">{customer.customerNumber}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Customer type</dt><dd className="mt-1.5">{customer.type === "BUSINESS" ? "Business" : "Individual"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1.5"><time dateTime={customer.createdAt}>{recordDate(customer.createdAt)}</time></dd></div>
              <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1.5"><time dateTime={customer.updatedAt}>{recordDate(customer.updatedAt)}</time></dd></div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Dates shown in UTC.</p>
            {!customer.isActive && <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">This customer is inactive. Their information is retained, and you can reactivate them by editing the customer.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
