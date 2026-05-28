import path from "node:path";
import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningTree,
  TypeScriptReasoningOwnerBranchFact,
} from "../model.js";
import { relativeTo, computeTopology, fanInLabel, isRootBranch } from "./utils.js";

const MAX_EXTERNAL_DEPS = 10;

export function renderDomain(report: TypeScriptHarnessReport, domainPath: string): string {
  const tree = report.reasoningTree;
  const resolved = path.resolve(tree.projectRoot, domainPath);
  const { fanIn, fanOut } = computeTopology(report);

  const domainBranches = tree.ownerBranches.filter(
    (b) => b.path.startsWith(resolved) || relativeTo(tree, b.path).startsWith(domainPath),
  );
  const branchPaths = new Set(domainBranches.map((b) => b.path));

  if (domainBranches.length === 0) {
    return `[domain] no branches in "${domainPath}"\n  try --tree to see domains\n`;
  }

  const domainRel = relativeTo(tree, resolved) || domainPath;
  const lines: string[] = [`[domain] ${domainRel}  (${domainBranches.length} branches)`];

  // Sub-namespace structure
  const subgroups = buildSubgroups(tree, domainBranches, domainRel);
  for (const [subNs, bs] of [...subgroups.entries()].sort()) {
    if (bs.length === 1) {
      const b = bs[0]!;
      const rel = relativeTo(tree, b.path);
      const exports = b.exportNames.slice(0, 8).join(", ");
      const edgeCount = b.childEdges.length;
      const deps = edgeCount > 0 ? ` deps=${edgeCount}` : "";
      lines.push(
        `  ${rel}${fanInLabel(fanIn.get(b.path) ?? 0)}  [${b.roles.join(",")}]  exports: ${exports}${deps}`,
      );
    } else {
      const totalExports = bs.reduce((sum, b) => sum + b.exportNames.length, 0);
      const totalEdges = bs.reduce((sum, b) => sum + b.childEdges.length, 0);
      const allRoles = [...new Set(bs.flatMap((b) => b.roles))];
      const allExports = [...new Set(bs.flatMap((b) => b.exportNames))].slice(0, 10);
      lines.push(
        `  ${domainRel}/${subNs}/  [${allRoles.join(",")}]  ${bs.length} branches, ${totalExports} exports, ${totalEdges} edges`,
      );
      lines.push(`    exports: ${allExports.join(", ")}${allExports.length >= 10 ? " …" : ""}`);
    }
  }

  // Architecture grouping
  const foundations = domainBranches.filter((b) => (fanIn.get(b.path) ?? 0) >= 10);
  const orchestrators = domainBranches.filter((b) => (fanOut.get(b.path) ?? 0) >= 5);
  if (foundations.length > 0 || orchestrators.length > 0) {
    lines.push("");
    if (foundations.length > 0) {
      const names = foundations.slice(0, 5).map((b) => path.basename(b.path, ".ts"));
      const tail = foundations.length > 5 ? ` +${foundations.length - 5}` : "";
      lines.push(`  foundations: ${names.join(", ")}${tail}`);
    }
    if (orchestrators.length > 0) {
      const names = orchestrators.slice(0, 5).map((b) => path.basename(b.path, ".ts"));
      const tail = orchestrators.length > 5 ? ` +${orchestrators.length - 5}` : "";
      lines.push(`  orchestrators: ${names.join(", ")}${tail}`);
    }
  }

  // External boundary
  const outsideImports = tree.ownerDependencies.filter(
    (d) => !d.isTestContext && branchPaths.has(d.fromPath) && !branchPaths.has(d.toPath ?? ""),
  );
  if (outsideImports.length > 0) {
    lines.push("");
    lines.push(`  imports from outside (${outsideImports.length}):`);
    for (const [domain, files] of groupDepsByDomain(outsideImports, tree, "from")) {
      const tail = files.length > 5 ? ` +${files.length - 5}` : "";
      lines.push(`    ← [${domain}] ${files.slice(0, 5).join(", ")}${tail}`);
    }
  }

  const outsideExports = tree.ownerDependencies.filter(
    (d) => !d.isTestContext && !branchPaths.has(d.fromPath) && branchPaths.has(d.toPath ?? ""),
  );
  if (outsideExports.length > 0) {
    lines.push("");
    lines.push(`  exported to outside (${outsideExports.length}):`);
    for (const [domain, files] of groupDepsByDomain(outsideExports, tree, "to")) {
      const tail = files.length > 5 ? ` +${files.length - 5}` : "";
      lines.push(`    → [${domain}] ${files.slice(0, 5).join(", ")}${tail}`);
    }
  }

  // Internal deps
  const internalDeps = tree.ownerDependencies.filter(
    (d) => !d.isTestContext && branchPaths.has(d.fromPath) && branchPaths.has(d.toPath ?? ""),
  );
  if (internalDeps.length > 0) {
    lines.push("");
    lines.push(`  internal deps (${internalDeps.length}):`);
    for (const d of internalDeps.slice(0, MAX_EXTERNAL_DEPS)) {
      lines.push(
        `    ${relativeTo(tree, d.fromPath)} → ${d.toPath ? relativeTo(tree, d.toPath) : d.moduleSpecifier}  [${d.resolution}]`,
      );
    }
    if (internalDeps.length > MAX_EXTERNAL_DEPS) {
      lines.push(`    ... +${internalDeps.length - MAX_EXTERNAL_DEPS} more`);
    }
  }

  return lines.join("\n") + "\n";
}

function buildSubgroups(
  tree: TypeScriptReasoningTree,
  branches: readonly TypeScriptReasoningOwnerBranchFact[],
  domainRel: string,
): Map<string, TypeScriptReasoningOwnerBranchFact[]> {
  const subgroups = new Map<string, TypeScriptReasoningOwnerBranchFact[]>();
  for (const b of branches) {
    const rel = relativeTo(tree, b.path);
    const sub = rel
      .slice(domainRel.length)
      .split("/")
      .filter((s) => s.length > 0);
    const key = sub.length > 0 ? sub[0]! : ".";
    const existing = subgroups.get(key);
    if (existing) {
      existing.push(b);
    } else {
      subgroups.set(key, [b]);
    }
  }
  return subgroups;
}

function groupDepsByDomain(
  deps: readonly { fromPath: string; toPath?: string; moduleSpecifier: string }[],
  tree: TypeScriptReasoningTree,
  direction: "from" | "to",
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const d of deps) {
    const domain =
      direction === "from"
        ? relativeTo(tree, d.fromPath).split("/").slice(0, 2).join("/")
        : (d.toPath ? relativeTo(tree, d.toPath) : d.moduleSpecifier)
            .split("/")
            .slice(0, 2)
            .join("/");
    const file =
      direction === "from"
        ? (relativeTo(tree, d.fromPath).split("/").pop() ?? relativeTo(tree, d.fromPath))
        : d.toPath
          ? (relativeTo(tree, d.toPath).split("/").pop() ?? relativeTo(tree, d.toPath))
          : "?";
    const existing = groups.get(domain);
    if (existing) {
      existing.push(file);
    } else {
      groups.set(domain, [file]);
    }
  }
  return groups;
}
