import path from "node:path";
import type { TypeScriptHarnessReport, TypeScriptReasoningTree } from "../model.js";
import { relativeTo, computeTopology, extractNamespace, fanInLabel } from "./utils.js";

export function renderDeps(report: TypeScriptHarnessReport, targetPath: string): string {
  const info = buildDepsInfo(report, targetPath);
  const { fanIn } = computeTopology(report);
  return formatDepsLines(info, fanIn.get(info.modulePath) ?? 0).join("\n") + "\n";
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

function formatDepsLines(info: DepsInfo, fanIn: number): string[] {
  const fiLabel = fanIn >= 3 ? `  ${fanInLabel(fanIn)} importers` : "";
  const lines: string[] = [`[deps] ${info.relPath}${fiLabel}`];

  if (info.roles.length > 0) {
    lines.push(`  roles: ${info.roles.join(", ")}`);
  }
  if (info.exportNames.length > 0) {
    const shown = info.exportNames.slice(0, 12);
    const tail = info.exportNames.length > 12 ? ` ... (${info.exportNames.length} total)` : "";
    lines.push(`  exports: ${shown.join(", ")}${tail}`);
  }

  formatEdgeGroup(lines, "imports", info.outgoing, "→", "target");
  formatEdgeGroup(lines, "imported by", info.incoming, "←", "from");

  return lines;
}

type EdgeItem = { target: string; resolution: string } | { from: string; resolution: string };

function formatEdgeGroup(
  lines: string[],
  label: string,
  edges: readonly EdgeItem[],
  arrow: string,
  keyField: "target" | "from",
): void {
  if (edges.length === 0) {
    lines.push(`  ${label}: none`);
    return;
  }
  const groups = groupEdgesByNamespace(edges, keyField);
  lines.push(`  ${label} (${edges.length}, ${groups.size} groups):`);
  for (const [ns, members] of groups) {
    const names = members.slice(0, 10).map((m) => {
      const parts = m.split("/");
      return parts.length > 2 ? parts[parts.length - 1]! : m;
    });
    const tail = members.length > 10 ? ` +${members.length - 10}` : "";
    lines.push(`    [${ns}] ${names.join(", ")}${tail}`);
  }
}

function groupEdgesByNamespace(
  edges: readonly EdgeItem[],
  keyField: "target" | "from",
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const item of edges) {
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
  return new Map([...groups.entries()].sort((a, b) => b[1].length - a[1].length));
}
