import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
// The workspace root's TypeScript provides transpileModule (this package's own compiler is a native binary).
const ts = createRequire(resolve(here, "../../../package.json"))("typescript");

function loader() {
  const cache = new Map();
  return function load(path) {
    const filename = existsSync(path) ? path : `${path}.ts`;
    if (cache.has(filename)) return cache.get(filename).exports;
    const record = { exports: {} };
    cache.set(filename, record);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
      module: record, exports: record.exports,
      require: (name) => {
        if (name.startsWith(".")) return load(resolve(dirname(filename), name));
        throw new Error(`Unexpected dependency: ${name}`);
      },
    }, { filename });
    return record.exports;
  };
}

const load = loader();
const { canTransitionJob } = load(resolve(here, "../src/job-state-machine"));
const { technicianMoves, findTechnicianMove, isTechnicianDecline } = load(resolve(here, "../src/job-technician-moves"));

const STATUSES = ["NEW", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "DIAGNOSING", "QUOTATION_REQUIRED", "WAITING_APPROVAL", "APPROVED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "INVOICED", "PARTIAL", "PAID", "CLOSED", "REJECTED", "CANCELLED", "RESCHEDULED"];
const OFFICE_ONLY = ["NEW", "ASSIGNED", "WAITING_APPROVAL", "APPROVED", "INVOICED", "PARTIAL", "PAID", "CLOSED", "REJECTED", "CANCELLED"];

// The approved plan: 14 moves, the first in each list is the main next step.
const EXPECTED = {
  ASSIGNED: [["ACCEPTED", "none"], ["RESCHEDULED", "reason"]],
  ACCEPTED: [["EN_ROUTE", "none"], ["RESCHEDULED", "reason"]],
  EN_ROUTE: [["ARRIVED", "none"]],
  ARRIVED: [["DIAGNOSING", "none"], ["IN_PROGRESS", "none"]],
  DIAGNOSING: [["IN_PROGRESS", "none"], ["QUOTATION_REQUIRED", "note"], ["ON_HOLD", "reason"]],
  APPROVED: [["IN_PROGRESS", "none"]],
  IN_PROGRESS: [["COMPLETED", "confirm"], ["ON_HOLD", "reason"]],
  ON_HOLD: [["IN_PROGRESS", "none"]],
};

const tests = [];
const test = (name, run) => tests.push({ name, run });

test("every technician move is a legal state-machine transition", () => {
  for (const from of STATUSES) for (const move of technicianMoves(from)) assert.ok(canTransitionJob(from, move.to), `${from} -> ${move.to}`);
});

test("the moves match the approved list exactly, in order", () => {
  let total = 0;
  for (const from of STATUSES) {
    // Copy into this realm: arrays made inside the vm sandbox have another Array prototype.
    const actual = [...technicianMoves(from)].map((move) => [move.to, move.input]);
    assert.deepEqual(actual, EXPECTED[from] ?? [], from);
    total += actual.length;
  }
  assert.equal(total, 14);
});

test("dispatch, quotation approval, billing, Cancelled and Rejected stay with the office", () => {
  for (const from of STATUSES) for (const move of technicianMoves(from)) assert.ok(!OFFICE_ONLY.includes(move.to), `${from} -> ${move.to}`);
  for (const from of ["NEW", "QUOTATION_REQUIRED", "WAITING_APPROVAL", "RESCHEDULED", "COMPLETED", "INVOICED", "PARTIAL", "PAID", "CLOSED", "REJECTED", "CANCELLED"]) {
    assert.equal(technicianMoves(from).length, 0, `${from} has no technician moves`);
  }
});

test("declines and holds need a reason; completing needs a confirmation", () => {
  for (const from of STATUSES) for (const move of technicianMoves(from)) {
    if (move.to === "RESCHEDULED" || move.to === "ON_HOLD") assert.equal(move.input, "reason", `${from} -> ${move.to}`);
    if (move.to === "COMPLETED") assert.equal(move.input, "confirm");
  }
});

test("lookups refuse moves the technician can't make", () => {
  assert.equal(findTechnicianMove("ASSIGNED", "ACCEPTED")?.to, "ACCEPTED");
  assert.equal(findTechnicianMove("ASSIGNED", "REJECTED"), null);
  assert.equal(findTechnicianMove("ASSIGNED", "CANCELLED"), null);
  assert.equal(findTechnicianMove("EN_ROUTE", "ACCEPTED"), null, "no way back");
  assert.equal(findTechnicianMove("COMPLETED", "INVOICED"), null);
  assert.equal(findTechnicianMove("QUOTATION_REQUIRED", "WAITING_APPROVAL"), null);
  assert.equal(findTechnicianMove("NOT_A_STATUS", "ACCEPTED"), null);
  assert.equal(isTechnicianDecline(findTechnicianMove("ACCEPTED", "RESCHEDULED")), true);
  assert.equal(isTechnicianDecline(findTechnicianMove("ACCEPTED", "EN_ROUTE")), false);
});

let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}`); console.error(error); }
}
if (failed) { console.error(`Technician move checks failed: ${failed}/${tests.length}.`); process.exit(1); }
console.log(`Technician move checks passed: ${tests.length}/${tests.length}.`);
