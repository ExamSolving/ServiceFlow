import "server-only";

import { notFound } from "next/navigation";
import { requirePermission } from "@/src/lib/auth/authorization";
import { TechnicianCursorError, TechnicianNotFoundError } from "../repositories/technician-errors";
import { listTechnicians, listTechnicianMembers, readTechnician } from "../repositories/technician.repository";
import { technicianListFiltersSchema, technicianMemberFiltersSchema } from "../schemas/technician.schema";
import type { TechnicianDetail, TechnicianFormContext, TechnicianListData, TechnicianSearchParams } from "../types/technician";

export async function getTechniciansPage(rawSearchParams: TechnicianSearchParams = {}): Promise<TechnicianListData> {
  const session = await requirePermission("manageTechnicians");
  const parsed = technicianListFiltersSchema.safeParse({ q: rawSearchParams.q, status: rawSearchParams.status, cursor: rawSearchParams.cursor });
  if (!parsed.success) {
    return { technicians: [], filters: { q: "", status: "ALL" }, nextCursor: null, filterError: "These filters are invalid. Clear them and try again." };
  }
  try {
    return await listTechnicians(session, parsed.data);
  } catch (error) {
    if (error instanceof TechnicianCursorError) {
      return { technicians: [], filters: parsed.data, nextCursor: null, filterError: "This page is no longer available. Return to the first page to continue." };
    }
    console.error("[TECHNICIANS] List failed", error);
    throw new Error("We couldn’t load technicians. Please try again.");
  }
}

export async function getTechnician(technicianId: string): Promise<TechnicianDetail> {
  const session = await requirePermission("manageTechnicians");
  try {
    return await readTechnician(session, technicianId);
  } catch (error) {
    if (error instanceof TechnicianNotFoundError) notFound();
    console.error("[TECHNICIANS] Detail failed", error);
    throw new Error("We couldn’t load this technician. Please try again.");
  }
}

export async function getTechnicianFormContext(rawSearchParams: TechnicianSearchParams = {}): Promise<TechnicianFormContext> {
  const session = await requirePermission("manageTechnicians");
  const parsed = technicianMemberFiltersSchema.safeParse({ memberCursor: rawSearchParams.memberCursor });
  if (!parsed.success) {
    return { members: [], nextMemberCursor: null, filterError: "This member page is invalid. Return to the first page to continue." };
  }
  try {
    return await listTechnicianMembers(session, parsed.data);
  } catch (error) {
    if (error instanceof TechnicianCursorError) {
      return { members: [], memberCursor: parsed.data.memberCursor, nextMemberCursor: null, filterError: "This member page is no longer available. Return to the first page to continue." };
    }
    console.error("[TECHNICIANS] Members failed", error);
    throw new Error("We couldn’t load available team members. Please try again.");
  }
}
