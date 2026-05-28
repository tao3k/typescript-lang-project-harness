import path from "node:path";
import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningTree,
  TypeScriptReasoningOwnerBranchFact,
} from "../model.js";

const MAX_BRANCHES_TO_SHOW = 20;
const MAX_EXPORTS_TO_SHOW = 8;

export function renderTree(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const branches = tree.ownerBranches;
  const lines: string[] = [];

  // ── 1. Summary ──
  lines.push(treeSummaryLine(tree));

  // ── 2. Architecture domains (ordered by data-flow role) ──
  const domains = buildArchDomains(branches, tree);
  if (domains.length > 0) {
    lines.push("");
    lines.push("Architecture:");
    for (const d of domains) {
      const entryLabel = d.isEntry ? " ◆ entry" : "";
      const bridgeNote = d.isBridge ? " ◆ bridge" : "";
      lines.push(`  [${d.role}] ${d.dir}/  ${d.branchCount} branches${entryLabel}${bridgeNote}`);
      // Show top-level export surface hints
      if (d.topExports.length > 0) {
        lines.push(
          `    exports: ${d.topExports.slice(0, 8).join(", ")}${d.topExports.length > 8 ? " …" : ""}`,
        );
      }
    }
  }

  // ── 3. Entrypoints ──
  const entrypoints = branches.filter(
    (b) => b.roles.includes("facade") || b.roles.includes("entrypoint"),
  );
  if (entrypoints.length > 0) {
    lines.push("");
    lines.push("Entrypoints:");
    for (const ep of entrypoints) {
      lines.push(
        `  ${relativeTo(tree, ep.path)}  [${ep.roles.join(",")}]  exports=${ep.exportNames.length}`,
      );
    }
  }

  // ── 4. Remaining branches: collapse to count ──
  const otherBranches = branches.filter(
    (b) => !b.roles.includes("facade") && !b.roles.includes("entrypoint"),
  );
  if (otherBranches.length > 0) {
    const domainHints = [
      ...new Set(otherBranches.map((b) => domainKey(relativeTo(tree, b.path)))),
    ].slice(0, 5);
    lines.push("");
    lines.push(`${otherBranches.length} internal branches  (use --domain <name> to explore)`);
    lines.push(`  domains: ${domainHints.join(", ")}`);
  }

  // ── 5. Hints ──
  if (report.findings.length > 0) {
    lines.push("");
    lines.push(`use --harness to see ${report.findings.length} policy findings`);
  }
  if (tree.ownerDependencies.length > 100) {
    lines.push(`use --topology for key dependency nodes`);
  }

  return lines.join("\n") + "\n";
}

// ── Architecture role inference ────────────────────────────

interface ArchDomain {
  readonly dir: string;
  readonly role: ArchRole;
  readonly branchCount: number;
  readonly topExports: readonly string[];
  readonly isEntry: boolean;
  readonly isBridge: boolean;
}

type ArchRole =
  | "core"
  | "data"
  | "input"
  | "platform"
  | "database"
  | "ai"
  | "process"
  | "output"
  | "entry"
  | "internal";

const ROLE_ORDER: Record<ArchRole, number> = {
  core: 0,
  data: 1,
  input: 2,
  platform: 3,
  database: 4,
  ai: 5,
  process: 6,
  output: 7,
  entry: 8,
  internal: 9,
};

function buildArchDomains(
  branches: readonly TypeScriptReasoningOwnerBranchFact[],
  tree: TypeScriptReasoningTree,
): ArchDomain[] {
  // Group branches by domain key
  const domainBranches = new Map<string, TypeScriptReasoningOwnerBranchFact[]>();
  for (const b of branches) {
    const key = domainKey(relativeTo(tree, b.path));
    const existing = domainBranches.get(key);
    if (existing) {
      existing.push(b);
    } else {
      domainBranches.set(key, [b]);
    }
  }

  // Compute fan-in / fan-out per domain
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const d of tree.ownerDependencies) {
    if (d.isTestContext) continue;
    const fromDomain = domainKey(relativeTo(tree, d.fromPath));
    const toDomain = d.toPath !== undefined ? domainKey(relativeTo(tree, d.toPath)) : undefined;
    fanOut.set(fromDomain, (fanOut.get(fromDomain) ?? 0) + 1);
    if (toDomain !== undefined) {
      fanIn.set(toDomain, (fanIn.get(toDomain) ?? 0) + 1);
    }
  }

  const domains: ArchDomain[] = [];
  for (const [key, bs] of domainBranches) {
    const totalExports = [...new Set(bs.flatMap((b) => b.exportNames))];
    const hasEntrypoint = bs.some(
      (b) => b.roles.includes("entrypoint") || b.roles.includes("facade"),
    );
    const isBridge = (fanIn.get(key) ?? 0) >= 3 && (fanOut.get(key) ?? 0) >= 3;
    const role = inferRole(key, fanIn.get(key) ?? 0, fanOut.get(key) ?? 0, hasEntrypoint);

    domains.push({
      dir: key,
      role,
      branchCount: bs.length,
      topExports: totalExports,
      isEntry: hasEntrypoint,
      isBridge,
    });
  }

  // Sort by role order, then by name
  return domains.sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return a.dir.localeCompare(b.dir);
  });
}

function inferRole(
  domain: string,
  fanIn: number,
  fanOut: number,
  hasEntrypoint: boolean,
): ArchRole {
  const name = domain.toLowerCase();

  // Monorepo package patterns
  if (name === "cli" || name.endsWith("/cli") || name.includes("packages/cli")) return "entry";
  if (name.includes("effect") && !name.includes("sql")) return "core";
  if (
    name.includes("platform") ||
    name.includes("bun") ||
    name.includes("node") ||
    name.includes("browser")
  )
    return "platform";
  if (name.includes("sql") || name.includes("drizzle") || name.includes("kysely"))
    return "database";
  if (name.includes("ai") || name.includes("openrouter") || name.includes("openai")) return "ai";
  if (name.includes("printer")) return "output";
  if (name.includes("rpc")) return "process";
  if (name.includes("cluster") || name.includes("workflow")) return "process";
  if (name.includes("typeclass")) return "core";
  if (name.includes("opentelemetry") || name.includes("vitest")) return "process";
  if (name.includes("experimental")) return "process";

  // Generic patterns
  if (name.includes("model") || name.includes("types") || name.includes("schema")) return "data";
  if (name.includes("parser") || name.includes("syntax") || name.includes("lexer")) return "input";
  if (name.includes("render") || name.includes("format") || name.includes("display"))
    return "output";
  if (
    name.includes("rule") ||
    name.includes("verif") ||
    name.includes("reason") ||
    name.includes("cache")
  )
    return "process";

  // Topology: high fan-in means foundational
  if (fanIn >= 20) return "core";
  if (hasEntrypoint) return "entry";

  return "internal";
}

// ── Helpers ────────────────────────────────────────────────

function treeSummaryLine(tree: TypeScriptReasoningTree): string {
  const roots = tree.modules.filter((m) => m.role === "entrypoint" || m.role === "facade").length;
  const deps = tree.ownerDependencies.filter((d) => !d.isTestContext).length;
  const parts = [
    `files=${tree.modules.length}`,
    `roots=${roots}`,
    `branches=${tree.ownerBranches.length}`,
    `deps=${deps}`,
  ];
  if (tree.packageExtensions.length > 0) {
    parts.push(`ext=${tree.packageExtensions.map((e) => `${e.name}:${e.activation}`).join(",")}`);
  }
  if (tree.packageBuildTools.length > 0) {
    parts.push(`tools=${tree.packageBuildTools.map((t) => t.name).join(",")}`);
  }
  return `[tree] ${parts.join(" ")}`;
}

function domainKey(relPath: string): string {
  return relPath.split("/").slice(0, 2).join("/");
}

function relativeTo(tree: TypeScriptReasoningTree, filePath: string): string {
  return path.relative(tree.projectRoot, filePath) || ".";
}
