import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { dashboardFilterSchema, dashboardJobSchema } from "../src/features/dashboard/schemas/dashboard.schema.ts";
import { dayRange, localDate } from "../src/features/dashboard/utils/date.ts";

const validFilter = dashboardFilterSchema.safeParse({ date: "2026-09-28" });
assert.equal(validFilter.success, true, "valid dashboard dates should parse");
assert.equal(
  dashboardFilterSchema.safeParse({ date: "28-09-2026" }).success,
  false,
  "invalid dashboard dates should be rejected",
);

const validJob = dashboardJobSchema.safeParse({
  organizationId: "org-a",
  jobNumber: "JOB-1001",
  title: "Replace pump",
  status: "ASSIGNED",
  priority: "HIGH",
  assignedTechnicianId: "tech-a",
  scheduledAt: new Date("2026-09-28T12:00:00.000Z"),
  createdAt: new Date("2026-09-27T12:00:00.000Z"),
});
assert.equal(validJob.success, true, "valid job documents should parse");
assert.equal(
  dashboardJobSchema.safeParse({ ...validJob.data, organizationId: "" }).success,
  false,
  "job documents without a tenant must be rejected",
);

for (const [date, timezone] of [
  ["2026-09-28", "UTC"],
  ["2026-09-28", "Asia/Kolkata"],
  ["2026-11-01", "America/New_York"],
  ["2026-03-08", "America/New_York"],
]) {
  const range = dayRange(date, timezone);
  assert.equal(localDate(range.start, timezone), date, `${timezone} range starts on the selected date`);
  assert.equal(localDate(new Date(range.end.getTime() - 1), timezone), date, `${timezone} range ends before the next date`);
  assert.ok(range.end.getTime() > range.start.getTime(), `${timezone} range is ordered`);
}

const repository = await readFile(new URL("../src/features/dashboard/repositories/dashboard.repository.ts", import.meta.url), "utf8");
assert.match(repository, /where\("organizationId",\s*"==",\s*session\.organizationId\)/, "dashboard queries must be tenant-scoped");
assert.match(repository, /assertOrganization\(value\.organizationId,session\)/, "job documents must be checked after lookup");
assert.match(repository, /assertOrganization\(data\.organizationId,session\)/, "technician documents must be checked after lookup");

console.log("Dashboard schema, timezone, and tenant-boundary checks passed.");
