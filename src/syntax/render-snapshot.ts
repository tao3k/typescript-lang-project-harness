import type { TsAgentSnapshot, TsOwnerBranch, TsOwnerDependency, TsFindingGroup } from "./model.js";

export function renderAgentSnapshot(snapshot: TsAgentSnapshot): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `Modules: source=${snapshot.moduleCount} roots=${snapshot.rootCount} branches=${snapshot.branchCount} deps=${snapshot.dependencyCount}`,
  );
  lines.push("");

  // Owner Branches
  lines.push("OwnerBranches:");
  for (const branch of snapshot.ownerBranches) {
    lines.push(renderOwnerBranch(branch));
  }
  lines.push("");

  // Owner Dependencies
  if (snapshot.ownerDependencies.length > 0) {
    lines.push("OwnerDependencies:");
    for (const dep of snapshot.ownerDependencies) {
      lines.push(renderOwnerDependency(dep));
    }
    lines.push("");
  }

  // Finding Groups
  if (snapshot.findingGroups.length > 0) {
    lines.push("FindingGroups:");
    for (const group of snapshot.findingGroups) {
      lines.push(renderFindingGroup(group));
    }
    lines.push("");
  }

  // Clean: no final blank line
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function renderOwnerBranch(branch: TsOwnerBranch): string {
  const roleTag = `[${branch.role}]`;
  const rootTag = branch.isRoot ? " [root]" : "";
  return ` - ${branch.path} ${roleTag}${rootTag} owner=${branch.owner}`;
}

function renderOwnerDependency(dep: TsOwnerDependency): string {
  const arrow = dep.edgeKind === "layer" ? "--layer-->" : "--owner-->";
  return ` - ${dep.fromOwner} ${arrow} ${dep.toOwner}`;
}

function renderFindingGroup(group: TsFindingGroup): string {
  return ` - ${group.severity} ${group.ruleId} x${group.count} first=${group.firstTarget} ${group.message}`;
}
