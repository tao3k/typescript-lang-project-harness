import fs from "node:fs";

import { pathFromInput, discoverTypeScriptFiles, parseTypeScriptSourceFile } from "../parser.js";
import { defaultTypeScriptHarnessConfig } from "../config.js";
import { buildExplicitTypeScriptReasoningTree } from "../reasoning.js";
import { evaluateDefaultRulePacks } from "../rules.js";
import { renderAssertionMessage } from "../render.js";
import { isTypeScriptHarnessClean } from "../model.js";
import type { TypeScriptHarnessConfig, TypeScriptHarnessReport } from "../model.js";

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
  const files = discoverTypeScriptFiles(
    roots,
    config.ignoredDirNames,
    config.includeHiddenDirNames,
  );
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
