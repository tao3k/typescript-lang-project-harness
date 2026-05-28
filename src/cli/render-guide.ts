import path from "node:path";
import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningTree,
  TypeScriptReasoningOwnerBranchFact,
} from "../model.js";
import { relativeTo, isGenericExportName, isRootBranch } from "./utils.js";

const AGENT_GUIDE = `# Reasoning Tree — Agent Guide

## Progressive Exploration Path

  1. --stats         One-line project identity (files, roots, branches, deps)
  2. --tree          Architecture map: domains by role, entrypoints
  3. --domain <dir>  Drill into a domain: branches, exports, boundary
  4. --search <pat>  Find files by export name or path pattern
  5. --deps <file>   Trace imports and importers (grouped by namespace)
  6. --topology      Key nodes: foundations, orchestrators, bridges
  7. --guide <topic> Vocabulary discovery + domain matching
  8. --harness       Policy findings (add --all for TS diagnostics)

## Signal Reference

  [core] [platform] [database] [ai] [process] [output] [entry]
    Architecture role — inferred from package name + deps
  [facade]     Re-exports from sub-modules (barrel/index pattern)
  [entrypoint] Runtime or binary entry point
  ←N           Fan-in: imported by N modules (shown when N >= 3)
  ·doc         Has module-level JSDoc content
  ★doc        High-quality documentation (> 20 words)
  ◆ bridge     Both high fan-in and high fan-out (critical node)

## Exploration Patterns

  Understand a monorepo:
    --stats → --tree → --domain <pkg> → --deps <index.ts>
  Find a feature:
    --guide <topic> → note vocabulary → --search <kw> → --deps <top>
  Trace a data flow:
    --deps <src> → note importers → --deps <each>
  Assess quality:
    --harness → note rules → --deps <file> → fix

## Tips

  - Start broad, narrow iteratively
  - Use vocabulary: --guide reveals project language
  - Read signals first: ←N = foundation, ·doc = where docs are
  - Default (no flags) shows this guide`;

export function renderGuide(report: TypeScriptHarnessReport, topic: string): string {
  if (topic.length === 0) return AGENT_GUIDE + "\n";

  const tree = report.reasoningTree;
  const lines: string[] = [`[guide] "${topic}"`];
  const topicLower = topic.toLowerCase();

  const domains = extractDomains(tree, topicLower);
  if (domains.length === 0) {
    const globalDomains = extractDomains(tree, "").slice(0, 6);
    lines.push("");
    lines.push(`No direct matches for "${topic}". Try exploring these domains:`);
    for (const d of globalDomains) {
      lines.push(`  ${d.dir}/  ${d.branches} branches, ${d.exports} exports`);
      const sig = domainSignature(d);
      if (sig.length > 0) {
        lines.push(`    signature: ${sig.slice(0, 6).join(", ")}`);
      }
    }
    lines.push("");
    lines.push(`  --search "<keyword>" within any domain to find specific files`);
    const topExport = topExportNames(globalDomains, 1)[0];
    if (topExport) lines.push(`  try: --search "${topExport}"`);
    return lines.join("\n") + "\n";
  }

  // Vocabulary
  const topExports = topExportNames(domains, 20);
  if (topExports.length > 0) {
    lines.push("");
    lines.push("Vocabulary (top export names across matching domains):");
    lines.push(`  ${topExports.join(", ")}`);
  }

  // Related concepts
  const related = relatedConcepts(domains, topicLower);
  if (related.length > 0) {
    lines.push("");
    lines.push(`Refine with: ${related.map((r) => `--search "${r}"`).join(", ")}`);
  }

  // Top domains
  const showDomains = domains.slice(0, 4);
  lines.push("");
  lines.push(
    showDomains.length < domains.length
      ? `Top ${showDomains.length} of ${domains.length} matching domains:`
      : "Matching domains:",
  );

  for (const d of showDomains) {
    lines.push(`  ${d.dir}/  ${d.branches} branches, ${d.exports} exports`);
    const sig = domainSignature(d);
    if (sig.length > 0) {
      lines.push(`    signature: ${sig.slice(0, 6).join(", ")}`);
    }
    for (const b of d.branchesList.filter((b) => isRootBranch(b.roles)).slice(0, 2)) {
      lines.push(`    entry: ${relativeTo(tree, b.path)} [${b.roles.join(",")}]`);
    }
  }
  if (domains.length > showDomains.length) {
    lines.push(`  ... +${domains.length - showDomains.length} more`);
  }

  // Exploration hints
  lines.push("");
  lines.push("Explore:");
  const topDomain = domains[0]!;
  lines.push(`  --domain ${topDomain.dir}  to see all branches`);
  lines.push(`  --search "<keyword>"  to find specific files`);
  if (topExports.length > 0) {
    const example = topExports.find((e) => !topicLower.includes(e.toLowerCase())) ?? topExports[0]!;
    lines.push(`  try: --search "${example}"`);
  }

  return lines.join("\n") + "\n";
}

// ── Domain extraction ─────────────────────────────────────

interface GuidedDomain {
  readonly dir: string;
  readonly branches: number;
  readonly exports: number;
  readonly branchesList: readonly TypeScriptReasoningOwnerBranchFact[];
}

function extractDomains(tree: TypeScriptReasoningTree, topic: string): GuidedDomain[] {
  const words = topic.split(/\s+/).filter((w) => w.length > 1);
  const domainBranches = new Map<string, TypeScriptReasoningOwnerBranchFact[]>();
  for (const b of tree.ownerBranches) {
    if (b.roles.includes("config")) continue;
    const rel = relativeTo(tree, b.path);
    const parts = rel.split(path.sep).filter((s) => s !== ".");
    if (parts.length === 0) continue;
    const pkg = parts.slice(0, parts[0] === "packages" ? 2 : 1).join("/");
    const sub = parts.length >= 4 ? parts.slice(0, 4).join("/") : parts.join("/");
    if (!domainBranches.has(pkg)) domainBranches.set(pkg, []);
    domainBranches.get(pkg)!.push(b);
    if (sub !== pkg && parts.length >= 4) {
      if (!domainBranches.has(sub)) domainBranches.set(sub, []);
      domainBranches.get(sub)!.push(b);
    }
  }

  const scored: { dir: string; score: number; branches: TypeScriptReasoningOwnerBranchFact[] }[] =
    [];
  for (const [dir, branches] of domainBranches) {
    let score = 0;
    for (const word of words) {
      if (dir.toLowerCase().includes(word)) score += 5;
    }
    const allExports = new Set(branches.flatMap((b) => b.exportNames.map((e) => e.toLowerCase())));
    for (const word of words) {
      let matchCount = 0;
      for (const exp of allExports) {
        if (exp.includes(word)) matchCount++;
        if (matchCount >= 5) break;
      }
      score += matchCount;
    }
    if (score > 0) scored.push({ dir, score, branches });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ dir, branches }) => ({
      dir,
      branches: branches.length,
      exports: branches.reduce((sum, b) => sum + b.exportNames.length, 0),
      branchesList: branches.slice(0, 15),
    }));
}

function topExportNames(domains: readonly GuidedDomain[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const d of domains) {
    for (const b of d.branchesList) {
      for (const exp of b.exportNames) {
        if (isGenericExportName(exp)) continue;
        counts.set(exp, (counts.get(exp) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function relatedConcepts(domains: readonly GuidedDomain[], topic: string): string[] {
  const topicWords = topic.split(/\s+/).filter((w) => w.length > 2);
  const matchingFiles = new Set<string>();
  for (const d of domains) {
    for (const b of d.branchesList) {
      const rel = b.path.toLowerCase();
      const exportsStr = b.exportNames.join(" ").toLowerCase();
      for (const w of topicWords) {
        if (exportsStr.includes(w) || rel.includes(w)) {
          matchingFiles.add(b.path);
          break;
        }
      }
    }
  }
  const seen = new Set<string>();
  for (const d of domains) {
    for (const b of d.branchesList) {
      if (!matchingFiles.has(b.path)) continue;
      for (const exp of b.exportNames) {
        const lower = exp.toLowerCase();
        if (!topicWords.some((w) => lower.includes(w))) {
          seen.add(exp);
        }
      }
    }
  }
  return [...seen].slice(0, 8);
}

function domainSignature(d: GuidedDomain): string[] {
  const exports = new Set<string>();
  for (const b of d.branchesList) {
    for (const exp of b.exportNames.slice(0, 3)) {
      exports.add(exp);
    }
  }
  return [...exports].slice(0, 10);
}
