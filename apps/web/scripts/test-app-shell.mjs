import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Load the actual TypeScript policy/guard with only framework and session I/O mocked.
function load(relativePath, mocks = {}) {
  const filename = resolve(root, relativePath);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    source,
    {
      exports,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
    },
    { filename },
  );
  return exports;
}

const policy = load("src/lib/auth/permissions.ts");
const nav = load("src/features/app-shell/config/navigation.ts", {
  "@/src/lib/auth/permissions": policy,
});
const expected = {
  OWNER: [
    "viewDashboard",
    "manageCustomers",
    "manageTechnicians",
    "dispatchJobs",
    "viewFinancials",
    "manageInventory",
    "manageOrganization",
    "manageUsers",
  ],
  ADMIN: [
    "viewDashboard",
    "manageCustomers",
    "manageTechnicians",
    "dispatchJobs",
    "viewFinancials",
    "manageInventory",
    "manageUsers",
  ],
  MANAGER: [
    "viewDashboard",
    "manageCustomers",
    "manageTechnicians",
    "dispatchJobs",
    "manageInventory",
  ],
  DISPATCHER: ["viewDashboard", "manageCustomers", "dispatchJobs"],
  TECHNICIAN: ["viewDashboard"],
  ACCOUNTANT: ["viewDashboard", "viewFinancials"],
};
let checks = 0;
for (const [role, allowed] of Object.entries(expected)) {
  const session = { uid: "test-user", organizationId: "test-tenant", role };
  let authenticated = 0;
  const forbidden = new Error("NOT_FOUND");
  const guard = load("src/lib/auth/authorization.ts", {
    "server-only": {},
    "next/navigation": {
      notFound() {
        throw forbidden;
      },
    },
    "./require-auth": {
      async requireAuth() {
        authenticated++;
        return session;
      },
    },
    "./permissions": policy,
  });
  for (const permission of Object.keys(policy.PERMISSION_ROLES)) {
    const permitted = allowed.includes(permission);
    assert.equal(
      policy.hasPermission(role, permission),
      permitted,
      `${role}/${permission}`,
    );
    if (permitted)
      assert.equal(await guard.requirePermission(permission), session);
    else
      await assert.rejects(
        guard.requirePermission(permission),
        (error) => error === forbidden,
      );
    checks++;
  }
  assert.equal(authenticated, Object.keys(policy.PERMISSION_ROLES).length);
  const groups = nav.getNavigation(role);
  assert.ok(groups.every((group) => group.items.length));
  const items = groups.flatMap((group) => group.items);
  assert.ok(items.every((item) => allowed.includes(item.permission)));
  assert.equal(
    JSON.stringify(
      items.filter((item) => item.available).map((item) => item.href),
    ),
    '["/dashboard"]',
  );
  assert.equal(new Set(items.map((item) => item.href)).size, items.length);
}
const unauthenticated = new Error("LOGIN_REDIRECT");
const guard = load("src/lib/auth/authorization.ts", {
  "server-only": {},
  "next/navigation": {
    notFound() {
      assert.fail("Must authenticate first");
    },
  },
  "./require-auth": {
    async requireAuth() {
      throw unauthenticated;
    },
  },
  "./permissions": policy,
});
await assert.rejects(
  guard.requirePermission("viewDashboard"),
  (error) => error === unauthenticated,
);
assert.equal(policy.hasPermission("UNKNOWN_ROLE", "viewDashboard"), false);
assert.equal(nav.getNavigation("UNKNOWN_ROLE").length, 0);
assert.equal(nav.isNavigationActive("/dashboard", "/dashboard"), true);
assert.equal(
  nav.isNavigationActive("/protected/dashboard", "/dashboard"),
  true,
);
assert.equal(nav.isNavigationActive("/customers/123", "/customers"), true);
assert.equal(nav.isNavigationActive("/customers-other", "/customers"), false);
console.log(
  `PASS: ${checks} role/permission combinations, server allow/deny guards, authentication-first behavior, role-filtered navigation, and route matching.`,
);
