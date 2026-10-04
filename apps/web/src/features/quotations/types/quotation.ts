import type { z } from "zod";

import type { quotationDetailSchema, quotationStatuses } from "../schemas/quotation.schema";

export type QuotationStatus = (typeof quotationStatuses)[number];
export type QuotationDetail = z.infer<typeof quotationDetailSchema>;
export interface QuotationListFilters { q: string; status: "ALL" | QuotationStatus; cursor?: string }
export interface QuotationListData { quotations: QuotationDetail[]; filters: QuotationListFilters; nextCursor: string | null; today: string; filterError?: string }
export interface QuotationContext {
  quotation: QuotationDetail;
  timezone: string;
  /** Today's calendar date in the organization's timezone. */
  today: string;
  canConvert: boolean;
  defaultTaxRatePercent: number;
  quoteValidityDays: number;
}
export type QuotationSearchParams = Record<string, string | string[] | undefined>;
