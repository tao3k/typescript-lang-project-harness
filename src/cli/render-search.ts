import fs from "node:fs";
import path from "node:path";
import type { TypeScriptHarnessReport, TypeScriptReasoningTree } from "../model.js";

const MAX_RESULTS = 20;

/** Search branches by export name and path pattern. */
export function renderSearch(report: TypeScriptHarnessReport, pattern: string): string {
  const tree = report.reasoningTree;
  const patternLower = pattern.toLowerCase();
  const branches = tree.ownerBranches;
  const fanIn = computeFanIn(tree);

  type SearchResult = {
    branch: (typeof branches)[number];
    score: number;
    fanIn: number;
    relPath: string;
  };
  const results: SearchResult[] = [];
  for (const b of branches) {
    if (b.roles.includes("config")) continue;
    const relPath = relativeTo(tree, b.path);
    const relLower = relPath.toLowerCase();
    let score = 0;
    if (relLower.includes(patternLower)) score += 2;
    for (const exp of b.exportNames) {
      if (exp.toLowerCase().includes(patternLower)) score += 3;
    }
    const fi = fanIn.get(b.path) ?? 0;
    if (score > 0) {
      results.push({ branch: b, score, fanIn: fi, relPath });
    }
  }
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, MAX_RESULTS);

  if (top.length === 0) {
    return `[search] no branches matching "${pattern}"\n  try --tree to see all domains\n`;
  }

  const lines: string[] = [`[search] "${pattern}" → ${top.length} matches`];
  const groups = groupByDomain(top);

  for (const [domain, items] of groups) {
    lines.push("");
    lines.push(`  ${domain}/`);
    for (const r of items) {
      const exports = r.branch.exportNames.slice(0, 6).join(", ");
      const more = r.branch.exportNames.length > 6 ? " …" : "";
      const roles = r.branch.roles.includes("facade")
        ? " [facade]"
        : r.branch.roles.includes("entrypoint")
          ? " [entry]"
          : "";
      // Doc quality signal (#2)
      const docSignal = docQuality(r.branch.path);
      const docLabel = docSignal > 20 ? " ★doc" : docSignal > 0 ? " ·doc" : "";
      const fiLabel = r.fanIn >= 3 ? ` ←${r.fanIn}` : "";
      lines.push(`    ${r.relPath}${roles}${docLabel}${fiLabel}  → ${exports}${more}`);
    }
  }

  return lines.join("\n") + "\n";
}

function computeFanIn(tree: TypeScriptReasoningTree): Map<string, number> {
  const fanIn = new Map<string, number>();
  for (const d of tree.ownerDependencies) {
    if (d.isTestContext || d.toPath === undefined) continue;
    fanIn.set(d.toPath, (fanIn.get(d.toPath) ?? 0) + 1);
  }
  return fanIn;
}

function groupByDomain(
  results: readonly {
    branch: { path: string; exportNames: readonly string[]; roles: readonly string[] };
    score: number;
    fanIn: number;
    relPath: string;
  }[],
): Map<string, typeof results> {
  const groups = new Map<string, (typeof results)[number][]>();
  for (const r of results) {
    const parts = r.relPath.split(path.sep).filter((s) => s !== ".");
    const domain = parts.slice(0, parts.length >= 3 ? 3 : parts.length).join("/");
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain)!.push(r);
  }
  return groups;
}

/** Compute doc quality: meaningful word count (excludes @since/@category boilerplate). */
function docQuality(filePath: string): number {
  try {
    const src = fs.readFileSync(filePath, "utf8");
    const match = src.match(/\/\*\*[\s\S]*?\*\//);
    if (!match) return 0;
    const doc = match[0];
    const clean = doc
      .replace(/@since.*/g, "")
      .replace(/@category.*/g, "")
      .replace(/@experimental/g, "");
    return clean
      .replace(/[\*\s\/]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2).length;
  } catch {
    return 0;
  }
}

function relativeTo(tree: TypeScriptReasoningTree, filePath: string): string {
  return path.relative(tree.projectRoot, filePath) || ".";
}
