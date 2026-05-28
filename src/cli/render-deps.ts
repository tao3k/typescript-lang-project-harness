import path from "node:path";
import type { TypeScriptHarnessReport, TypeScriptReasoningTree } from "../model.js";

export function renderDeps(report: TypeScriptHarnessReport, targetPath: string): string {
  const info = buildDepsInfo(report, targetPath);
  const fanIn = computeFanIn(report, info.modulePath);
  return formatDepsLines(info, fanIn).join("\n") + "\n";
}

function computeFanIn(report: TypeScriptHarnessReport, modulePath: string): number {
  return report.reasoningTree.ownerDependencies.filter(
    (d) => !d.isTestContext && d.toPath === modulePath,
  ).length;
}

interface DepsInfo {
  readonly modulePath: string;
  readonly relPath: string;
  readonly roles: readonly string[];
  readonly exportNames: readonly string[];
  readonly outgoing: readonly { target: string; resolution: string }[];
  readonly incoming: readonly { from: string; resolution: string }[];
}

function buildDepsInfo(report: TypeScriptHarnessReport, targetPath: string): DepsInfo {
  const tree = report.reasoningTree;
  const resolved = path.resolve(tree.projectRoot, targetPath);
  const branch = tree.ownerBranches.find(
    (b) => b.path === resolved || relativeTo(tree, b.path) === targetPath,
  );
  const modulePath = branch?.path ?? resolved;

  const outgoing = tree.ownerDependencies
    .filter((d) => d.fromPath === modulePath && !d.isTestContext)
    .map((d) => ({
      target: d.toPath !== undefined ? relativeTo(tree, d.toPath) : d.moduleSpecifier,
      resolution: d.resolution,
    }));

  const incoming = tree.ownerDependencies
    .filter((d) => d.toPath === modulePath && !d.isTestContext)
    .map((d) => ({ from: relativeTo(tree, d.fromPath), resolution: d.resolution }));

  return {
    modulePath,
    relPath: relativeTo(tree, modulePath),
    roles: branch?.roles ?? [],
    exportNames: branch?.exportNames ?? [],
    outgoing,
    incoming,
  };
}

function formatDepsLines(info: DepsInfo, fanIn: number = 0): string[] {
  const fiLabel = fanIn >= 3 ? `  ←${fanIn} importers` : ""; // Only show meaningful fan-in
  const lines: string[] = [`[deps] ${info.relPath}${fiLabel}`];

  if (info.roles.length > 0) {
    lines.push(`  roles: ${info.roles.join(", ")}`);
  }
  if (info.exportNames.length > 0) {
    const exports = info.exportNames.slice(0, 12);
    const tail = info.exportNames.length > 12 ? ` ... (${info.exportNames.length} total)` : "";
    lines.push(`  exports: ${exports.join(", ")}${tail}`);
  }

  // Grouped imports
  if (info.outgoing.length > 0) {
    lines.push(
      `  imports (${info.outgoing.length}, ${namespaceCount(info.outgoing, "target")} groups):`,
    );
    const groups = groupByNamespace(info.outgoing, "target");
    for (const [ns, members] of groups) {
      const names = members.slice(0, 10).map((m) => {
        // Strip common prefix for cleaner display
        const parts = m.split("/");
        return parts.length > 2 ? parts.slice(-1)[0] : (parts[parts.length - 1] ?? m);
      });
      const tail = members.length > 10 ? ` +${members.length - 10}` : "";
      lines.push(`    [${ns}] ${names.join(", ")}${tail}`);
    }
  } else {
    lines.push(`  imports: none`);
  }

  // Grouped incoming
  if (info.incoming.length > 0) {
    lines.push(
      `  imported by (${info.incoming.length}, ${namespaceCount(info.incoming, "from")} groups):`,
    );
    const groups = groupByNamespace(info.incoming, "from");
    for (const [ns, members] of groups) {
      const names = members.slice(0, 10).map((m) => {
        const parts = m.split("/");
        return parts.length > 2 ? parts.slice(-1)[0] : (parts[parts.length - 1] ?? m);
      });
      const tail = members.length > 10 ? ` +${members.length - 10}` : "";
      lines.push(`    [${ns}] ${names.join(", ")}${tail}`);
    }
  } else {
    lines.push(`  imported by: none`);
  }

  return lines;
}

// ── Namespace grouping ────────────────────────────────────

type EdgeItem = { target: string; resolution: string } | { from: string; resolution: string };

function namespaceCount(items: readonly EdgeItem[], keyField: "target" | "from"): number {
  return groupByNamespace(items, keyField).size;
}

function groupByNamespace(
  items: readonly EdgeItem[],
  keyField: "target" | "from",
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const rawPath =
      keyField === "target" ? (item as { target: string }).target : (item as { from: string }).from;
    const ns = extractNamespace(rawPath);
    const existing = groups.get(ns);
    if (existing) {
      existing.push(rawPath);
    } else {
      groups.set(ns, [rawPath]);
    }
  }
  // Sort groups: larger groups first
  return new Map([...groups.entries()].sort((a, b) => b[1].length - a[1].length));
}

function extractNamespace(filePath: string): string {
  // Package imports: use the package specifier as namespace
  if (filePath.startsWith("@")) {
    return filePath.split("/").slice(0, 2).join("/");
  }
  if (!filePath.includes("/")) {
    return filePath; // bare module specifier
  }
  // Extract meaningful namespace: skip common top-level dirs, use next 1-2 segments
  const dirs = filePath.split("/").filter((d) => d !== ".");
  if (dirs.length === 0) return ".";
  if (dirs.length === 1) return dirs[0]!;

  // Skip common top-level dirs (src, lib, packages, app)
  const skipTop = new Set(["src", "lib", "packages", "app", "dist"]);
  let i = 0;
  if (skipTop.has(dirs[0]!)) i = 1;

  if (i >= dirs.length) return dirs[dirs.length - 1]!;

  // Use next 1-2 meaningful segments
  const remaining = dirs.slice(i);
  if (remaining.length <= 2) return remaining.join("/");

  // For deeper paths, use first 2 meaningful segments
  return remaining.slice(0, 2).join("/");
}

function relativeTo(tree: TypeScriptReasoningTree, filePath: string): string {
  return path.relative(tree.projectRoot, filePath) || ".";
}
