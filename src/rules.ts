import path from "node:path";

import type {
  RulePackDescriptor,
  TypeScriptHarnessConfig,
  TypeScriptHarnessFinding,
  TypeScriptHarnessRule,
  TypeScriptPackageEntryResolutionFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningTree,
} from "./model.js";
import { diagnosticFinding, relativeToProject } from "./rules/common.js";
import { evaluateProjectPolicyRules } from "./rules/project_policy.js";
export { typeScriptProjectPolicyRules } from "./rules/project_policy.js";

const PACK_DESCRIPTORS: readonly RulePackDescriptor[] = [
  {
    id: "typescript.syntax",
    version: "0.1.0",
    domains: ["typescript", "syntax", "compiler-api"],
    defaultMode: "blocking",
  },
  {
    id: "typescript.semantic",
    version: "0.1.0",
    domains: ["typescript", "semantic", "compiler-api"],
    defaultMode: "advisory",
  },
  {
    id: "typescript.project_policy",
    version: "0.1.0",
    domains: ["typescript", "tsconfig", "project"],
    defaultMode: "blocking",
  },
  {
    id: "typescript.modularity",
    version: "0.1.0",
    domains: ["typescript", "modules", "ownership"],
    defaultMode: "advisory",
  },
  {
    id: "typescript.test_layout",
    version: "0.1.0",
    domains: ["typescript", "tests"],
    defaultMode: "advisory",
  },
  {
    id: "typescript.agent_policy",
    version: "0.1.0",
    domains: ["typescript", "agent", "repair"],
    defaultMode: "advisory",
  },
];

const TS_SYN_R001: TypeScriptHarnessRule = {
  ruleId: "TS-SYN-R001",
  packId: "typescript.syntax",
  severity: "error",
  title: "TypeScript source must parse",
  requirement: "TypeScript source must parse through the TypeScript Compiler API.",
  labels: { surface: "source", parser: "typescript" },
};

const TS_SEM_R001: TypeScriptHarnessRule = {
  ruleId: "TS-SEM-R001",
  packId: "typescript.semantic",
  severity: "info",
  title: "TypeScript semantic diagnostics should be visible",
  requirement:
    "TypeScript Program semantic diagnostics should be visible from parser-native facts without replacing tsc.",
  labels: { surface: "source", parser: "typescript-program" },
};

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

const TS_TEST_R001: TypeScriptHarnessRule = {
  ruleId: "TS-TEST-R001",
  packId: "typescript.test_layout",
  severity: "info",
  title: "Test modules should stay in configured test roots",
  requirement:
    "When a project has configured test roots, parser-visible test modules should live under those roots.",
  labels: { surface: "test-layout", parser: "reasoning-tree" },
};

const TS_AGENT_R001: TypeScriptHarnessRule = {
  ruleId: "TS-AGENT-R001",
  packId: "typescript.agent_policy",
  severity: "info",
  title: "Project import should resolve to an owner",
  requirement:
    "Relative, path-alias, and package-import TypeScript imports should resolve to a parser-visible project owner or be documented as non-TypeScript assets.",
  labels: { surface: "agent", parser: "reasoning-tree" },
};

const TS_AGENT_R002: TypeScriptHarnessRule = {
  ruleId: "TS-AGENT-R002",
  packId: "typescript.agent_policy",
  severity: "info",
  title: "Package entry should resolve to an owner",
  requirement:
    "Package exports and imports should point to parser-visible TypeScript owners or documented external artifacts.",
  labels: { surface: "agent", parser: "reasoning-tree" },
};

const TS_AGENT_R003: TypeScriptHarnessRule = {
  ruleId: "TS-AGENT-R003",
  packId: "typescript.agent_policy",
  severity: "info",
  title: "Facade with multiple owners needs intent",
  requirement:
    "Facade index modules that re-export multiple owners should include a local intent doc before exports.",
  labels: { surface: "agent", parser: "reasoning-tree" },
};

export function typeScriptRulePackDescriptors(): readonly RulePackDescriptor[] {
  return PACK_DESCRIPTORS;
}

export function typeScriptSyntaxRules(): readonly TypeScriptHarnessRule[] {
  return [TS_SYN_R001];
}

export function typeScriptSemanticRules(): readonly TypeScriptHarnessRule[] {
  return [TS_SEM_R001];
}

export function typeScriptModularityRules(): readonly TypeScriptHarnessRule[] {
  return [TS_MOD_R001, TS_MOD_R002];
}

export function typeScriptTestLayoutRules(): readonly TypeScriptHarnessRule[] {
  return [TS_TEST_R001];
}

export function typeScriptAgentPolicyRules(): readonly TypeScriptHarnessRule[] {
  return [TS_AGENT_R001, TS_AGENT_R002, TS_AGENT_R003];
}

export function evaluateDefaultRulePacks(
  reasoningTree: TypeScriptReasoningTree,
  config: TypeScriptHarnessConfig,
): readonly TypeScriptHarnessFinding[] {
  const findings = [
    ...evaluateSyntaxRules(reasoningTree),
    ...evaluateSemanticRules(reasoningTree),
    ...evaluateProjectPolicyRules(reasoningTree),
    ...evaluateModularityRules(reasoningTree),
    ...evaluateTestLayoutRules(reasoningTree),
    ...evaluateAgentPolicyRules(reasoningTree),
  ].filter((finding) => !config.disabledRuleIds.includes(finding.ruleId));
  return findings;
}

function evaluateSyntaxRules(reasoningTree: TypeScriptReasoningTree): TypeScriptHarnessFinding[] {
  return reasoningTree.diagnostics
    .filter((diagnostic) => diagnostic.phase === "syntax")
    .map((diagnostic) =>
      diagnosticFinding(TS_SYN_R001, diagnostic, "TypeScript parser diagnostic"),
    );
}

function evaluateSemanticRules(reasoningTree: TypeScriptReasoningTree): TypeScriptHarnessFinding[] {
  return reasoningTree.diagnostics
    .filter((diagnostic) => diagnostic.phase === "semantic")
    .map((diagnostic) =>
      diagnosticFinding(TS_SEM_R001, diagnostic, "TypeScript semantic diagnostic"),
    );
}

function evaluateModularityRules(
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

const MODULE_LAYER_LINE_LIMITS: Partial<Record<TypeScriptReasoningModule["layer"], number>> = {
  parser: 500,
  reasoning: 500,
  policy: 500,
  render: 500,
  model: 500,
  harness: 500,
};

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

function evaluateTestLayoutRules(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  if (reasoningTree.testRoots.length === 0) {
    return [];
  }
  return reasoningTree.modules.flatMap((moduleReport) => {
    if (moduleReport.role !== "test" || isInsideAny(moduleReport.path, reasoningTree.testRoots)) {
      return [];
    }
    return [
      {
        ruleId: TS_TEST_R001.ruleId,
        packId: TS_TEST_R001.packId,
        severity: TS_TEST_R001.severity,
        title: TS_TEST_R001.title,
        summary: `Test module '${relativeToProject(reasoningTree, moduleReport.path)}' is outside configured test roots.`,
        location: { path: moduleReport.path, line: 1, column: 0 },
        requirement: TS_TEST_R001.requirement,
        label: "test module outside test root",
        labels: TS_TEST_R001.labels,
      },
    ];
  });
}

function evaluateAgentPolicyRules(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  return reasoningTree.ownerDependencies
    .filter((dependency) => dependency.resolution === "unresolved")
    .map((dependency) => ({
      ruleId: TS_AGENT_R001.ruleId,
      packId: TS_AGENT_R001.packId,
      severity: TS_AGENT_R001.severity,
      title: TS_AGENT_R001.title,
      summary: `Project import '${dependency.moduleSpecifier}' does not resolve to a parser-visible TypeScript owner.`,
      location: dependency.location,
      requirement: TS_AGENT_R001.requirement,
      label: "unresolved project import edge",
      labels: TS_AGENT_R001.labels,
    }))
    .concat(evaluatePackageEntryAdvice(reasoningTree))
    .concat(evaluateFacadeIntentAdvice(reasoningTree));
}

function evaluatePackageEntryAdvice(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  return reasoningTree.packageEntryResolutions
    .filter(
      (entry): entry is TypeScriptPackageEntryResolutionFact =>
        entry.resolution === "unresolved" && (entry.kind === "exports" || entry.kind === "imports"),
    )
    .map((entry) => ({
      ruleId: TS_AGENT_R002.ruleId,
      packId: TS_AGENT_R002.packId,
      severity: TS_AGENT_R002.severity,
      title: TS_AGENT_R002.title,
      summary: `Package ${entry.kind} '${entry.subpath}'${packageConditionsLabel(entry.conditions)} target '${entry.target}' does not resolve to a parser-visible TypeScript owner.`,
      location: entry.location,
      requirement: TS_AGENT_R002.requirement,
      label: "unresolved package entry target",
      labels: TS_AGENT_R002.labels,
    }));
}

function packageConditionsLabel(conditions: readonly string[]): string {
  return conditions.length === 0 ? "" : ` (${conditions.join("/")})`;
}

function evaluateFacadeIntentAdvice(
  reasoningTree: TypeScriptReasoningTree,
): TypeScriptHarnessFinding[] {
  return reasoningTree.ownerBranches.flatMap((branch) => {
    if (!branch.roles.includes("facade") || branch.hasIntentDoc) {
      return [];
    }
    const ownerPaths = new Set(branch.childEdges.flatMap(ownerPath));
    if (ownerPaths.size < 2) {
      return [];
    }
    const firstEdge = branch.childEdges[0];
    return firstEdge === undefined
      ? []
      : [
          {
            ruleId: TS_AGENT_R003.ruleId,
            packId: TS_AGENT_R003.packId,
            severity: TS_AGENT_R003.severity,
            title: TS_AGENT_R003.title,
            summary: `Facade re-exports ${ownerPaths.size} owners without a local intent doc.`,
            location: firstEdge.location,
            requirement: TS_AGENT_R003.requirement,
            label: "facade re-export fan-out",
            labels: TS_AGENT_R003.labels,
          },
        ];
  });
}

function ownerPath(edge: { readonly toPath?: string }): string[] {
  return edge.toPath === undefined ? [] : [edge.toPath];
}

function isInsideAny(filePath: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const relativePath = path.relative(root, filePath);
    return (
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });
}
