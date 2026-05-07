import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isTypeScriptHarnessClean,
  renderTypeScriptProjectHarness,
  runTypeScriptProjectHarness,
  typeScriptAgentPolicyRules,
  typeScriptModularityRules,
  typeScriptRulePackDescriptors,
  typeScriptSemanticRules,
  typeScriptTestLayoutRules,
} from "../../src/index.js";

test("rule catalog keeps deterministic pack order and agent advice severity", () => {
  assert.deepEqual(
    typeScriptRulePackDescriptors().map((pack) => `${pack.id}:${pack.defaultMode}`),
    [
      "typescript.syntax:blocking",
      "typescript.semantic:advisory",
      "typescript.project_policy:blocking",
      "typescript.modularity:advisory",
      "typescript.test_layout:advisory",
      "typescript.agent_policy:advisory",
    ],
  );
  assert.deepEqual(
    typeScriptModularityRules().map((rule) => `${rule.ruleId}:${rule.severity}`),
    ["TS-MOD-R001:info", "TS-MOD-R002:info"],
  );
  assert.deepEqual(
    typeScriptSemanticRules().map((rule) => `${rule.ruleId}:${rule.severity}`),
    ["TS-SEM-R001:info"],
  );
  assert.deepEqual(
    typeScriptTestLayoutRules().map((rule) => `${rule.ruleId}:${rule.severity}`),
    ["TS-TEST-R001:info"],
  );
  assert.deepEqual(
    typeScriptAgentPolicyRules().map((rule) => `${rule.ruleId}:${rule.severity}`),
    [
      "TS-AGENT-R001:info",
      "TS-AGENT-R002:info",
      "TS-AGENT-R003:info",
      "TS-AGENT-R004:info",
      "TS-AGENT-R005:info",
      "TS-AGENT-R006:info",
      "TS-AGENT-R007:info",
      "TS-AGENT-R008:info",
      "TS-AGENT-R009:info",
    ],
  );
});

test("agent policy reports unresolved project imports without blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-agent-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@app/*": ["src/*"],
        },
      },
      include: ["src/**/*.ts"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    ['import "./missing.js";', 'import "#missing";', 'import "@app/missing";'].join("\n"),
  );

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    typeScriptAgentPolicyRules().map((rule) => rule.ruleId),
    [
      "TS-AGENT-R001",
      "TS-AGENT-R002",
      "TS-AGENT-R003",
      "TS-AGENT-R004",
      "TS-AGENT-R005",
      "TS-AGENT-R006",
      "TS-AGENT-R007",
      "TS-AGENT-R008",
      "TS-AGENT-R009",
    ],
  );
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId === "TS-AGENT-R001")
      .map((finding) => `${finding.ruleId}:${finding.severity}`),
    ["TS-AGENT-R001:info", "TS-AGENT-R001:info", "TS-AGENT-R001:info"],
  );
  assert.match(rendered, /\[TS-AGENT-R001\] info/u);
  assert.match(rendered, /Project import '\.\/missing\.js' does not resolve/u);
  assert.match(rendered, /Project import '#missing' does not resolve/u);
  assert.match(rendered, /Project import '@app\/missing' does not resolve/u);
});

test("agent policy reports unresolved package entries without blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-package-agent-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/package-agent",
      exports: { ".": "./dist/missing.js" },
      imports: { "#missing": "./src/missing.ts" },
    }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        rootDir: ".",
        outDir: "dist",
      },
      include: ["src/**/*.ts"],
    }),
  );
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const ok = 1;\n");

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings.map((finding) => finding.ruleId),
    ["TS-AGENT-R002", "TS-AGENT-R002"],
  );
  assert.match(rendered, /Package exports '\.' target '\.\/dist\/missing\.js'/u);
  assert.match(rendered, /Package imports '#missing' target '\.\/src\/missing\.ts'/u);
});

test("agent policy reports multi-owner facades without intent docs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-facade-agent-"));
  fs.mkdirSync(path.join(root, "src", "domain"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "transport"), { recursive: true });
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(path.join(root, "src", "domain", "model.ts"), "export const model = 1;\n");
  fs.writeFileSync(path.join(root, "src", "transport", "http.ts"), "export const http = 1;\n");
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    [
      'export { model } from "./domain/model.js";',
      'export { http } from "./transport/http.js";',
    ].join("\n"),
  );

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings.map((finding) => finding.ruleId),
    ["TS-AGENT-R003"],
  );
  assert.match(rendered, /Facade re-exports 2 owners without a local intent doc/u);
});

test("agent policy reports parser-native public API shape advice without blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-api-shape-agent-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "api.ts"),
    [
      "export function loadOwner(",
      "  ownerId: string,",
      "  includeDrafts: boolean,",
      "  forceRefresh: boolean,",
      "  region: string,",
      "  timeoutMs: number,",
      "  traceId: string",
      "): [string, number] {",
      "  return [ownerId, timeoutMs];",
      "}",
    ].join("\n"),
  );

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings.map((finding) => finding.ruleId),
    ["TS-AGENT-R004", "TS-AGENT-R005", "TS-AGENT-R006"],
  );
  assert.match(rendered, /multiple flag parameters/u);
  assert.match(rendered, /exposes 6 positional parameters/u);
  assert.match(rendered, /anonymous tuple with primitive elements: string, number/u);
});

test("agent policy reports parser-native algorithm shape advice without blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-algorithm-agent-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "algorithm.ts"),
    [
      "export function nestedAlgorithm(value: number): number {",
      "  if (value > 0) {",
      "    if (value > 1) {",
      "      if (value > 2) {",
      "        if (value > 3) {",
      "          if (value > 4) {",
      "            return value;",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "  return 0;",
      "}",
      "export function broadLinearAlgorithm(value: number): number {",
      ...Array.from({ length: 92 }, (_, index) =>
        index < 30 ? `  const step${index} = value + ${index};` : "  void value;",
      ),
      "  return step29;",
      "}",
    ].join("\n"),
  );

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings.map((finding) => finding.ruleId),
    ["TS-AGENT-R007", "TS-AGENT-R008"],
  );
  assert.match(rendered, /hides algorithm shape/u);
  assert.match(rendered, /broadLinearAlgorithm/u);
});

test("agent policy reports parser-native public data shape advice without blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-data-shape-agent-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "events.ts"),
    [
      "interface Payload { value: unknown }",
      "export interface OwnerEvent {",
      "  ownerId: string;",
      "  requestId: string;",
      "  callbackUrl: string;",
      "  timeoutMs: number;",
      "  enabled: boolean;",
      "  payload: Payload;",
      "}",
    ].join("\n"),
  );

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.findings.map((finding) => finding.ruleId),
    ["TS-AGENT-R009"],
  );
  assert.match(rendered, /OwnerEvent/u);
  assert.match(rendered, /ownerId: string/u);
  assert.match(rendered, /callbackUrl: string/u);
  assert.match(rendered, /enabled: boolean/u);
});

test("agent policy keeps model schema modules out of public data shape advice", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-harness-data-shape-model-"));
  fs.mkdirSync(path.join(root, "src", "verification"), { recursive: true });
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  fs.writeFileSync(
    path.join(root, "src", "verification", "model.ts"),
    [
      "export interface SchemaFact {",
      "  ownerId: string;",
      "  requestId: string;",
      "  artifactPath: string;",
      "  observedAtMs: number;",
      "}",
    ].join("\n"),
  );

  const report = runTypeScriptProjectHarness(root);

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(report.findings, []);
});
