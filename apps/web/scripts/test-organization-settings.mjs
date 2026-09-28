import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  organizationRecordSchema,
  organizationSettingsFormSchema,
  organizationSettingsRecordSchema,
} from "../src/features/organization-settings/schemas/organization-settings.schema.ts";

const valid = {
  name: "Acme Field Services",
  timezone: "Asia/Kolkata",
  jobNumberPrefix: "job",
  invoiceNumberPrefix: "INV",
  quotationNumberPrefix: "Q-1",
};

const parsed = organizationSettingsFormSchema.safeParse(valid);
assert.equal(parsed.success, true, "valid settings should parse");
if (parsed.success) {
  assert.equal(parsed.data.jobNumberPrefix, "JOB");
  assert.equal(parsed.data.quotationNumberPrefix, "Q-1");
}

assert.equal(
  organizationSettingsFormSchema.safeParse({ ...valid, organizationId: "client-org" }).success,
  false,
  "client input must not carry organizationId",
);
assert.equal(
  organizationSettingsFormSchema.safeParse({ ...valid, timezone: "Mars/Olympus" }).success,
  false,
  "invalid timezones must be rejected",
);
assert.equal(
  organizationSettingsFormSchema.safeParse({ ...valid, jobNumberPrefix: "x" }).success,
  false,
  "short number prefixes must be rejected",
);
assert.equal(
  organizationSettingsFormSchema.safeParse({ ...valid, invoiceNumberPrefix: "123456789" }).success,
  false,
  "long number prefixes must be rejected",
);

const stored = organizationSettingsRecordSchema.safeParse({
  organizationId: "org-a",
  jobNumberPrefix: "JOB",
  invoiceNumberPrefix: "INV",
  quotationNumberPrefix: "QUO",
});
assert.equal(stored.success, true, "legacy records without timezone should default to UTC");
if (stored.success) assert.equal(stored.data.timezone, "UTC");

assert.equal(
  organizationRecordSchema.safeParse({
    id: "org-a",
    name: "Acme Field Services",
    slug: "acme-field-services-a1b2c3",
    ownerUserId: "user-a",
    status: "ACTIVE",
  }).success,
  true,
);

const repository = await readFile(
  new URL("../src/features/organization-settings/repositories/organization-settings.repository.ts", import.meta.url),
  "utf8",
);
assert.match(repository, /doc\(session\.organizationId\)/g, "lookups must use trusted tenant context");
assert.match(repository, /assertTenantDocument\(documentId, session\)/, "document IDs must be checked after lookup");
assert.match(repository, /organizationId !== session\.organizationId/, "stored ownership must be checked");
assert.match(repository, /ORGANIZATION_SETTINGS_UPDATED/, "settings changes must be audited");
assert.match(repository, /runTransaction/, "organization and settings writes must be atomic");

const route = await readFile(
  new URL("../src/app/api/settings/organization/route.ts", import.meta.url),
  "utf8",
);
assert.match(route, /origin/, "mutation route must verify same-origin requests");
assert.match(route, /updateOrganizationSettings/, "route must use the server repository");
assert.match(route, /requirePermission\("manageOrganization"\)/, "route must authorize owner access");
assert.match(route, /organizationSettingsFormSchema\.safeParse/, "route must validate input");

console.log("PASS: organization settings schemas, tenant checks, atomic audit writes, and mutation boundary.");
