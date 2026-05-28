import path from "node:path";
import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningTree,
  TypeScriptReasoningOwnerBranchFact,
} from "../model.js";

export function renderGuide(report: TypeScriptHarnessReport, topic: string): string {
  const tree = report.reasoningTree;
  const lines: string[] = [`[guide] "${topic}"`];
  const topicLower = topic.toLowerCase();
  // Use the topic directly — no hardcoded synonym expansion.
  // The agent discovers vocabulary through the signals we provide.

  // ── Step 1: Find candidate domains ──
  const domains = extractDomains(tree, topicLower);
  if (domains.length === 0) {
    // Fallback: show top global domains as starting points
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

  // ── Step 2: Vocabulary discovery (help agent learn the project's language) ──
  const topExports = topExportNames(domains, 20);
  if (topExports.length > 0) {
    lines.push("");
    lines.push("Vocabulary (top export names across matching domains):");
    lines.push(`  ${topExports.join(", ")}`);
  }

  // ── Step 3: Related concepts (export-based co-occurrence) ──
  const related = relatedConcepts(domains, topicLower);
  if (related.length > 0) {
    lines.push("");
    lines.push(`Refine with: ${related.map(r => `--search "${r}"`).join(", ")}`);
  }

  // ── Step 4: Top matching domains ──
  const showDomains = domains.slice(0, 4);
  lines.push("");
  lines.push(showDomains.length < domains.length
    ? `Top ${showDomains.length} of ${domains.length} matching domains:`
    : `Matching domains:`);

  for (const d of showDomains) {
    lines.push(`  ${d.dir}/  ${d.branches} branches, ${d.exports} exports`);
    // Show domain signature — most distinctive exports
    const sig = domainSignature(d);
    if (sig.length > 0) {
      lines.push(`    signature: ${sig.slice(0, 6).join(", ")}`);
    }
    // Key entry points
    const entries = d.branchesList
      .filter(b => b.roles.includes("facade") || b.roles.includes("entrypoint"))
      .slice(0, 2);
    for (const b of entries) {
      const rel = path.relative(tree.projectRoot, b.path) || ".";
      lines.push(`    entry: ${rel} [${b.roles.join(",")}]`);
    }
  }
  if (domains.length > showDomains.length) {
    lines.push(`  ... +${domains.length - showDomains.length} more`);
  }

  // ── Step 5: Suggested refinement ──
  lines.push("");
  lines.push("Explore:");
  const topDomain = domains[0]!;
  lines.push(`  --domain ${topDomain.dir}  to see all branches`);
  lines.push(`  --search "<keyword>"  to find specific files`);
  if (topExports.length > 0) {
    const example = topExports.find(e => !topicLower.includes(e.toLowerCase())) ?? topExports[0]!;
    lines.push(`  try: --search "${example}"`);
  }

  return lines.join("\n") + "\n";
}

// ── Domain extraction ─────────────────────────────────────

interface GuidedDomain {
  readonly dir: string;
  readonly branches: number;
  readonly exports: number;
  readonly branchesList: readonly (TypeScriptReasoningOwnerBranchFact & { hasDoc: boolean })[];
}

function extractDomains(tree: TypeScriptReasoningTree, topic: string): GuidedDomain[] {
  const scored: { dir: string; score: number; branches: TypeScriptReasoningOwnerBranchFact[] }[] = [];

  // Group branches by domain (top 2-3 dirs for package-level, 4 for sub-domains)
  const domainBranches = new Map<string, TypeScriptReasoningOwnerBranchFact[]>();
  for (const b of tree.ownerBranches) {
    if (b.roles.includes("config")) continue;
    const rel = path.relative(tree.projectRoot, b.path);
    const parts = rel.split(path.sep).filter(s => s !== ".");
    if (parts.length === 0) continue;
    // Package level: packages/effect
    const pkg = parts.slice(0, parts[0] === "packages" ? 2 : 1).join("/");
    // Sub-domain level: packages/effect/benchmark, packages/effect/src
    const sub = parts.length >= 4 ? parts.slice(0, 4).join("/") : parts.join("/");
    
    if (!domainBranches.has(pkg)) domainBranches.set(pkg, []);
    domainBranches.get(pkg)!.push(b);
    
    if (sub !== pkg && parts.length >= 4) {
      if (!domainBranches.has(sub)) domainBranches.set(sub, []);
      domainBranches.get(sub)!.push(b);
    }
  }

  // Common stop words that add noise to search
  const stopWords = new Set(["a", "an", "the", "with", "for", "and", "to", "in", "of", "is", "how", "what", "i", "do", "does", "use"]);

  for (const [dir, branches] of domainBranches) {
    let score = 0;
    // Match by directory name (strong signal)
    for (const word of topic.split(/\s+/)) {
      if (stopWords.has(word)) continue;
      if (dir.toLowerCase().includes(word)) score += 5;
    }
    // Match by export names (weaker signal, capped per word)
    const allExports = new Set(branches.flatMap(b => b.exportNames.map(e => e.toLowerCase())));
    for (const word of topic.split(/\s+/)) {
      if (stopWords.has(word)) continue;
      let matchCount = 0;
      for (const exp of allExports) {
        if (exp.includes(word)) matchCount++;
        if (matchCount >= 5) break; // cap at 5 per word to avoid over-scoring
      }
      score += matchCount;
    }
    if (score > 0) {
      scored.push({ dir, score, branches });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ dir, score, branches }) => ({
      dir,
      branches: branches.length,
      exports: branches.reduce((sum, b) => sum + b.exportNames.length, 0),
      branchesList: branches
        .slice(0, 15)
        .map(b => ({
          ...b,
          hasDoc: b.hasIntentDoc && b.importSummary.totalImports > 0,
          // proxy — we don't have doc quality in the branch object
        })) as GuidedDomain["branchesList"],
    }));
}

// ── Vocabulary discovery ──────────────────────────────────

/** Top export names across matching domains, sorted by frequency (noise filtered). */
function topExportNames(domains: readonly GuidedDomain[], limit: number): string[] {
  const noiseWords = new Set(["typeid", "make", "layer", "empty", "map", "head", "flatten", "match", "filter", "get", "fail", "succeed", "zip", "of", "do", "*", "default"]);
  const counts = new Map<string, number>();
  for (const d of domains) {
    for (const b of d.branchesList) {
      for (const exp of b.exportNames) {
        if (noiseWords.has(exp.toLowerCase())) continue;
        counts.set(exp, (counts.get(exp) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/** Find export names that co-occur with topic-related files. */
function relatedConcepts(domains: readonly GuidedDomain[], topic: string): string[] {
  // Find files that match the topic
  const topicWords = topic.split(/\s+/).filter(w => w.length > 2);
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

  // Find exports that appear in matching files but aren't in the topic
  const seen = new Set<string>();
  for (const d of domains) {
    for (const b of d.branchesList) {
      if (!matchingFiles.has(b.path)) continue;
      for (const exp of b.exportNames) {
        const lower = exp.toLowerCase();
        if (!topicWords.some(w => lower.includes(w))) {
          seen.add(exp);
        }
      }
    }
  }

  return [...seen].slice(0, 8);
}

/** Most distinctive exports of a domain (those NOT shared with other domains). */
function domainSignature(d: GuidedDomain): string[] {
  // Simple heuristic: exports that appear in this domain's branches
  const exports = new Set<string>();
  for (const b of d.branchesList) {
    for (const exp of b.exportNames.slice(0, 3)) {
      exports.add(exp);
    }
  }
  return [...exports].slice(0, 10);
}
