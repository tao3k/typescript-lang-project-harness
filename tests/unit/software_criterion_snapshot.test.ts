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
    (finding) =>
      finding.ruleId === "TS-AGENT-POLICY-007" || finding.ruleId === "TS-AGENT-POLICY-008",
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

test("agent software criterion control-flow v1 scenario benchmark contract", () => {
  const scenario = readManifest(path.join(SCENARIO, "scenario.toml"));
  const benchmark = readManifest(path.join(SCENARIO, "benchmark.toml"));
  const findings = expectJsonFile("findings.json") as Array<{
    ruleId?: string;
    rule_id?: string;
    softwareCriteria?: string;
  }>;

  assert.deepEqual(manifestList(scenario, "policy_ids"), [
    "TS-AGENT-CONTROL-FLOW-001",
    "TS-AGENT-NATIVE-IDIOM-001",
  ]);
  assert.equal(manifestString(scenario, "inputs"), "inputs");
  assert.equal(manifestString(scenario, "expected"), "expect");
  assertFixtureFiles("inputs");
  assertFixtureFiles("expect");

  const trigger = manifestSection(scenario, "policy_trigger");
  const expectedRuleIds = manifestList(trigger, "expected_rule_ids");
  const expectedCriteria = manifestList(trigger, "expected_criteria");
  assert.equal(manifestString(trigger, "kind"), "software-criterion");
  assert.equal(manifestString(trigger, "evidence"), "expect/findings.json");
  assert.ok(
    manifestString(trigger, "trigger").includes("inputs/src/criterion.ts"),
    "policy trigger must name the input fixture that reproduces findings",
  );
  assert.ok(
    manifestString(trigger, "agent_failure_mode").includes("AI agent"),
    "policy trigger must record the agent failure mode it prevents",
  );
  assert.ok(
    manifestString(trigger, "expected_resolution").includes("Flatten"),
    "policy trigger must record the expected code-quality resolution",
  );

  assert.deepEqual(expectedRuleIds, ["TS-AGENT-POLICY-007", "TS-AGENT-POLICY-008"]);
  assert.deepEqual(new Set(findings.map((finding) => finding.ruleId)), new Set(expectedRuleIds));
  assert.deepEqual(
    new Set(findings.map((finding) => finding.softwareCriteria)),
    new Set(expectedCriteria),
  );

  assert.equal(manifestString(benchmark, "harness"), "vitest");
  assert.equal(manifestString(benchmark, "test"), "software_criterion_snapshot.test.ts");
  assertBenchmarkDurations(benchmark);
  const comparison = manifestSection(benchmark, "input_expected_comparison");
  assert.equal(manifestString(comparison, "input_total"), "18ms");
  assert.equal(manifestString(comparison, "expected_total"), "7ms");
  assert.equal(manifestNumber(comparison, "input_memory_bytes"), 8388608);
  assert.equal(manifestNumber(comparison, "expected_memory_bytes"), 6291456);
  assert.ok(
    manifestString(comparison, "interpretation").includes("low-quality input patterns"),
    "benchmark comparison must explain why the expected fixture is better",
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

function readManifest(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function manifestSection(manifest: string, section: string): string {
  const start = manifest.indexOf(`[${section}]`);
  assert.notEqual(start, -1, `manifest must include [${section}]`);
  const rest = manifest.slice(start + section.length + 2);
  const next = rest.search(/\n\[[^\]]+\]/u);
  return next === -1 ? rest : rest.slice(0, next);
}

function manifestString(manifest: string, key: string): string {
  const match = manifest.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "mu"));
  assert.ok(match, `manifest must include string ${key}`);
  return match[1] ?? "";
}

function manifestNumber(manifest: string, key: string): number {
  const match = manifest.match(new RegExp(`^${key}\\s*=\\s*([0-9]+)`, "mu"));
  assert.ok(match, `manifest must include number ${key}`);
  return Number(match[1]);
}

function manifestList(manifest: string, key: string): string[] {
  const match = manifest.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "mu"));
  assert.ok(match, `manifest must include list ${key}`);
  return Array.from((match[1] ?? "").matchAll(/"([^"]+)"/gu), (item) => item[1] ?? "");
}

function assertFixtureFiles(field: "inputs" | "expect"): void {
  assert.ok(
    walkFiles(path.join(SCENARIO, field)).length > 0,
    `${field} must contain replay fixtures`,
  );
}

function assertBenchmarkDurations(manifest: string): void {
  for (const key of ["target_total", "max_total", "observed_total", "regression_budget"]) {
    assert.match(manifestString(manifest, key), /^[0-9]+(ns|us|ms|s)$/u);
  }
  assert.ok(manifestNumber(manifest, "memory_budget_bytes") > 0);
  assert.ok(manifestNumber(manifest, "observed_memory_bytes") > 0);
}
