import type { z } from "zod";

import type { paymentDetailSchema, paymentMethods } from "../schemas/payment.schema";

export type PaymentMethod = (typeof paymentMethods)[number];
export type PaymentDetail = z.infer<typeof paymentDetailSchema>;
export interface PaymentListFilters { method: "ALL" | PaymentMethod; invoiceId?: string; cursor?: string }
export interface PaymentListData { payments: PaymentDetail[]; filters: PaymentListFilters; nextCursor: string | null; timezone: string; filterError?: string }
export type PaymentSearchParams = Record<string, string | string[] | undefined>;
