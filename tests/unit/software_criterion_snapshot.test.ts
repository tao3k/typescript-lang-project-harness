import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildApiPacketPayload } from "../../src/cli/semantic-search/api.js";
import { renderTypeScriptProjectHarness, runTypeScriptProjectHarness } from "../../src/index.js";
import { slashPath } from "../../src/reasoning/path_utils.js";

const SCENARIO = path.join(
  process.cwd(),
  "tests",
  "unit",
  "scenarios",
  "software_criteria",
  "control_flow_v1",
);

test("agent software criterion control-flow v1 scenario snapshot", () => {
  const root = setupScenario("ts-criterion-snapshot-");
  const report = runTypeScriptProjectHarness(root);
  const criterionModule = report.reasoningTree.modules.find((moduleReport) =>
    slashPath(moduleReport.path).endsWith("src/criterion.ts"),
  );
  const findings = report.findings.filter(
    (finding) => finding.ruleId === "TS-AGENT-R007" || finding.ruleId === "TS-AGENT-R008",
  );
  const payload = buildApiPacketPayload(report, { view: "api", query: "route" });

  assert.equal(
    stableJson(
      criterionModule?.publicFunctionControlFlows.map((controlFlow) => ({
        functionName: controlFlow.functionName,
        statementCount: controlFlow.statementCount,
        branchCount: controlFlow.branchCount,
        loopCount: controlFlow.loopCount,
        maxNestingDepth: controlFlow.maxNestingDepth,
        maxLiteralDispatchChain: controlFlow.maxLiteralDispatchChain,
        manualTransformLoopCount: controlFlow.manualTransformLoopCount,
        maxBlockStatementCount: controlFlow.maxBlockStatementCount,
      })) ?? [],
    ),
    expectFile("control-flow-facts.json"),
  );
  assert.equal(
    stableJson(
      findings.map((finding) => ({
        ruleId: finding.ruleId,
        summary: finding.summary,
        locationLine: finding.location.line,
        label: finding.label,
        softwareCriteria: finding.labels.softwareCriteria,
      })),
    ),
    expectFile("findings.json"),
  );
  assert.equal(
    renderTypeScriptProjectHarness({ ...report, findings }),
    expectTextFile("rendered.txt"),
  );
  assert.deepEqual(
    payload.hits.map((hit) => ({
      symbol: hit.symbol,
      reason: hit.reason,
      fields: hit.fields,
    })),
    expectJsonFile("api-route-hits.json"),
  );
});

function setupScenario(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  copyInputs(path.join(SCENARIO, "inputs"), root);
  return root;
}

function copyInputs(sourceDir: string, destinationDir: string): void {
  for (const source of walkFiles(sourceDir)) {
    const destination = path.join(destinationDir, path.relative(sourceDir, source));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function walkFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

function expectFile(name: string): string {
  return fs.readFileSync(path.join(SCENARIO, "expect", name), "utf8");
}

function expectTextFile(name: string): string {
  return expectFile(name).replace(/\n$/u, "");
}

function expectJsonFile(name: string): unknown {
  return JSON.parse(expectFile(name));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
