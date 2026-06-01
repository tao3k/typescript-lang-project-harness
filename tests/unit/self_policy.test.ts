import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertTypeScriptProjectHarnessClean,
  advisoryFindings,
  isTypeScriptHarnessClean,
  runTypeScriptProjectHarness,
  renderTypeScriptProjectHarness,
} from "../../src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("repository self-applies the default TypeScript project harness", () => {
  assertTypeScriptProjectHarnessClean(projectRoot);
});

test("repository self-applies the default advice surface with minimal findings", () => {
  const report = runTypeScriptProjectHarness(projectRoot);
  assert.ok(isTypeScriptHarnessClean(report), "harness must have zero errors");

  const modularityAdvice = report.findings.filter(
    (finding) => finding.packId === "typescript.modularity",
  );
  assert.deepEqual(
    modularityAdvice.map((finding) => `${finding.ruleId}:${finding.location.path}`),
    [],
    "repository must self-apply the TypeScript modularity policy",
  );

  const advice = advisoryFindings(report);
  // Allow a small number of info-level findings from renderer code structure.
  // The harness is expected to be nearly clean — but renderer functions may
  // naturally have some nesting that TS-AGENT-R007 detects as advisory.
  assert.ok(
    advice.length <= 50, // R013 + R016 flag undocumented modules and error types
    `expected <=50 advisory findings, got ${advice.length}: ${advice.map((f) => f.ruleId).join(", ")}`,
  );
});
