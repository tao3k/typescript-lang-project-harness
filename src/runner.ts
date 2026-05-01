import fs from "node:fs";

import {
  DEFAULT_IGNORED_DIR_NAMES,
  discoverTypeScriptFiles,
  parseTypeScriptProjectFiles,
  parseTypeScriptSourceFile,
  pathFromInput,
  projectFileNames,
  readProjectScope,
} from "./parser.js";
import { buildExplicitTypeScriptReasoningTree, buildTypeScriptReasoningTree } from "./reasoning.js";
import { evaluateDefaultRulePacks } from "./rules.js";
import { renderAssertionMessage } from "./render.js";
import {
  isTypeScriptHarnessClean,
  type TypeScriptHarnessConfig,
  type TypeScriptHarnessReport,
} from "./model.js";

export function defaultTypeScriptHarnessConfig(): TypeScriptHarnessConfig {
  return {
    ignoredDirNames: [...DEFAULT_IGNORED_DIR_NAMES],
    includeTests: true,
    sourceDirNames: ["src"],
    testDirNames: ["tests"],
    blockingSeverities: ["warning", "error"],
    disabledRuleIds: [],
    blockingRuleIds: [],
  };
}

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
