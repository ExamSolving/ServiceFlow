import Link from "next/link";

import { formatMoney } from "@/src/lib/billing/money";
import type { LineItem } from "@/src/lib/billing/line-items";
import { formatPercent, formatQuantity } from "./billing-format";

export function LineItemsTable({ items, currency, subtotal, taxTotal, total, footer, linkProducts = false }: {
  items: LineItem[]; currency: string; subtotal: number; taxTotal: number; total: number; footer?: React.ReactNode; linkProducts?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Line items</caption>
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">Item</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Qty</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Unit price</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Tax</th>
            <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item, index) => (
            <tr key={index}>
              <td className="max-w-md px-5 py-3"><span className="block break-words">{item.description}</span>{item.productId && (linkProducts ? <Link href={`/inventory/products/${encodeURIComponent(item.productId)}`} className="mt-0.5 block text-xs text-primary underline">Catalog item</Link> : <span className="mt-0.5 block text-xs text-muted-foreground">Catalog item</span>)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatQuantity(item.quantity)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(item.unitPrice, currency)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">{formatPercent(item.taxRatePercent)}</td>
              <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums">{formatMoney(item.lineSubtotal, currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border text-sm">
          <tr><th scope="row" colSpan={4} className="px-5 py-2 text-right font-normal text-muted-foreground">Subtotal</th><td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">{formatMoney(subtotal, currency)}</td></tr>
          <tr><th scope="row" colSpan={4} className="px-5 py-2 text-right font-normal text-muted-foreground">Tax</th><td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">{formatMoney(taxTotal, currency)}</td></tr>
          <tr className="border-t border-border"><th scope="row" colSpan={4} className="px-5 py-3 text-right font-semibold">Total</th><td className="whitespace-nowrap px-5 py-3 text-right font-heading text-base font-semibold tabular-nums">{formatMoney(total, currency)}</td></tr>
          {footer}
        </tfoot>
      </table>
    </div>
  );
}
