/**
 * CLI —tree renderer.
 * Compresses the reasoning tree into an agent-friendly compact summary.
 */

import path from "node:path";
import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningTree,
  TypeScriptReasoningOwnerBranchFact,
} from "../model.js";

const MAX_BRANCH_LINES = 24;

/** Render reasoning tree in agent-friendly compact format. */
export function renderTree(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const lines: string[] = [];

  appendSummary(lines, tree);
  appendExtensions(lines, tree);
  appendBuildTools(lines, tree);
  appendWorkspaces(lines, tree);
  appendAliases(lines, tree);
  appendBranches(lines, tree);
  appendDependencies(lines, tree);
  appendFindingGroups(lines, report);
  lines.push(verificationHint(report));

  return lines.join("\n") + "\n\n";
}

function appendSummary(lines: string[], tree: TypeScriptReasoningTree): void {
  const modules = tree.modules.length;
  const roots = tree.modules.filter((m) => m.role === "entrypoint" || m.role === "facade").length;
  const branches = tree.ownerBranches.length;
  const deps = tree.ownerDependencies.filter((d) => !d.isTestContext).length;
  const orphaned =
    tree.orphanedSourceFiles.length > 0 ? `, ${tree.orphanedSourceFiles.length} orphaned` : "";
  lines.push(
    `Modules: ${modules} files, ${roots} roots, ${branches} branches, ${deps} deps${orphaned}`,
  );
}

function appendExtensions(lines: string[], tree: TypeScriptReasoningTree): void {
  if (tree.packageExtensions.length === 0) return;
  const labels = tree.packageExtensions
    .map((e) => `${e.name}=${e.activation}`)
    .sort()
    .join(", ");
  lines.push("Extensions: " + labels);
}

function appendBuildTools(lines: string[], tree: TypeScriptReasoningTree): void {
  if (tree.packageBuildTools.length === 0) return;
  const names = tree.packageBuildTools
    .map((t) => t.name)
    .sort()
    .join(", ");
  lines.push("BuildTools: " + names);
}

function appendWorkspaces(lines: string[], tree: TypeScriptReasoningTree): void {
  if (tree.workspacePackages.length === 0) return;
  lines.push("Workspaces: " + tree.workspacePackages.join(", "));
}

function appendAliases(lines: string[], tree: TypeScriptReasoningTree): void {
  if (tree.pathAliases.length === 0) return;
  lines.push("Paths: " + tree.pathAliases.map((a) => a.pattern).join(", "));
}

function appendBranches(lines: string[], tree: TypeScriptReasoningTree): void {
  const branches = tree.ownerBranches.length;
  if (branches === 0) return;
  lines.push("OwnerBranches:");
  const visible = tree.ownerBranches.slice(0, MAX_BRANCH_LINES);
  for (const branch of visible) {
    lines.push(formatBranch(tree, branch));
  }
  if (branches > MAX_BRANCH_LINES) {
    lines.push(`  ... +${branches - MAX_BRANCH_LINES} more branches`);
  }
}

function appendDependencies(lines: string[], tree: TypeScriptReasoningTree): void {
  const deps = tree.ownerDependencies.filter((d) => !d.isTestContext).length;
  if (deps === 0) return;
  lines.push("OwnerDependencies:");
  const grouped = groupDependencies(tree);
  for (const g of grouped.slice(0, 30)) {
    lines.push(`  ${g.label}`);
  }
  if (grouped.length > 30) {
    lines.push(`  ... +${grouped.length - 30} more edges`);
  }
}

function appendFindingGroups(lines: string[], report: TypeScriptHarnessReport): void {
  const groups = collectFindingGroups(report);
  if (groups.length === 0) return;
  lines.push("FindingGroups:");
  for (const g of groups) {
    lines.push(`  ${g.severity} ${g.ruleId} x${g.count} — ${g.title}`);
  }
}

function formatBranch(
  tree: TypeScriptReasoningTree,
  branch: TypeScriptReasoningOwnerBranchFact,
): string {
  const relPath = relativeTo(tree, branch.path);
  const role = branch.roles.includes("facade")
    ? "facade"
    : branch.roles.includes("entrypoint")
      ? "entrypoint"
      : branch.roles.join(",");
  const exportsCount = branch.exportNames.length;
  const importSummary = branch.importSummary;
  const deps =
    importSummary.totalImports > 0
      ? ` ${importSummary.relativeImports}rel/${importSummary.externalImports}ext`
      : "";

  // Show child edges as destination owners
  const targets = branch.childEdges
    .map((e) => e.toPath ?? e.moduleSpecifier)
    .filter((t, i, arr) => arr.indexOf(t) === i) // unique
    .slice(0, 5)
    .map((t) => relativeTo(tree, t));
  const targetLabel =
    targets.length > 0
      ? ` → ${targets.join(", ")}${branch.childEdges.length > 5 ? "..." : ""}`
      : "";

  return `  ${relPath} [${role}] exports=${exportsCount}${deps}${targetLabel}`;
}

interface GroupedDep {
  readonly label: string;
  readonly key: string;
}

function groupDependencies(tree: TypeScriptReasoningTree): GroupedDep[] {
  const deps = tree.ownerDependencies.filter((d) => !d.isTestContext);
  const fanOut = new Map<string, { from: string; tos: Set<string> }>();

  for (const dep of deps) {
    const from = relativeTo(tree, dep.fromPath);
    const to = dep.toPath ? relativeTo(tree, dep.toPath) : dep.moduleSpecifier;
    const key = from;
    const group = fanOut.get(key);
    if (group) {
      group.tos.add(to);
    } else {
      fanOut.set(key, { from, tos: new Set([to]) });
    }
  }

  return [...fanOut.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      key,
      label: `  ${group.from} → ${[...group.tos].sort().join(", ")}`,
    }));
}

function collectFindingGroups(report: TypeScriptHarnessReport) {
  const groups = new Map<
    string,
    { severity: string; ruleId: string; title: string; count: number }
  >();
  for (const f of report.findings) {
    const key = `${f.severity}:${f.ruleId}:${f.title}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
    } else {
      groups.set(key, { severity: f.severity, ruleId: f.ruleId, title: f.title, count: 1 });
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.severity.localeCompare(b.severity) || a.ruleId.localeCompare(b.ruleId),
  );
}

function verificationHint(report: TypeScriptHarnessReport): string {
  if (!("verificationPlan" in report)) return "";
  return `[verify] active`;
}

function relativeTo(tree: TypeScriptReasoningTree, filePath: string): string {
  return path.relative(tree.projectRoot, filePath) || ".";
}
