import path from "node:path";
import type { TypeScriptHarnessReport, TypeScriptReasoningTree } from "../model.js";
import {
  relativeTo,
  computeTopology,
  docLabel,
  extractNamespace,
  fanInLabel,
  isRootBranch,
} from "./utils.js";

const MAX_RESULTS = 20;

export function renderSearch(report: TypeScriptHarnessReport, pattern: string): string {
  const tree = report.reasoningTree;
  const patternLower = pattern.toLowerCase();
  const { fanIn } = computeTopology(report);

  const results: SearchResult[] = [];
  for (const b of tree.ownerBranches) {
    if (b.roles.includes("config")) continue;
    const rel = relativeTo(tree, b.path);
    let score = 0;
    if (rel.toLowerCase().includes(patternLower)) score += 2;
    for (const exp of b.exportNames) {
      if (exp.toLowerCase().includes(patternLower)) score += 3;
    }
    if (score > 0) {
      results.push({ branch: b, score, fanIn: fanIn.get(b.path) ?? 0, relPath: rel });
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
      const roleTag = isRootBranch(r.branch.roles) ? ` [${r.branch.roles.join(",")}]` : "";
      lines.push(
        `    ${r.relPath}${roleTag}${docLabel(r.branch.path)}${fanInLabel(r.fanIn)}  → ${exports}${more}`,
      );
    }
  }

  return lines.join("\n") + "\n";
}

type SearchResult = {
  branch: TypeScriptReasoningTree["ownerBranches"][number];
  score: number;
  fanIn: number;
  relPath: string;
};

function groupByDomain(results: readonly SearchResult[]): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>();
  for (const r of results) {
    const parts = r.relPath.split(path.sep).filter((s) => s !== ".");
    const domain = parts.slice(0, parts.length >= 3 ? 3 : parts.length).join("/");
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain)!.push(r);
  }
  return groups;
}
