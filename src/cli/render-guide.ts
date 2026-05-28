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

  // ── Step 1: Find candidate domains ──
  const domains = extractDomains(tree, topicLower);
  if (domains.length === 0) {
    lines.push("");
    lines.push("No matching domains found. Try:");
    lines.push("  --tree to see all domains");
    lines.push("  --harness to see policy findings");
    return lines.join("\n") + "\n";
  }

  // ── Step 2: Export patterns (shared contracts) ──
  const patterns = extractPatterns(tree, domains);
  if (patterns.length > 0) {
    lines.push("");
    lines.push("Shared contracts (recurring export patterns):");
    for (const p of patterns.slice(0, 6)) {
      const domainList = p.domains.slice(0, 4).join(", ");
      lines.push(`  ${p.suffix} → ${domainList}${p.domains.length > 4 ? ` +${p.domains.length - 4}` : ""}`);
    }
  }

  // ── Step 3: Top domains (merged with entry files) ──
  const showDomains = domains.slice(0, 4);
  lines.push("");
  lines.push(showDomains.length < domains.length
    ? `Top ${showDomains.length} of ${domains.length} matching domains:`
    : `Matching domains:`);

  for (const d of showDomains) {
    const label = `${d.dir}/  ${d.branches} branches, ${d.exports} exports`;
    lines.push(`  ${label}`);
    // Show key entry files for each domain
    const entries = d.branchesList
      .filter(b => b.roles.includes("facade") || b.roles.includes("entrypoint"))
      .slice(0, 3);
    const others = d.branchesList
      .filter(b => !b.roles.includes("facade") && !b.roles.includes("entrypoint"))
      .slice(0, 2);
    for (const b of [...entries, ...others]) {
      const rel = path.relative(tree.projectRoot, b.path) || ".";
      const exports = b.exportNames.slice(0, 5).join(", ");
      const tag = b.roles.includes("facade") ? " [facade]" : b.roles.includes("entrypoint") ? " [entry]" : "";
      lines.push(`    ${rel}${tag}  → ${exports}${b.exportNames.length > 5 ? " ..." : ""}`);
    }
  }
  if (domains.length > showDomains.length) {
    lines.push(`  ... +${domains.length - showDomains.length} more`);
  }

  // ── Step 4: Suggested next steps ──
  lines.push("");
  lines.push("Next:");
  const topDomain = domains[0]!;
  lines.push(`  --domain ${topDomain.dir}  to see all branches in this domain`);
  lines.push(`  --deps <path>  to trace a specific file's dependencies`);
  lines.push(`  --harness  to check for policy findings`);

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

  // Group branches by domain (top 2 dirs)
  const domainBranches = new Map<string, TypeScriptReasoningOwnerBranchFact[]>();
  for (const b of tree.ownerBranches) {
    if (b.roles.includes("config")) continue;
    const rel = path.relative(tree.projectRoot, b.path);
    const parts = rel.split(path.sep).filter(s => s !== ".");
    const dir = parts.slice(0, parts.length >= 2 ? 2 : 1).join("/");
    if (!domainBranches.has(dir)) domainBranches.set(dir, []);
    domainBranches.get(dir)!.push(b);
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

// ── Pattern extraction ────────────────────────────────────

interface ExportPattern {
  readonly suffix: string;
  readonly domains: readonly string[];
}

const PATTERN_SUFFIXES = [
  "Client", "Migrator", "Config", "ClientConfig",
  "Service", "Layer", "Error", "Schema",
  "Model", "Factory", "Provider", "Adapter",
  "Middleware", "Handler", "Router",
];

function extractPatterns(tree: TypeScriptReasoningTree, domains: readonly GuidedDomain[]): ExportPattern[] {
  const patterns = new Map<string, Set<string>>();
  for (const d of domains) {
    for (const suffix of PATTERN_SUFFIXES) {
      for (const b of d.branchesList) {
        if (b.exportNames.some(e => e.endsWith(suffix) && e !== suffix)) {
          if (!patterns.has(suffix)) patterns.set(suffix, new Set());
          patterns.get(suffix)!.add(d.dir);
        }
      }
    }
  }
  return [...patterns.entries()]
    .filter(([_, domains]) => domains.size >= 2) // must appear in at least 2 domains
    .sort((a, b) => b[1].size - a[1].size)
    .map(([suffix, domains]) => ({ suffix, domains: [...domains].sort() }));
}
