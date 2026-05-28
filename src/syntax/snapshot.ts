import type { TsAgentSnapshot, TsFindingGroup, TsParsedModule } from "./model.js";
import { buildOwnerBranches, markRoots } from "./owners.js";
import { buildOwnerDependencies } from "./deps.js";

export function buildAgentSnapshot(
  projectRoot: string,
  modules: readonly TsParsedModule[],
): TsAgentSnapshot {
  const deps = buildOwnerDependencies(projectRoot, modules);
  const branches = markRoots(buildOwnerBranches(projectRoot, modules), deps);

  // Build findings from function shape facts
  const findings = buildFindings(modules);

  return {
    projectRoot,
    moduleCount: modules.length,
    rootCount: branches.filter((b) => b.isRoot).length,
    branchCount: branches.length,
    dependencyCount: deps.length,
    ownerBranches: branches,
    ownerDependencies: deps,
    findingGroups: findings,
  };
}

function buildFindings(modules: readonly TsParsedModule[]): readonly TsFindingGroup[] {
  const groups: TsFindingGroup[] = [];

  // Function shape findings
  const broadParamFunctions: Array<{ path: string; name: string }> = [];
  const deepNestedFunctions: Array<{ path: string; name: string }> = [];
  const highBranchFunctions: Array<{ path: string; name: string }> = [];

  for (const mod of modules) {
    for (const fn of mod.functions) {
      if (!fn.exported) continue;

      // Broad positional parameter surface (>3 positional params)
      if (fn.positionalParamCount > 3) {
        broadParamFunctions.push({ path: mod.path, name: fn.name });
      }

      // Deep nesting (>4 levels)
      if (fn.maxNestingDepth > 4) {
        deepNestedFunctions.push({ path: mod.path, name: fn.name });
      }

      // High branch count (>8)
      if (fn.branchCount > 8) {
        highBranchFunctions.push({ path: mod.path, name: fn.name });
      }
    }
  }

  if (broadParamFunctions.length > 0) {
    const first = broadParamFunctions[0]!;
    groups.push({
      ruleId: "AGENT-TS-R007",
      severity: "info",
      count: broadParamFunctions.length,
      firstTarget: first.path,
      message: `exported function exposes broad positional parameter surface (${first.name})`,
    });
  }

  if (deepNestedFunctions.length > 0) {
    const first = deepNestedFunctions[0]!;
    groups.push({
      ruleId: "AGENT-TS-R004",
      severity: "info",
      count: deepNestedFunctions.length,
      firstTarget: first.path,
      message: `exported function has deep nesting > 4 levels (${first.name})`,
    });
  }

  if (highBranchFunctions.length > 0) {
    const first = highBranchFunctions[0]!;
    groups.push({
      ruleId: "AGENT-TS-R005",
      severity: "info",
      count: highBranchFunctions.length,
      firstTarget: first.path,
      message: `exported function has high cyclomatic complexity (${first.name})`,
    });
  }

  return groups.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}
