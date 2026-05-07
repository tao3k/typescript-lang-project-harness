import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultTypeScriptHarnessConfig,
  isTypeScriptHarnessClean,
  renderTypeScriptProjectHarness,
  renderTypeScriptProjectHarnessAgentSnapshot,
  runTypeScriptProjectHarness,
  runTypeScriptProjectHarnessAgentSnapshot,
  typeScriptRulePackRuleIds,
  withDisabledTypeScriptRule,
  withDisabledTypeScriptRulePack,
  withDisabledTypeScriptRules,
  withTypeScriptBlockingSeverities,
  withTypeScriptRulePackSeverity,
  withTypeScriptRuleSeverity,
} from "../../src/index.js";

test("policy config can disable a single rule finding", () => {
  const root = unresolvedImportProject("single-rule");
  const defaultReport = runTypeScriptProjectHarness(root);
  const config = withDisabledTypeScriptRule(defaultTypeScriptHarnessConfig(), "TS-AGENT-R001");
  const configuredReport = runTypeScriptProjectHarness(root, config);

  assert.ok(defaultReport.findings.some((finding) => finding.ruleId === "TS-AGENT-R001"));
  assert.ok(configuredReport.findings.every((finding) => finding.ruleId !== "TS-AGENT-R001"));
});

test("policy config can disable several rules and a built-in rule pack", () => {
  const root = unresolvedImportProject("rule-pack");
  const config = withDisabledTypeScriptRulePack(
    withDisabledTypeScriptRules(defaultTypeScriptHarnessConfig(), ["TS-SEM-R001"]),
    "agent_policy",
  );
  const report = runTypeScriptProjectHarness(root, config);

  assert.deepEqual(typeScriptRulePackRuleIds("agent_policy"), [
    "TS-AGENT-R001",
    "TS-AGENT-R002",
    "TS-AGENT-R003",
    "TS-AGENT-R004",
    "TS-AGENT-R005",
    "TS-AGENT-R006",
    "TS-AGENT-R007",
    "TS-AGENT-R008",
  ]);
  assert.ok(report.findings.every((finding) => !finding.ruleId.startsWith("TS-AGENT-")));
  assert.ok(report.findings.every((finding) => finding.ruleId !== "TS-SEM-R001"));
});

test("policy config can override single-rule and rule-pack severities", () => {
  const root = unresolvedImportProject("severity");
  const ruleConfig = withTypeScriptRuleSeverity(
    defaultTypeScriptHarnessConfig(),
    "TS-AGENT-R001",
    "warning",
  );
  const packConfig = withTypeScriptRulePackSeverity(
    defaultTypeScriptHarnessConfig(),
    "agent_policy",
    "warning",
  );
  const ruleReport = runTypeScriptProjectHarness(root, ruleConfig);
  const packReport = runTypeScriptProjectHarness(root, packConfig);

  assert.equal(agentFinding(ruleReport).severity, "warning");
  assert.equal(isTypeScriptHarnessClean(ruleReport), false);
  assert.ok(
    packReport.findings
      .filter((finding) => finding.ruleId.startsWith("TS-AGENT-"))
      .every((finding) => finding.severity === "warning"),
  );
  assert.equal(isTypeScriptHarnessClean(packReport), false);
});

test("single-rule severity override wins after rule-pack severity", () => {
  const root = unresolvedImportProject("rule-wins");
  const config = withTypeScriptRuleSeverity(
    withTypeScriptRulePackSeverity(defaultTypeScriptHarnessConfig(), "agent_policy", "info"),
    "TS-AGENT-R001",
    "warning",
  );
  const report = runTypeScriptProjectHarness(root, config);

  assert.equal(agentFinding(report).severity, "warning");
  assert.equal(isTypeScriptHarnessClean(report), false);
});

test("blocking rule ids and blocking severity helper are applied at report time", () => {
  const root = unresolvedImportProject("blocking-rule");
  const config = {
    ...defaultTypeScriptHarnessConfig(),
    blockingRuleIds: ["TS-AGENT-R001"],
  };
  const warningConfig = withTypeScriptRuleSeverity(
    defaultTypeScriptHarnessConfig(),
    "TS-AGENT-R001",
    "warning",
  );
  const nonBlockingWarningConfig = withTypeScriptBlockingSeverities(warningConfig, ["error"]);

  assert.equal(isTypeScriptHarnessClean(runTypeScriptProjectHarness(root, config)), false);
  assert.equal(
    isTypeScriptHarnessClean(runTypeScriptProjectHarness(root, nonBlockingWarningConfig)),
    true,
  );
});

test("agent snapshot uses policy-configured findings", () => {
  const root = unresolvedImportProject("snapshot");
  const defaultSnapshot = renderTypeScriptProjectHarnessAgentSnapshot(
    runTypeScriptProjectHarnessAgentSnapshot(root),
  );
  const configuredSnapshot = renderTypeScriptProjectHarnessAgentSnapshot(
    runTypeScriptProjectHarnessAgentSnapshot(
      root,
      withDisabledTypeScriptRule(defaultTypeScriptHarnessConfig(), "TS-AGENT-R001"),
    ),
  );

  assert.match(defaultSnapshot, /FindingGroups:/u);
  assert.match(defaultSnapshot, /TS-AGENT-R001/u);
  assert.doesNotMatch(configuredSnapshot, /FindingGroups:/u);
  assert.doesNotMatch(configuredSnapshot, /TS-AGENT-R001/u);
});

function unresolvedImportProject(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ts-harness-policy-${label}-`));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
      },
      include: ["src/**/*.ts"],
    }),
  );
  fs.writeFileSync(path.join(root, "src", "index.ts"), 'import "./missing.js";\n');
  return root;
}

function agentFinding(report: ReturnType<typeof runTypeScriptProjectHarness>) {
  const finding = report.findings.find((candidate) => candidate.ruleId === "TS-AGENT-R001");
  assert.ok(finding, renderTypeScriptProjectHarness(report));
  return finding;
}
