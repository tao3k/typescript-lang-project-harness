import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  renderTypeScriptProjectHarness,
  renderTypeScriptReasoningTree,
  runTypeScriptProjectHarness,
  type TypeScriptHarnessReport,
} from "../../src/index.js";
import { runCli } from "../../src/cli.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const snapshotSectionOrder = ["OwnerBranches:", "OwnerDependencies:", "FindingGroups:"] as const;

test("agent snapshot matches the golden project reasoning surface", () => {
  const fixtureRoot = path.join(projectRoot, "tests", "fixtures", "agent_snapshot_project");
  const snapshotPath = path.join(projectRoot, "tests", "snapshots", "agent_snapshot_project.snap");
  const report = runTypeScriptProjectHarness(fixtureRoot);
  const rendered = `${renderTypeScriptReasoningTree(report)}\n`;

  assert.equal(fs.readFileSync(snapshotPath, "utf8"), rendered);
});

test("golden agent snapshot obeys the compact text design", () => {
  const fixtureRoot = path.join(projectRoot, "tests", "fixtures", "agent_snapshot_project");
  const snapshot = goldenSnapshot();

  assertCompactSnapshotDesign(snapshot, [projectRoot, fixtureRoot]);
});

test("repository agent snapshot self-applies the compact text design", () => {
  const report = runTypeScriptProjectHarness(projectRoot);
  const snapshot = `${renderTypeScriptReasoningTree(report)}\n`;

  assertCompactSnapshotDesign(snapshot, [projectRoot]);
});

test("CLI agent snapshot mode matches the golden project reasoning surface", () => {
  const fixtureRoot = path.join(projectRoot, "tests", "fixtures", "agent_snapshot_project");
  const output = runCliCapture(["--agent-snapshot", "."], fixtureRoot);

  assert.equal(output.exitCode, 0);
  assert.equal(output.stderr, "");
  assert.equal(goldenSnapshot(), output.stdout);
});

test("compact renderers normalize diagnostic messages to the reasoning root", () => {
  const diagnosticRoot = path.join(projectRoot, "tmp", "diagnostic-root");
  const sourcePath = path.join(diagnosticRoot, "src", "index.ts");
  const message = `Output file '${path.join(
    diagnosticRoot,
    "dist",
    "index.d.ts",
  )}' has not been built from source file '${sourcePath}'.`;
  const report = diagnosticReport(diagnosticRoot, sourcePath, message);

  const snapshot = renderTypeScriptReasoningTree(report);
  const compact = renderTypeScriptProjectHarness(report);

  assert.equal(snapshot.includes(diagnosticRoot), false);
  assert.match(snapshot, /FindingGroups:/u);
  assert.match(snapshot, /TS-SEM-R001/u);
  assert.equal(compact.includes(diagnosticRoot), false);
  assert.match(compact, /dist\/index\.d\.ts/u);
  assert.match(compact, /src\/index\.ts/u);
});

function goldenSnapshot(): string {
  return fs.readFileSync(
    path.join(projectRoot, "tests", "snapshots", "agent_snapshot_project.snap"),
    "utf8",
  );
}

function assertCompactSnapshotDesign(snapshot: string, hiddenPaths: readonly string[]): void {
  const lines = snapshot.trimEnd().split("\n");
  assert.match(lines[0] ?? "", /^Modules: source=\d+/u);
  assertOrderedSections(lines);
  assert.doesNotMatch(snapshot, /^\{/u);
  assert.doesNotMatch(snapshot, /"modules"|"projectScope"|"rootPaths"/u);
  assert.doesNotMatch(
    snapshot,
    /\bdependencies\b|\bdevDependencies\b|\bpeerDependencies\b|\boptionalDependencies\b/u,
  );
  for (const hiddenPath of hiddenPaths) {
    assert.equal(
      snapshot.includes(hiddenPath),
      false,
      `snapshot leaked absolute path: ${hiddenPath}`,
    );
  }
}

function assertOrderedSections(lines: readonly string[]): void {
  const sectionIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) =>
      snapshotSectionOrder.includes(line as (typeof snapshotSectionOrder)[number]),
    );
  const orderBySection: ReadonlyMap<string, number> = new Map(
    snapshotSectionOrder.map((section, order) => [section, order]),
  );
  let previousOrder = -1;
  for (const { line } of sectionIndexes) {
    const order = orderBySection.get(line);
    if (order === undefined) {
      assert.fail(`unexpected agent snapshot section: ${line}`);
    }
    assert.ok(order > previousOrder, `snapshot section out of order: ${line}`);
    previousOrder = order;
  }
}

function runCliCapture(
  argv: readonly string[],
  cwd: string,
): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(
    argv,
    {
      stdout: { write: (chunk: string) => void (stdout += chunk) },
      stderr: { write: (chunk: string) => void (stderr += chunk) },
    },
    cwd,
  );
  return { exitCode, stdout, stderr };
}

function diagnosticReport(
  root: string,
  sourcePath: string,
  message: string,
): TypeScriptHarnessReport {
  return {
    runMode: "project",
    modules: [],
    findings: [
      {
        ruleId: "TS-SEM-R001",
        packId: "typescript.semantic",
        severity: "info",
        title: "TypeScript semantic diagnostics should be visible",
        summary: `TS6305: ${message}`,
        location: { path: sourcePath, line: 1, column: 0 },
        requirement:
          "TypeScript Program semantic diagnostics should be visible from parser-native facts without replacing tsc.",
        label: "TypeScript semantic diagnostic",
        labels: { parser: "typescript-program", surface: "source" },
      },
    ],
    rootPaths: [root],
    blockingSeverities: ["warning", "error"],
    blockingRuleIds: [],
    reasoningTree: {
      runMode: "project",
      projectRoot: root,
      compilerOptions: {
        rootDirs: [],
        allowJs: false,
        checkJs: false,
        noEmit: false,
        composite: false,
        declaration: false,
        emitDeclarationOnly: false,
        declarationMap: false,
        sourceMap: false,
      },
      projectReferences: [],
      projectReferenceResolutions: [],
      sourceRoots: [path.join(root, "src")],
      testRoots: [],
      pathAliases: [],
      packageEntrypoints: [],
      packageExports: [],
      packageImports: [],
      packageBins: [],
      packageScripts: [],
      packageWorkspaces: [],
      workspacePackages: [],
      workspacePatterns: [],
      projectReferencePackages: [],
      packageImportOwners: [],
      packageEntryResolutions: [],
      diagnostics: [
        {
          ownerPath: sourcePath,
          phase: "semantic",
          code: 6305,
          category: "error",
          message,
          location: { path: sourcePath, line: 1, column: 0 },
          relatedInformation: [],
        },
      ],
      modules: [
        {
          path: sourcePath,
          role: "source",
          layer: "harness",
          isValid: true,
          hasIntentDoc: false,
          lineCount: 1,
          syntaxDiagnosticCount: 0,
          semanticDiagnosticCount: 1,
          exportNames: [],
          typeOnlyExportNames: [],
          importSpecifiers: [],
        },
      ],
      ownerBranches: [],
      ownerDependencies: [],
      edges: [],
    },
  };
}
