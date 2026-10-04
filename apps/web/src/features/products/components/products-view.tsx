import { ArrowRight, Boxes, Package, Plus, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/src/features/app-shell/components/page-header";
import { formatMoney } from "@/src/lib/billing/money";
import type { ProductListData } from "../types/product";
import { ProductStatus, StockBadge, formatQuantity } from "./product-status";

const selectStyle = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const productHref = (id: string) => `/inventory/products/${encodeURIComponent(id)}`;

function pageHref(data: ProductListData, cursor?: string) {
  const query = new URLSearchParams();
  if (data.filters.q) query.set("q", data.filters.q);
  if (data.filters.status !== "ALL") query.set("status", data.filters.status);
  if (data.filters.stock !== "ALL") query.set("stock", data.filters.stock);
  if (cursor) query.set("cursor", cursor);
  return `/inventory/products${query.size ? `?${query.toString()}` : ""}`;
}

export function ProductsView({ data, currency }: { data: ProductListData; currency: string }) {
  const filtered = Boolean(data.filters.q || data.filters.status !== "ALL" || data.filters.stock !== "ALL");
  return (
    <>
      <PageHeader title="Products" description="Parts, materials and services your team sells, with prices and stock levels."
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Inventory" }, { label: "Products" }]}
        actions={<><Link href="/inventory/stock" className={buttonVariants({ variant: "outline" })}><Boxes aria-hidden="true" />Stock ledger</Link><Link href="/inventory/products/new" className={buttonVariants()}><Plus aria-hidden="true" />Add product</Link></>} />
      <Card className="gap-0 py-0">
        <section aria-labelledby="product-catalog-heading">
          <div className="border-b border-border p-4 sm:p-5">
            <SectionHeading id="product-catalog-heading" title="Catalog" description="Search by the beginning of a product’s name." />
            <Form action="/inventory/products" className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="product-search">Product name</Label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
                  <Input key={data.filters.q} id="product-search" name="q" type="search" defaultValue={data.filters.q} maxLength={120} placeholder="Search by name…" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-status-filter">Status</Label>
                <select key={data.filters.status} id="product-status-filter" name="status" defaultValue={data.filters.status} className={selectStyle}>
                  <option value="ALL">All products</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-stock-filter">Stock</Label>
                <select key={data.filters.stock} id="product-stock-filter" name="stock" defaultValue={data.filters.stock} className={selectStyle}>
                  <option value="ALL">Any</option><option value="TRACKED">Tracked</option><option value="LOW">Low or out of stock</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-1 sm:flex-none">Apply filters</Button>
                {(filtered || data.filters.cursor || data.filterError) && <Link href="/inventory/products" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
              </div>
            </Form>
          </div>

          {data.filterError && <div className="p-4 pb-0 sm:px-5"><Alert variant="destructive"><AlertTitle>Check your filters</AlertTitle><AlertDescription>{data.filterError}</AlertDescription></Alert></div>}

          {data.products.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Products, ordered by name</caption>
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Product</th>
                      <th scope="col" className="px-4 py-3 font-medium">Unit price</th>
                      <th scope="col" className="px-4 py-3 font-medium">Tax</th>
                      <th scope="col" className="px-4 py-3 font-medium">On hand</th>
                      <th scope="col" className="px-4 py-3 font-medium">Stock</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Open product</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.products.map((product) => (
                      <tr key={product.id} className="transition-colors hover:bg-muted/25">
                        <th scope="row" className="max-w-72 px-5 py-4 font-normal">
                          <Link href={productHref(product.id)} className="rounded font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{product.name}</Link>
                          <span className="mt-1 block font-mono text-xs text-muted-foreground">{product.sku}</span>
                        </th>
                        <td className="whitespace-nowrap px-4 py-4 tabular-nums">{formatMoney(product.unitPrice, currency)} <span className="text-xs text-muted-foreground">/ {product.unit}</span></td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">{product.taxRatePercent === null ? "Workspace default" : `${product.taxRatePercent}%`}</td>
                        <td className="whitespace-nowrap px-4 py-4 tabular-nums">{product.trackStock ? formatQuantity(product.quantityOnHand, product.unit) : <span className="text-xs text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-4"><StockBadge product={product} /></td>
                        <td className="px-4 py-4"><ProductStatus active={product.isActive} /></td>
                        <td className="px-5 py-4 text-right"><Link href={productHref(product.id)} aria-label={`View ${product.name}`} className={buttonVariants({ variant: "ghost", size: "icon" })}><ArrowRight aria-hidden="true" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border lg:hidden">
                {data.products.map((product) => (
                  <li key={product.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={productHref(product.id)} className="inline-block rounded py-1 font-medium break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{product.name}</Link>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2"><ProductStatus active={product.isActive} /><StockBadge product={product} /></div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{formatMoney(product.unitPrice, currency)} / {product.unit}{product.trackStock ? ` · ${formatQuantity(product.quantityOnHand, product.unit)} on hand` : ""}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState icon={filtered ? Search : Package}
                title={data.filterError ? "Adjust your filters" : data.filters.cursor ? "You’ve reached the end" : filtered ? "No matching products" : "Build your catalog"}
                description={data.filterError ? "Use valid filters, or clear them to start again." : data.filters.cursor ? "Return to the first page to see your products." : filtered ? "Try a different name, status or stock filter." : "Add the parts, materials and services you sell so quotations and invoices can pick them."}
                className="min-h-64" />
              {!filtered && !data.filters.cursor && !data.filterError && <div className="mt-4 flex justify-center"><Link href="/inventory/products/new" className={buttonVariants()}><Plus aria-hidden="true" />Add your first product</Link></div>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">{data.products.length} {data.products.length === 1 ? "product" : "products"} on this page{data.nextCursor ? " · More available" : ""}</p>
            <nav aria-label="Product pages" className="flex flex-wrap gap-2">
              {data.filters.cursor && <Link href={pageHref(data)} className={buttonVariants({ variant: "outline" })}>First page</Link>}
              {data.nextCursor && <Link href={pageHref(data, data.nextCursor)} className={buttonVariants({ variant: "outline" })}>Next page<ArrowRight aria-hidden="true" /></Link>}
            </nav>
          </div>
        </section>
      </Card>
    </>
  );
}
