import path from "node:path";
import type { TypeScriptHarnessReport, TypeScriptReasoningTree } from "../model.js";

const TOP_K = 8;

/** Paths to exclude from topology signals (test/dtslint/benchmark noise). */
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

function isTopologyNoise(filePath: string): boolean {
  return TOPOLOGY_SKIP_PATTERNS.some((p) => filePath.includes(p));
}

/** Check if a keyword suggests benchmark/performance exploration. */
export function isPerformanceTopic(topic: string): boolean {
  const perfWords = ["benchmark", "performance", "perf", "optimize", "micro"];
  return perfWords.some((w) => topic.toLowerCase().includes(w));
}

export function renderTopology(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const deps = tree.ownerDependencies.filter(
    (d) =>
      !d.isTestContext &&
      !isTopologyNoise(d.fromPath) &&
      (d.toPath === undefined || !isTopologyNoise(d.toPath)),
  );

  // Fan-in: how many modules import each target
  const fanIn = new Map<string, number>();
  for (const d of deps) {
    if (d.toPath === undefined) continue;
    const key = d.toPath;
    fanIn.set(key, (fanIn.get(key) ?? 0) + 1);
  }

  // Fan-out: how many modules each source imports
  const fanOut = new Map<string, number>();
  for (const d of deps) {
    const key = d.fromPath;
    fanOut.set(key, (fanOut.get(key) ?? 0) + 1);
  }

  const lines: string[] = ["[topology]"];

  // Top by fan-in (foundations)
  const topFanIn = [...fanIn.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_K);
  if (topFanIn.length > 0) {
    lines.push("");
    lines.push("Foundations (most imported):");
    for (const [mod, count] of topFanIn) {
      lines.push(`  ←${count}  ${relativeTo(tree, mod)}`);
    }
  }

  // Top by fan-out (orchestrators)
  const topFanOut = [...fanOut.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_K);
  if (topFanOut.length > 0) {
    lines.push("");
    lines.push("Orchestrators (most imports):");
    for (const [mod, count] of topFanOut) {
      lines.push(`  →${count}  ${relativeTo(tree, mod)}`);
    }
  }

  // Bridges: modules that are both highly imported and highly importing
  const bridges = tree.ownerBranches
    .filter((b) => {
      const fi = fanIn.get(b.path) ?? 0;
      const fo = fanOut.get(b.path) ?? 0;
      return fi >= 3 && fo >= 3;
    })
    .sort((a, b) => {
      const aScore = (fanIn.get(a.path) ?? 0) + (fanOut.get(a.path) ?? 0);
      const bScore = (fanIn.get(b.path) ?? 0) + (fanOut.get(b.path) ?? 0);
      return bScore - aScore;
    });
  if (bridges.length > 0) {
    lines.push("");
    lines.push("Bridges (high fan-in + fan-out):");
    for (const b of bridges) {
      const fi = fanIn.get(b.path) ?? 0;
      const fo = fanOut.get(b.path) ?? 0;
      lines.push(`  ←${fi} →${fo}  ${relativeTo(tree, b.path)}  [${b.roles.join(",")}]`);
    }
  }

  // Orphaned (exclude doc-site patterns)
  const docSitePatterns = ["/apps/", "/www/", "/docs/", "/examples/", "/public/"];
  const isDocSite = (f: string) => docSitePatterns.some((p) => f.includes(p));
  const meaningfulOrphans = tree.orphanedSourceFiles.filter((f) => !isDocSite(f));
  if (meaningfulOrphans.length > 0) {
    const total = tree.orphanedSourceFiles.length;
    const docSiteNote =
      total > meaningfulOrphans.length
        ? ` (${total - meaningfulOrphans.length} doc-site excluded)`
        : "";
    lines.push("");
    lines.push(`Orphaned: ${meaningfulOrphans.length} files${docSiteNote}`);
    for (const o of meaningfulOrphans.slice(0, 5)) {
      lines.push(`  ${relativeTo(tree, o)}`);
    }
    if (meaningfulOrphans.length > 5) lines.push(`  ... +${meaningfulOrphans.length - 5} more`);
  }

  return lines.join("\n") + "\n";
}

function relativeTo(tree: TypeScriptReasoningTree, filePath: string): string {
  return path.relative(tree.projectRoot, filePath) || ".";
}
