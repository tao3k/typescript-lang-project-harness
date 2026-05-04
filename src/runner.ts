import fs from "node:fs";
import path from "node:path";

import {
  discoverTypeScriptFiles,
  parseTypeScriptProjectFiles,
  parseTypeScriptSourceFile,
  pathFromInput,
  projectFileNames,
  readProjectScope,
} from "./parser.js";
import { defaultTypeScriptHarnessConfig } from "./config.js";
import { buildExplicitTypeScriptReasoningTree, buildTypeScriptReasoningTree } from "./reasoning.js";
import { evaluateDefaultRulePacks } from "./rules.js";
import { renderAssertionMessage } from "./render.js";
import {
  isTypeScriptHarnessClean,
  type TypeScriptHarnessConfig,
  type TypeScriptHarnessReport,
  type TypeScriptProjectHarnessAgentSnapshot,
  type TypeScriptProjectHarnessAgentSnapshotPackage,
} from "./model.js";

export function runTypeScriptProjectHarness(
  projectRootInput: string | URL,
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptHarnessReport {
  const projectRoot = pathFromInput(projectRootInput);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`project root does not exist: ${projectRoot}`);
  }
  const scope = readProjectScope(projectRoot, config);
  const modules = parseTypeScriptProjectFiles(scope, projectFileNames(scope, config));
  const reasoningTree = buildTypeScriptReasoningTree(scope, modules);
  const findings = evaluateDefaultRulePacks(reasoningTree, config);
  return {
    runMode: reasoningTree.runMode,
    modules,
    findings,
    rootPaths: [scope.projectRoot],
    blockingSeverities: config.blockingSeverities,
    blockingRuleIds: config.blockingRuleIds,
    projectScope: scope,
    reasoningTree,
  };
}

export function runTypeScriptProjectHarnessAgentSnapshot(
  projectRootInput: string | URL,
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptProjectHarnessAgentSnapshot {
  return buildTypeScriptProjectHarnessAgentSnapshot(
    runTypeScriptProjectHarness(projectRootInput, config),
    config,
  );
}

export function buildTypeScriptProjectHarnessAgentSnapshot(
  rootReport: TypeScriptHarnessReport,
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptProjectHarnessAgentSnapshot {
  const projectRoot = rootReport.reasoningTree.projectRoot;
  const memberReports = agentSnapshotMemberPackageRoots(rootReport).map((packageRoot) =>
    runTypeScriptProjectHarness(packageRoot, config),
  );
  const packages = [rootReport, ...memberReports].map((report) =>
    agentSnapshotPackage(projectRoot, report),
  );
  return { projectRoot, packages };
}

export function runTypeScriptLangHarness(
  pathInputs: readonly (string | URL)[],
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptHarnessReport {
  const roots = pathInputs.map(pathFromInput);
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      throw new Error(`harness path does not exist: ${root}`);
    }
  }
  const files = discoverTypeScriptFiles(roots, config.ignoredDirNames);
  const modules = files.map((filePath) => parseTypeScriptSourceFile(filePath));
  const reasoningTree = buildExplicitTypeScriptReasoningTree(roots, modules);
  const findings = evaluateDefaultRulePacks(reasoningTree, config);
  return {
    runMode: reasoningTree.runMode,
    modules,
    findings,
    rootPaths: roots,
    blockingSeverities: config.blockingSeverities,
    blockingRuleIds: config.blockingRuleIds,
    reasoningTree,
  };
}

export function assertTypeScriptProjectHarnessClean(
  projectRootInput: string | URL,
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptHarnessReport {
  const report = runTypeScriptProjectHarness(projectRootInput, config);
  if (!isTypeScriptHarnessClean(report)) {
    throw new Error(renderAssertionMessage(report));
  }
  return report;
}

function agentSnapshotMemberPackageRoots(rootReport: TypeScriptHarnessReport): string[] {
  const projectRoot = path.resolve(rootReport.reasoningTree.projectRoot);
  const packageRoots = new Set<string>();
  for (const referencePackage of rootReport.reasoningTree.projectReferencePackages) {
    const packageRoot = path.resolve(referencePackage.path);
    if (packageRoot !== projectRoot) {
      packageRoots.add(packageRoot);
    }
  }
  for (const workspacePackage of rootReport.reasoningTree.workspacePackages) {
    const packageRoot = path.resolve(workspacePackage.path);
    if (packageRoot !== projectRoot) {
      packageRoots.add(packageRoot);
    }
  }
  return [...packageRoots].sort((left, right) => left.localeCompare(right));
}

function agentSnapshotPackage(
  snapshotRoot: string,
  report: TypeScriptHarnessReport,
): TypeScriptProjectHarnessAgentSnapshotPackage {
  const packageRoot = report.reasoningTree.projectRoot;
  return {
    packageRoot,
    packagePath: displayRelativePath(snapshotRoot, packageRoot),
    report,
  };
}

function displayRelativePath(root: string, child: string): string {
  const rendered = path.relative(root, child).replaceAll("\\", "/");
  return rendered.length === 0 ? "." : rendered;
}

export function assertTypeScriptLangHarnessClean(
  pathInputs: readonly (string | URL)[],
  config: TypeScriptHarnessConfig = defaultTypeScriptHarnessConfig(),
): TypeScriptHarnessReport {
  const report = runTypeScriptLangHarness(pathInputs, config);
  if (!isTypeScriptHarnessClean(report)) {
    throw new Error(renderAssertionMessage(report));
  }
  return report;
}
