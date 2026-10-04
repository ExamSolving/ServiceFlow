import { ArrowRight, Boxes, PackageOpen, TriangleAlert } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import type { StockLedgerData } from "../types/product";
import { formatDelta, formatProductDateTime, formatQuantity, movementSourceLabel, movementTypeLabel, movementVariant } from "./product-status";
import { StockMovementForm } from "./stock-movement-form";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function pageHref(data: StockLedgerData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.productId) query.set("productId", data.filters.productId);
  if (data.filters.type !== "ALL") query.set("type", data.filters.type);
  if (cursor) query.set("cursor", cursor);
  return `/inventory/stock${query.size ? `?${query.toString()}` : ""}`;
}

export function StockView({ data }: { data: StockLedgerData }) {
  const filtered = Boolean(data.filters.productId || data.filters.type !== "ALL");
  return <>
    <PageHeader title="Stock" description="A ledger of every stock movement: manual receipts and issues, counts, and invoice deductions."
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Inventory" }, { label: "Stock" }]}
      actions={<Link href="/inventory/products" className={buttonVariants({ variant: "outline" })}><PackageOpen aria-hidden="true" />Products</Link>} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Record a movement" description="Pick a tracked product, then enter what came in, went out, or was counted." action={<Boxes aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader>
          <CardContent><StockMovementForm product={data.product?.trackStock && data.product.isActive ? data.product : undefined} /></CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <section aria-labelledby="stock-ledger-heading">
            <div className="border-b border-border p-4 sm:p-5">
              <SectionHeading id="stock-ledger-heading" title="Movement ledger" description={data.product ? <>Showing movements for <span className="font-medium text-foreground">{data.product.name}</span> ({data.product.sku}).</> : "Newest first, across all products."} />
              <Form action="/inventory/stock" className="mt-5 grid items-end gap-3 sm:grid-cols-[12rem_auto]">
                {data.filters.productId && <input type="hidden" name="productId" value={data.filters.productId} />}
                <div className="space-y-2">
                  <Label htmlFor="stock-type-filter">Type</Label>
                  <select key={data.filters.type} id="stock-type-filter" name="type" defaultValue={data.filters.type} className={selectStyle}>
                    <option value="ALL">All movements</option><option value="IN">Stock in</option><option value="OUT">Stock out</option><option value="ADJUST">Count adjustments</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="outline">Apply</Button>
                  {(filtered || data.filters.cursor || data.filterError) && <Link href="/inventory/stock" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
                </div>
              </Form>
            </div>
            {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}
            {data.movements.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Stock movements, newest first</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">When</th>
                      <th scope="col" className="px-4 py-3 font-medium">Product</th>
                      <th scope="col" className="px-4 py-3 font-medium">Movement</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Change</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">After</th>
                      <th scope="col" className="px-5 py-3 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.movements.map((movement) => (
                      <tr key={movement.id} className="transition-colors hover:bg-muted/25">
                        <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground"><time dateTime={movement.createdAt}>{formatProductDateTime(movement.createdAt)}</time></td>
                        <td className="max-w-56 px-4 py-3"><Link href={`/inventory/products/${encodeURIComponent(movement.productId)}`} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{movement.productName}</Link><span className="mt-0.5 block font-mono text-xs text-muted-foreground">{movement.sku}</span></td>
                        <td className="px-4 py-3"><Badge variant={movementVariant(movement.type)}>{movementTypeLabel(movement.type)}</Badge><span className="mt-1 block text-xs text-muted-foreground">{movementSourceLabel(movement.source)}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatDelta(movement.quantityDelta)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{movement.quantityAfter}</td>
                        <td className="max-w-64 px-5 py-3 text-xs text-muted-foreground"><span className="line-clamp-2 break-words">{movement.invoiceId ? <Link href={`/invoices/${encodeURIComponent(movement.invoiceId)}`} className="text-primary underline">{movement.reference}</Link> : [movement.reference, movement.reason].filter(Boolean).join(" · ") || "—"}</span><span className="mt-0.5 block">{movement.createdByName || "Team member"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 sm:p-5"><EmptyState icon={Boxes} title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching movements" : "No stock movements yet"} description={data.filterError ? "Use valid filters, or clear them to start again." : data.filters.cursor ? "Return to the first page to see recent movements." : filtered ? "Try another type or clear the product filter." : "Record a receipt above, or issue an invoice with tracked products, to start the ledger."} className="min-h-56" /></div>
            )}
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-muted-foreground">{data.movements.length} {data.movements.length === 1 ? "movement" : "movements"} on this page{data.nextCursor ? " · More available" : ""}</p>
              <nav aria-label="Stock pages" className="flex flex-wrap gap-2">
                {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
                {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
              </nav>
            </div>
          </section>
        </Card>
      </div>
      <Card>
        <CardHeader className="border-b border-border"><SectionHeading title="Low stock" description="Active products at or below their reorder level." action={<TriangleAlert aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader>
        <CardContent>
          {data.lowStock.length ? (
            <ul className="divide-y divide-border">
              {data.lowStock.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 text-sm">
                  <div className="min-w-0"><Link href={`/inventory/products/${encodeURIComponent(product.id)}`} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{product.name}</Link><p className="mt-0.5 text-xs text-muted-foreground">Reorder at {formatQuantity(product.reorderLevel, product.unit)}</p></div>
                  <Badge variant={product.quantityOnHand <= 0 ? "destructive" : "attention"}>{formatQuantity(product.quantityOnHand, product.unit)}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={TriangleAlert} title="Stock levels look healthy" description="Products drop in here when they reach their reorder level." className="min-h-28" />}
        </CardContent>
      </Card>
    </div>
  </>;
}
