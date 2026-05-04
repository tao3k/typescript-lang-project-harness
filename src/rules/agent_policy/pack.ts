import type {
  TypeScriptHarnessFinding,
  TypeScriptHarnessRule,
  TypeScriptPackageEntryResolutionFact,
  TypeScriptReasoningTree,
} from "../../model.js";

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

export function typeScriptAgentPolicyRules(): readonly TypeScriptHarnessRule[] {
  return [TS_AGENT_R001, TS_AGENT_R002, TS_AGENT_R003];
}

export function evaluateAgentPolicyRules(
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

function packageConditionsLabel(conditions: readonly string[]): string {
  return conditions.length === 0 ? "" : ` (${conditions.join("/")})`;
}
