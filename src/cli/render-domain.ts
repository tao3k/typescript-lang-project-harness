import path from "node:path";
import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningTree,
  TypeScriptReasoningOwnerBranchFact,
} from "../model.js";

const MAX_EXTERNAL_DEPS = 10;

export function renderDomain(report: TypeScriptHarnessReport, domainPath: string): string {
  const tree = report.reasoningTree;
  const resolved = path.resolve(tree.projectRoot, domainPath);

  // Compute fan-in
  const fanIn = new Map<string, number>();
  for (const d of tree.ownerDependencies) {
    if (d.isTestContext || d.toPath === undefined) continue;
    fanIn.set(d.toPath, (fanIn.get(d.toPath) ?? 0) + 1);
  }

  // Collect branch paths in this domain
  const domainBranches = tree.ownerBranches.filter(
    (b) => b.path.startsWith(resolved) || relativeTo(tree, b.path).startsWith(domainPath),
  );
  const branchPaths = new Set(domainBranches.map((b) => b.path));

  if (domainBranches.length === 0) {
    return `[domain] no branches in "${domainPath}"\n  try --tree to see domains\n`;
  }

  const domainRel = relativeTo(tree, resolved) || domainPath;
  const lines: string[] = [`[domain] ${domainRel}  (${domainBranches.length} branches)`];

  // ── Sub-namespace structure ──
  const subgroups = buildSubgroups(tree, domainBranches, domainRel);
  for (const [subNs, bs] of [...subgroups.entries()].sort()) {
    if (bs.length === 1) {
      const b = bs[0]!;
      const rel = relativeTo(tree, b.path);
      const exports = b.exportNames.slice(0, 8).join(", ");
      const fi = fanIn.get(b.path) ?? 0;
      const fiLabel = fi >= 3 ? ` ←${fi}` : ""; // Only show meaningful fan-in
      const edgeCount = b.childEdges.length;
      const deps = edgeCount > 0 ? ` deps=${edgeCount}` : "";
      lines.push(`  ${rel}${fiLabel}  [${b.roles.join(",")}]  exports: ${exports}${deps}`);
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

  // ── Imports from outside ──
  const outsideImports = tree.ownerDependencies.filter(
    (d) => !d.isTestContext && branchPaths.has(d.fromPath) && !branchPaths.has(d.toPath ?? ""),
  );
  if (outsideImports.length > 0) {
    const grouped = groupByTargetDomain(outsideImports, tree, branchPaths);
    lines.push("");
    lines.push(`  imports from outside (${outsideImports.length}):`);
    for (const [domainKey, files] of grouped) {
      lines.push(
        `    ← [${domainKey}] ${files.slice(0, 5).join(", ")}${files.length > 5 ? ` +${files.length - 5}` : ""}`,
      );
    }
  }

  // ── Exported to outside ──
  const outsideExports = tree.ownerDependencies.filter(
    (d) => !d.isTestContext && !branchPaths.has(d.fromPath) && branchPaths.has(d.toPath ?? ""),
  );
  if (outsideExports.length > 0) {
    const grouped = groupBySourceDomain(outsideExports, tree, branchPaths);
    lines.push("");
    lines.push(`  exported to outside (${outsideExports.length}):`);
    for (const [domainKey, files] of grouped) {
      lines.push(
        `    → [${domainKey}] ${files.slice(0, 5).join(", ")}${files.length > 5 ? ` +${files.length - 5}` : ""}`,
      );
    }
  }

  // ── Architecture grouping (#7): high fan-in, high fan-out, bridges ──
  const fanOut = new Map<string, number>();
  for (const d of tree.ownerDependencies) {
    if (d.isTestContext) continue;
    fanOut.set(d.fromPath, (fanOut.get(d.fromPath) ?? 0) + 1);
  }

  const foundations = domainBranches.filter((b) => (fanIn.get(b.path) ?? 0) >= 10);
  const orchestrators = domainBranches.filter((b) => (fanOut.get(b.path) ?? 0) >= 5);
  if (foundations.length > 0 || orchestrators.length > 0) {
    lines.push("");
    if (foundations.length > 0) {
      const names = foundations.slice(0, 5).map((b) => path.basename(b.path, ".ts"));
      lines.push(
        `  foundations: ${names.join(", ")}${foundations.length > 5 ? ` +${foundations.length - 5}` : ""}`,
      );
    }
    if (orchestrators.length > 0) {
      const names = orchestrators.slice(0, 5).map((b) => path.basename(b.path, ".ts"));
      lines.push(
        `  orchestrators: ${names.join(", ")}${orchestrators.length > 5 ? ` +${orchestrators.length - 5}` : ""}`,
      );
    }
  }

  // ── Internal deps ──
  const internalDeps = tree.ownerDependencies.filter(
    (d) => !d.isTestContext && branchPaths.has(d.fromPath) && branchPaths.has(d.toPath ?? ""),
  );
  if (internalDeps.length > 0) {
    lines.push("");
    lines.push(`  internal deps (${internalDeps.length}):`);
    for (const d of internalDeps.slice(0, MAX_EXTERNAL_DEPS)) {
      const from = relativeTo(tree, d.fromPath);
      const to = d.toPath ? relativeTo(tree, d.toPath) : d.moduleSpecifier;
      lines.push(`    ${from} → ${to}  [${d.resolution}]`);
    }
    if (internalDeps.length > MAX_EXTERNAL_DEPS) {
      lines.push(`    ... +${internalDeps.length - MAX_EXTERNAL_DEPS} more`);
    }
  }

  return lines.join("\n") + "\n";
}

// ── Subgroups ──────────────────────────────────────────────

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

// ── Domain grouping for external deps ──────────────────────

function groupByTargetDomain(
  deps: readonly { fromPath: string; toPath?: string; moduleSpecifier: string }[],
  tree: TypeScriptReasoningTree,
  branchPaths: Set<string>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const d of deps) {
    const target = d.toPath !== undefined ? relativeTo(tree, d.toPath) : d.moduleSpecifier;
    const domain = target.split("/").slice(0, 2).join("/");
    const fromShort = relativeTo(tree, d.fromPath).split("/").pop() ?? relativeTo(tree, d.fromPath);
    const existing = groups.get(domain);
    if (existing) {
      existing.push(fromShort);
    } else {
      groups.set(domain, [fromShort]);
    }
  }
  return groups;
}

function groupBySourceDomain(
  deps: readonly { fromPath: string; toPath?: string }[],
  tree: TypeScriptReasoningTree,
  branchPaths: Set<string>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const d of deps) {
    const fromDomain = relativeTo(tree, d.fromPath).split("/").slice(0, 2).join("/");
    const toShort =
      d.toPath !== undefined
        ? (relativeTo(tree, d.toPath).split("/").pop() ?? relativeTo(tree, d.toPath))
        : "?";
    const existing = groups.get(fromDomain);
    if (existing) {
      existing.push(toShort);
    } else {
      groups.set(fromDomain, [toShort]);
    }
  }
  return groups;
}

function relativeTo(tree: TypeScriptReasoningTree, filePath: string): string {
  return path.relative(tree.projectRoot, filePath) || ".";
}
