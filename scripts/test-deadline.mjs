import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/lib/utils.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});
const utilsModule = { exports: {} };
new Function("require", "module", "exports", outputText)(() => { throw new Error("Unexpected import in deadline test"); }, utilsModule, utilsModule.exports);
const { getDeadlineState } = utilsModule.exports;

const now = Date.now();
const pastDeadline = new Date(now - 2 * 3_600_000).toISOString();
const futureDeadline = new Date(now + 2 * 3_600_000).toISOString();
const submittedOnTime = new Date(now - 3 * 3_600_000).toISOString();
const submittedLate = new Date(now - 3_600_000).toISOString();

const onTime = getDeadlineState(pastDeadline, "submitted", submittedOnTime);
assert.equal(onTime.isLate, false);
assert.equal(onTime.label, "Dikumpulkan");
const late = getDeadlineState(pastDeadline, "submitted", submittedLate);
assert.equal(late.isLate, true);
assert.equal(late.label, "Terlambat · sudah dikumpulkan");
const unknownSubmissionTime = getDeadlineState(pastDeadline, "submitted");
assert.equal(unknownSubmissionTime.isLate, false);
assert.equal(unknownSubmissionTime.label, "Dikumpulkan");
const pendingLate = getDeadlineState(pastDeadline, "todo");
assert.equal(pendingLate.isLate, true);
assert.equal(pendingLate.label, "Terlambat · belum dikumpulkan");
const upcoming = getDeadlineState(futureDeadline, "doing");
assert.equal(upcoming.isLate, false);
assert.equal(getDeadlineState(undefined, "submitted", submittedLate).label, "Dikumpulkan");

console.log(JSON.stringify({ deadlineComparison: "lulus", onTimeSubmitted: onTime.label, lateSubmitted: late.label, unknownSubmissionTime: "tidak diklaim terlambat" }));
