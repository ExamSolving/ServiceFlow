import { Boxes, History, Pencil } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { formatMoney } from "@/src/lib/billing/money";
import type { ProductContext } from "../types/product";
import { ProductStatus, StockBadge, formatDelta, formatProductDate, formatProductDateTime, formatQuantity, movementSourceLabel, movementTypeLabel, movementVariant } from "./product-status";
import { StockMovementForm } from "./stock-movement-form";

export function ProductDetailView({ context }: { context: ProductContext }) {
  const { product, movements, currency, defaultTaxRatePercent } = context;
  return <>
    <PageHeader title={product.name} description={product.sku}
      breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Inventory" }, { label: "Products", href: "/inventory/products" }, { label: product.sku }]}
      actions={<><Link href={`/inventory/stock?productId=${encodeURIComponent(product.id)}`} className={buttonVariants({ variant: "outline" })}><Boxes aria-hidden="true" />Stock history</Link><Link href={`/inventory/products/${encodeURIComponent(product.id)}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil aria-hidden="true" />Edit product</Link></>} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Product information" description="Picked on quotations and invoices as a line item." action={<ProductStatus active={product.isActive} />} /></CardHeader>
          <CardContent>
            <dl className="grid gap-6 sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Unit price</dt><dd className="mt-2 text-sm font-medium tabular-nums">{formatMoney(product.unitPrice, currency)} <span className="font-normal text-muted-foreground">/ {product.unit}</span></dd></div>
              <div><dt className="text-xs text-muted-foreground">Tax rate</dt><dd className="mt-2 text-sm">{product.taxRatePercent === null ? <>{defaultTaxRatePercent}% <span className="text-xs text-muted-foreground">(workspace default)</span></> : `${product.taxRatePercent}%`}</dd></div>
              <div><dt className="text-xs text-muted-foreground">SKU</dt><dd className="mt-2 font-mono text-sm">{product.sku}</dd></div>
              <div className="min-w-0 border-t border-border pt-5 sm:col-span-3"><dt className="text-xs text-muted-foreground">Description</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6 break-words">{product.description || <span className="text-muted-foreground">No description added.</span>}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Record a stock movement" description={product.trackStock ? "Receipts, issues and count corrections update the quantity on hand immediately." : "This product does not track stock."} action={<Boxes aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader>
          <CardContent><StockMovementForm key={`${product.id}:${product.version}`} product={product} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Recent movements" description="Latest ten entries for this product." action={<History aria-hidden="true" className="size-4 text-muted-foreground" />} /></CardHeader>
          <CardContent>
            {movements.length ? (
              <ol className="divide-y divide-border">
                {movements.map((movement) => (
                  <li key={movement.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0 text-sm">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><Badge variant={movementVariant(movement.type)}>{movementTypeLabel(movement.type)}</Badge><span className="text-xs text-muted-foreground">{movementSourceLabel(movement.source)}</span></p>
                      <p className="mt-1.5 text-xs text-muted-foreground break-words">{[movement.reference, movement.reason].filter(Boolean).join(" · ") || "No reference"} · {movement.createdByName || "Team member"} · <time dateTime={movement.createdAt}>{formatProductDateTime(movement.createdAt)}</time></p>
                    </div>
                    <p className="text-right tabular-nums"><span className="font-medium">{formatDelta(movement.quantityDelta)}</span><span className="block text-xs text-muted-foreground">{movement.quantityAfter} {product.unit} after</span></p>
                  </li>
                ))}
              </ol>
            ) : <EmptyState icon={History} title="No movements yet" description="Stock receipts, issues and invoice deductions will be listed here." className="min-h-28" />}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader className="border-b border-border"><SectionHeading title="Stock" action={<StockBadge product={product} />} /></CardHeader>
          <CardContent className="space-y-5">
            {product.trackStock ? <>
              <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{formatQuantity(product.quantityOnHand, product.unit)}</p>
              <dl className="space-y-4 border-t border-border pt-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Reorder level</dt><dd className="mt-1.5">{formatQuantity(product.reorderLevel, product.unit)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Stock value</dt><dd className="mt-1.5 tabular-nums">{formatMoney(product.quantityOnHand * product.unitPrice, currency)}</dd></div>
              </dl>
            </> : <p className="text-sm leading-6 text-muted-foreground">Stock is not tracked for this product. Invoices never change its quantity.</p>}
            <dl className="space-y-4 border-t border-border pt-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1.5"><time dateTime={product.createdAt}>{formatProductDate(product.createdAt)}</time></dd></div>
              <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1.5"><time dateTime={product.updatedAt}>{formatProductDate(product.updatedAt)}</time></dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">Dates shown in UTC.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </>;
}
