import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isTypeScriptHarnessClean,
  renderTypeScriptProjectHarnessAgentCompactText,
  renderTypeScriptProjectHarness,
  renderTypeScriptReasoningTree,
  runTypeScriptProjectHarness,
} from "../../src/index.js";

test("React dependency activates render purity advice from parser-native facts", () => {
  const root = reactProject("dependency-active", {
    packageJson: {
      dependencies: { react: "^19.0.0" },
    },
    source: {
      "clock.tsx": [
        'import { useEffect } from "react";',
        "export function Clock() {",
        "  const now = new Date();",
        "  const random = Math.random();",
        "  document.title = String(random);",
        "  return <time>{now.toISOString()}</time>;",
        "}",
        "export function SafeClock() {",
        '  useEffect(() => { document.title = "safe"; }, []);',
        "  return <time>safe</time>;",
        "}",
        "export function useClockSeed() {",
        "  return Date.now();",
        "}",
      ],
    },
  });

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);
  const snapshot = renderTypeScriptReasoningTree(report);
  const advice = renderTypeScriptProjectHarnessAgentCompactText(report);
  const findings = report.findings.filter((finding) => finding.ruleId.startsWith("TS-EXT-REACT"));

  assert.equal(isTypeScriptHarnessClean(report), true);
  assert.deepEqual(
    report.projectScope?.packageJson.packageExtensions.map((extension) => ({
      name: extension.name,
      activation: extension.activation,
      coverage: extension.coverage,
      dependencySource: extension.dependencySource,
    })),
    [
      {
        name: "react",
        activation: "dependency",
        coverage: "project",
        dependencySource: "dependencies",
      },
    ],
  );
  assert.deepEqual(
    findings.map(
      (finding) => `${finding.ruleId}:${finding.severity}:${finding.labels.module_role}`,
    ),
    ["TS-EXT-REACT-R002:info:source"],
  );
  assert.match(findings[0]?.labels.react_purity ?? "", /Clock:new Date/u);
  assert.match(findings[0]?.labels.react_purity ?? "", /Clock:Math\.random/u);
  assert.match(findings[0]?.labels.react_purity ?? "", /Clock:document\.title/u);
  assert.match(findings[0]?.labels.react_purity ?? "", /useClockSeed:Date\.now/u);
  assert.doesNotMatch(findings[0]?.labels.react_purity ?? "", /SafeClock/u);
  assert.match(rendered, /\[TS-EXT-REACT-R002\] info/u);
  assert.match(snapshot, /react activation=dependency/u);
  assert.match(
    advice,
    /\[TS-EXT-REACT-R002\] info x1: Keep React component and hook render paths pure/u,
  );
  assert.match(advice, /component or hook render path has non-idempotent work/u);
  assert.match(advice, /facts: package\.json React activation/u);
  assert.match(advice, /coverage: project activation=dependency dependency=dependencies/u);
  assert.match(advice, /target_groups:\n   - src\/clock\.tsx x1 first=Clock:new Date/u);
  assert.match(advice, /move `new Date`, `Date\.now`, and `Math\.random` out/u);
  assert.match(advice, /move `document` or `window` writes into `useEffect`/u);
  assert.match(advice, /React Compiler can optimize safely/u);
  assert.match(advice, /targets:\n   - @ src\/clock\.tsx:\d+:\d+ purity=Clock:new Date/u);
});

test("explicit React enablement without dependency is an error-level blocking finding", () => {
  const root = reactProject("config-missing-dependency", {
    packageJson: {
      typescriptProjectHarness: { extensions: { React: "enable" } },
    },
    source: {
      "clock.tsx": ["export function Clock() {", "  return <time />;", "}"],
    },
  });

  const report = runTypeScriptProjectHarness(root);
  const rendered = renderTypeScriptProjectHarness(report);
  const snapshot = renderTypeScriptReasoningTree(report);

  assert.equal(isTypeScriptHarnessClean(report), false);
  assert.deepEqual(
    report.findings
      .filter((finding) => finding.ruleId.startsWith("TS-EXT-REACT"))
      .map((finding) => `${finding.ruleId}:${finding.severity}:${finding.label}`),
    ["TS-EXT-REACT-R001:error:declare react before enforcing React extension policy"],
  );
  assert.match(rendered, /\[TS-EXT-REACT-R001\] error/u);
  assert.match(rendered, /package\.json enables the React extension/u);
  assert.match(snapshot, /react activation=config-enabled-missing-dependency/u);
});

function reactProject(
  name: string,
  options: {
    readonly packageJson: Record<string, unknown>;
    readonly source: Readonly<Record<string, string | readonly string[]>>;
  },
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ts-harness-react-${name}-`));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: `@example/${name}`, type: "module", ...options.packageJson }),
  );
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        jsx: "preserve",
        lib: ["ES2020", "DOM"],
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2020",
      },
      include: ["src/**/*.ts", "src/**/*.tsx"],
    }),
  );
  fs.writeFileSync(
    path.join(root, "src", "react.d.ts"),
    [
      'declare module "react" {',
      "  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;",
      "}",
      "declare namespace JSX {",
      "  interface IntrinsicElements {",
      "    [elemName: string]: unknown;",
      "  }",
      "}",
    ].join("\n"),
  );
  for (const [relativePath, source] of Object.entries(options.source)) {
    fs.writeFileSync(
      path.join(root, "src", relativePath),
      typeof source === "string" ? source : source.join("\n"),
    );
  }
  return root;
}
