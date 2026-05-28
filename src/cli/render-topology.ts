/** Dependency graph topology: foundations (most imported), orchestrators (most imports), bridges, and meaningful orphans. */
import path from "node:path";
import type { TypeScriptHarnessReport, TypeScriptReasoningTree } from "../model.js";
import { relativeTo, computeTopology, isDocSiteFile } from "./utils.js";

const TOP_K = 8;

const TOPOLOGY_SKIP_PATTERNS = [
  "/dtslint/",
  "/test/",
  "/tests/",
  "/benchmark/",
  "/vitest/",
  ".test.",
  ".spec.",
  ".tst.",
];

export function renderTopology(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const { fanIn, fanOut } = computeTopology(report);

  // Filter noise
  const deps = tree.ownerDependencies.filter(
    (d) =>
      !d.isTestContext &&
      !isTopologyNoise(d.fromPath) &&
      (d.toPath === undefined || !isTopologyNoise(d.toPath)),
  );

  // Recompute fanIn/fanOut from filtered deps for clean display
  const cleanFanIn = new Map<string, number>();
  const cleanFanOut = new Map<string, number>();
  for (const d of deps) {
    cleanFanOut.set(d.fromPath, (cleanFanOut.get(d.fromPath) ?? 0) + 1);
    if (d.toPath !== undefined) {
      cleanFanIn.set(d.toPath, (cleanFanIn.get(d.toPath) ?? 0) + 1);
    }
  }

  const lines: string[] = ["[topology]"];

  // Foundations
  const topFanIn = [...cleanFanIn.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_K);
  if (topFanIn.length > 0) {
    lines.push("");
    lines.push("Foundations (most imported):");
    for (const [mod, count] of topFanIn) {
      lines.push(`  ←${count}  ${relativeTo(tree, mod)}`);
    }
  }

  // Orchestrators
  const topFanOut = [...cleanFanOut.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_K);
  if (topFanOut.length > 0) {
    lines.push("");
    lines.push("Orchestrators (most imports):");
    for (const [mod, count] of topFanOut) {
      lines.push(`  →${count}  ${relativeTo(tree, mod)}`);
    }
  }

  // Bridges
  const bridges = tree.ownerBranches
    .filter((b) => {
      const fi = cleanFanIn.get(b.path) ?? 0;
      const fo = cleanFanOut.get(b.path) ?? 0;
      return fi >= 3 && fo >= 3;
    })
    .sort((a, b) => {
      const aScore = (cleanFanIn.get(a.path) ?? 0) + (cleanFanOut.get(a.path) ?? 0);
      const bScore = (cleanFanIn.get(b.path) ?? 0) + (cleanFanOut.get(b.path) ?? 0);
      return bScore - aScore;
    });
  if (bridges.length > 0) {
    lines.push("");
    lines.push("Bridges (high fan-in + fan-out):");
    for (const b of bridges) {
      const fi = cleanFanIn.get(b.path) ?? 0;
      const fo = cleanFanOut.get(b.path) ?? 0;
      lines.push(`  ←${fi} →${fo}  ${relativeTo(tree, b.path)}  [${b.roles.join(",")}]`);
    }
  }

  // Orphaned (exclude doc sites)
  const meaningfulOrphans = tree.orphanedSourceFiles.filter((f) => !isDocSiteFile(f));
  if (meaningfulOrphans.length > 0) {
    const total = tree.orphanedSourceFiles.length;
    const note =
      total > meaningfulOrphans.length
        ? ` (${total - meaningfulOrphans.length} doc-site excluded)`
        : "";
    lines.push("");
    lines.push(`Orphaned: ${meaningfulOrphans.length} files${note}`);
    for (const o of meaningfulOrphans.slice(0, 5)) {
      lines.push(`  ${relativeTo(tree, o)}`);
    }
    if (meaningfulOrphans.length > 5) {
      lines.push(`  ... +${meaningfulOrphans.length - 5} more`);
    }
  }

  return lines.join("\n") + "\n";
}

function isTopologyNoise(filePath: string): boolean {
  return TOPOLOGY_SKIP_PATTERNS.some((p) => filePath.includes(p));
}
