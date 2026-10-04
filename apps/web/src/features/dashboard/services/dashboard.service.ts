import "server-only";

import { requirePermission } from "@/src/lib/auth/authorization";
import { hasPermission } from "@/src/lib/auth/permissions";
import { calendarDateSchema } from "../schemas/dashboard.schema";
import { dayRange, localDate } from "../utils/date";
import { readDashboardTimezone, readFinance, readOpenRequests, readOperations, readTeam } from "../repositories/dashboard.repository";
import type { DashboardData, DashboardSection } from "../types/dashboard";

async function section<T>(name:string,read:()=>Promise<T>):Promise<DashboardSection<T>>{
  try{return {status:"ready",data:await read()};}catch{
    // Do not forward database errors, document contents, or index URLs to the browser.
    console.error(`[DASHBOARD] ${name} data could not be loaded`);
    return {status:"error",message:`We couldn’t load ${name}. Please refresh to try again.`};
  }
}
export async function getDashboard(searchParams:Record<string,string|string[]|undefined>){
  const session=await requirePermission("viewDashboard");
  let timezone = "UTC";
  let defaulted = true;
  let timezoneError: string | undefined;
  try {
    const settings = await readDashboardTimezone(session);
    timezone = settings.timezone;
    defaulted = settings.defaulted;
  } catch {
    console.error("[DASHBOARD] organization timezone could not be loaded");
    timezoneError = "Your organization timezone could not be loaded. Times are shown in UTC.";
  }
  const today=localDate(new Date(),timezone);
  const parsed=calendarDateSchema.safeParse(searchParams.date??today);
  const date=parsed.success?parsed.data:today;
  const operationsAllowed=hasPermission(session.role,"dispatchJobs");
  const ownJobs=session.role==="TECHNICIAN";
  const range=dayRange(date,timezone);
  const financeAllowed=hasPermission(session.role,"viewFinancials");
  const since=new Date(Date.now()-30*24*60*60*1000);
  const [operations,team,requests,finance]=await Promise.all([
    operationsAllowed||ownJobs?section("jobs",()=>readOperations(session,range)):null,
    operationsAllowed?section("technician availability",()=>readTeam(session)):null,
    operationsAllowed?section("service requests",()=>readOpenRequests(session)):null,
    financeAllowed?section("billing",()=>readFinance(session,today,since)):null,
  ]);
  const data:DashboardData={date,today,timezone,timezoneDefaulted:defaulted,generatedAt:new Date().toISOString(),
    ...(!parsed.success || timezoneError
      ? {filterError:[
          !parsed.success ? "The requested date was invalid. Showing today instead." : null,
          timezoneError ?? null,
        ].filter((value): value is string => Boolean(value)).join(" ")}
      : {}),operations,team,requests,finance,
  };
  return {data,displayName:session.displayName,organizationName:session.organizationName};
}
