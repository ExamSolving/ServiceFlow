import "server-only";

import { adminDb } from "@/src/lib/firebase/admin";
import { hasPermission } from "@/src/lib/auth/permissions";
import type { AppSession } from "@/src/features/auth/types/app-session";
import { AggregateField, type DocumentData, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { readBillingSettings } from "@/src/features/billing/repositories/billing-settings";
import { roundMoney } from "@/src/lib/billing/money";
import { dashboardJobSchema, dashboardSettingsSchema, dashboardTechnicianSchema } from "../schemas/dashboard.schema";
import type { DashboardFinance, DashboardJob, DashboardOperations, DashboardTeam } from "../types/dashboard";

function tenantQuery(collection: string, session: AppSession): Query<DocumentData> {
  if (!session.organizationId) throw new Error("Missing trusted tenant context");
  return adminDb.collection(collection).where("organizationId", "==", session.organizationId);
}
function assertOrganization(organizationId: string, session: AppSession) {
  if (organizationId !== session.organizationId) throw new Error("Tenant ownership mismatch");
}
function requireOperations(session: AppSession) {
  if (!hasPermission(session.role,"dispatchJobs")) throw new Error("Dashboard operation access denied");
}
function requireFinance(session: AppSession) {
  if (!hasPermission(session.role,"viewFinancials")) throw new Error("Dashboard finance access denied");
}
async function sum(query: Query<DocumentData>, field: string): Promise<number> {
  const result = await query.aggregate({ total: AggregateField.sum(field) }).get();
  const value = result.data().total;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid aggregate response");
  return roundMoney(value);
}
async function count(query: Query<DocumentData>): Promise<number> {
  const result = await query.count().get();
  const value = result.data().count;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid aggregate response");
  return value;
}
function job(document: QueryDocumentSnapshot, session: AppSession, technicianId?: string): DashboardJob {
  const value = dashboardJobSchema.parse(document.data());
  assertOrganization(value.organizationId,session);
  if (technicianId && value.assignedTechnicianId !== technicianId) throw new Error("Job assignment mismatch");
  return {id:document.id,jobNumber:value.jobNumber,title:value.title,status:value.status,priority:value.priority,scheduledAt:value.scheduledAt,createdAt:value.createdAt};
}

export async function readDashboardTimezone(session: AppSession): Promise<{timezone:string;defaulted:boolean}> {
  const snapshot = await adminDb.collection("organizationSettings").doc(session.organizationId).get();
  if (!snapshot.exists) return {timezone:"UTC",defaulted:true};
  const settings=dashboardSettingsSchema.parse(snapshot.data());
  assertOrganization(settings.organizationId,session);
  return {timezone:settings.timezone??"UTC",defaulted:!settings.timezone};
}

export async function readOperations(session:AppSession, range:{start:Date;end:Date}):Promise<DashboardOperations>{
  let jobs=tenantQuery("jobs",session);
  let technicianId: string | undefined;
  const scope=session.role==="TECHNICIAN"?"assigned":"organization";
  if(scope==="assigned"){
    const technicians=await tenantQuery("technicians",session).where("userId","==",session.uid).limit(2).get();
    if(technicians.size>1)throw new Error("Ambiguous technician identity");
    if(technicians.empty)return emptyAssignedOperations();
    const document=technicians.docs[0];
    const technician=dashboardTechnicianSchema.parse(document.data());
    assertOrganization(technician.organizationId,session);
    if(technician.userId!==session.uid)throw new Error("Technician identity mismatch");
    if(technician.status==="INACTIVE")return emptyAssignedOperations();
    technicianId=document.id;
    jobs=jobs.where("assignedTechnicianId","==",technicianId);
  }else{
    requireOperations(session);
  }
  const dayJobs=jobs.where("scheduledAt",">=",range.start).where("scheduledAt","<",range.end);
  const [todayJobs,schedule,recent,waitingApproval,onHold,newJobs]=await Promise.all([
    count(dayJobs),dayJobs.orderBy("scheduledAt","asc").limit(12).get(),jobs.orderBy("createdAt","desc").limit(8).get(),
    count(jobs.where("status","==","WAITING_APPROVAL")),count(jobs.where("status","==","ON_HOLD")),count(jobs.where("status","==","NEW")),
  ]);
  return {scope,todayJobs,schedule:schedule.docs.map(doc=>job(doc,session,technicianId)),recentJobs:recent.docs.map(doc=>job(doc,session,technicianId)),waitingApproval,onHold,newJobs};
}
function emptyAssignedOperations():DashboardOperations{return {scope:"assigned",todayJobs:0,schedule:[],recentJobs:[],waitingApproval:0,onHold:0,newJobs:0};}

export async function readTeam(session:AppSession):Promise<DashboardTeam>{
  requireOperations(session);
  const active=tenantQuery("technicians",session).where("status","in",["AVAILABLE","BUSY","OFFLINE","ON_LEAVE"]);
  const [activeCount,snapshot]=await Promise.all([count(active),active.orderBy("displayName","asc").limit(8).get()]);
  return {activeCount,technicians:snapshot.docs.map(document=>{
    const data=dashboardTechnicianSchema.parse(document.data());assertOrganization(data.organizationId,session);
    return {id:document.id,displayName:data.displayName,status:data.status};
  })};
}
export async function readOpenRequests(session:AppSession):Promise<{openCount:number}>{
  requireOperations(session);
  return {openCount:await count(tenantQuery("serviceRequests",session).where("status","in",["NEW","REVIEWING"]))};
}

/** Billing snapshot: what is quoted, what is owed, what came in. Dates are calendar dates in the organization timezone. */
export async function readFinance(session:AppSession, today:string, since:Date):Promise<DashboardFinance>{
  requireFinance(session);
  const open=tenantQuery("invoices",session).where("status","in",["ISSUED","PARTIALLY_PAID"]);
  const [settings,pendingQuotations,openInvoices,outstandingAmount,overdueInvoices,collectedLast30Days]=await Promise.all([
    readBillingSettings(session.organizationId),
    count(tenantQuery("quotations",session).where("status","==","SENT")),
    count(open),sum(open,"balanceDue"),count(open.where("dueAt","<",today)),
    sum(tenantQuery("payments",session).where("paidAt",">=",since),"amount"),
  ]);
  return {currency:settings.currency,pendingQuotations,openInvoices,outstandingAmount,overdueInvoices,collectedLast30Days};
}
