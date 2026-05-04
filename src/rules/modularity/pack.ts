import path from "node:path";

import type {
  TypeScriptHarnessFinding,
  TypeScriptHarnessRule,
  TypeScriptReasoningModule,
  TypeScriptReasoningTree,
} from "../../model.js";
import { relativeToProject } from "../common.js";

const TS_MOD_R001: TypeScriptHarnessRule = {
  ruleId: "TS-MOD-R001",
  packId: "typescript.modularity",
  severity: "info",
  title: "Source graph should not depend on tests",
  requirement:
    "Production source, facade, entrypoint, and config modules should not depend on parser-visible test owners.",
  labels: { surface: "module-graph", parser: "reasoning-tree" },
};

const TS_MOD_R002: TypeScriptHarnessRule = {
  ruleId: "TS-MOD-R002",
  packId: "typescript.modularity",
  severity: "info",
  title: "Project modules should stay bounded by layer",
  requirement:
    "Package project modules should stay below their layer size budgets and split by concern when they exceed them.",
  labels: { surface: "module-size", parser: "reasoning-tree" },
};

const MODULE_LAYER_LINE_LIMITS: Partial<Record<TypeScriptReasoningModule["layer"], number>> = {
  parser: 500,
  reasoning: 500,
  policy: 500,
  render: 500,
  model: 500,
  harness: 500,
};

export function typeScriptModularityRules(): readonly TypeScriptHarnessRule[] {
  return [TS_MOD_R001, TS_MOD_R002];
}

export function evaluateModularityRules(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  return [...evaluateSourceToTestRules(reasoningTree), ...evaluateLayerSizeRules(reasoningTree)];
}

function evaluateSourceToTestRules(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  return reasoningTree.ownerDependencies.flatMap((dependency) => {
    if (!isProductionRole(dependency.fromRole) || dependency.toRole !== "test") {
      return [];
    }
    return [
      {
        ruleId: TS_MOD_R001.ruleId,
        packId: TS_MOD_R001.packId,
        severity: TS_MOD_R001.severity,
        title: TS_MOD_R001.title,
        summary: `Module role '${dependency.fromRole}' depends on test owner '${dependency.moduleSpecifier}'.`,
        location: dependency.location,
        requirement: TS_MOD_R001.requirement,
        label: "source-to-test module edge",
        labels: TS_MOD_R001.labels,
      },
    ];
  });
}

function evaluateLayerSizeRules(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  return reasoningTree.modules.flatMap((moduleReport) => {
    const lineLimit = MODULE_LAYER_LINE_LIMITS[moduleReport.layer];
    if (lineLimit === undefined || moduleReport.lineCount <= lineLimit) {
      return [];
    }
    return [
      {
        ruleId: TS_MOD_R002.ruleId,
        packId: TS_MOD_R002.packId,
        severity: TS_MOD_R002.severity,
        title: TS_MOD_R002.title,
        summary: `Project module '${relativeToProject(reasoningTree, moduleReport.path)}' in ${moduleReport.layer} layer has ${moduleReport.lineCount} lines, above the ${lineLimit}-line budget.`,
        location: { path: moduleReport.path, line: 1, column: 0 },
        requirement: TS_MOD_R002.requirement,
        label: "oversized project module",
        labels: TS_MOD_R002.labels,
      },
    ];
  });
}

function isProductionRole(role: TypeScriptReasoningModule["role"]): boolean {
  return role === "source" || role === "facade" || role === "entrypoint" || role === "config";
}

export function isInsideAny(filePath: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const relativePath = path.relative(root, filePath);
    return (
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });
}
