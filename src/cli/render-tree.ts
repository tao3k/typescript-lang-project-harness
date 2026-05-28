import path from "node:path";
import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningTree,
  TypeScriptReasoningOwnerBranchFact,
} from "../model.js";
import { relativeTo, computeTopology, isRootBranch } from "./utils.js";

const MAX_BRANCHES_TO_SHOW = 20;

export function renderTree(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const { fanIn, fanOut } = computeTopology(report);
  const lines: string[] = [];

  lines.push(treeSummaryLine(tree));

  // Architecture domains
  const domains = buildArchDomains(tree.ownerBranches, tree, fanIn, fanOut);
  if (domains.length > 0) {
    lines.push("");
    lines.push("Architecture:");
    for (const d of domains) {
      const badges: string[] = [];
      if (d.isEntry) badges.push("◆ entry");
      if (d.isBridge) badges.push("◆ bridge");
      lines.push(
        `  [${d.role}] ${d.dir}/  ${d.branches} branches${badges.length > 0 ? " " + badges.join(" ") : ""}`,
      );
      if (d.topExports.length > 0) {
        lines.push(
          `    exports: ${d.topExports.slice(0, 8).join(", ")}${d.topExports.length > 8 ? " …" : ""}`,
        );
      }
    }
  }

  // Entrypoints
  const entrypoints = tree.ownerBranches.filter((b) => isRootBranch(b.roles));
  if (entrypoints.length > 0) {
    lines.push("");
    lines.push("Entrypoints:");
    for (const ep of entrypoints) {
      lines.push(
        `  ${relativeTo(tree, ep.path)}  [${ep.roles.join(",")}]  exports=${ep.exportNames.length}`,
      );
    }
  }

  // Collapsed branches
  const otherBranches = tree.ownerBranches.filter((b) => !isRootBranch(b.roles));
  if (otherBranches.length > 0) {
    const domainHints = [
      ...new Set(otherBranches.map((b) => domainKey(relativeTo(tree, b.path)))),
    ].slice(0, 5);
    lines.push("");
    lines.push(`${otherBranches.length} internal branches  (use --domain <name> to explore)`);
    lines.push(`  domains: ${domainHints.join(", ")}`);
  }

  // Hints
  if (report.findings.length > 0) {
    lines.push("");
    lines.push(`use --harness to see ${report.findings.length} policy findings`);
  }
  if (tree.ownerDependencies.length > 100) {
    lines.push("use --topology for key dependency nodes");
  }

  return lines.join("\n") + "\n";
}

// ── Architecture roles ────────────────────────────────────

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

interface ArchDomain {
  readonly dir: string;
  readonly role: ArchRole;
  readonly branches: number;
  readonly topExports: readonly string[];
  readonly isEntry: boolean;
  readonly isBridge: boolean;
}

function buildArchDomains(
  branches: readonly TypeScriptReasoningOwnerBranchFact[],
  tree: TypeScriptReasoningTree,
  fanIn: ReadonlyMap<string, number>,
  fanOut: ReadonlyMap<string, number>,
): ArchDomain[] {
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

  const domains: ArchDomain[] = [];
  for (const [key, bs] of domainBranches) {
    const totalExports = [...new Set(bs.flatMap((b) => b.exportNames))];
    const hasEntry = bs.some((b) => isRootBranch(b.roles));
    const isBridge = (fanIn.get(key) ?? 0) >= 3 && (fanOut.get(key) ?? 0) >= 3;
    domains.push({
      dir: key,
      role: inferRole(key, fanIn.get(key) ?? 0, hasEntry),
      branches: bs.length,
      topExports: totalExports,
      isEntry: hasEntry,
      isBridge,
    });
  }

  return domains.sort((a, b) => {
    const diff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    return diff !== 0 ? diff : a.dir.localeCompare(b.dir);
  });
}

function inferRole(domain: string, _fanIn: number, hasEntry: boolean): ArchRole {
  const name = domain.toLowerCase();
  if (name.includes("model") || name.includes("types") || name.includes("schema")) return "data";
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
  if (name.includes("parser") || name.includes("syntax") || name.includes("lexer")) return "input";
  if (name.includes("render") || name.includes("format") || name.includes("display"))
    return "output";
  if (
    name.includes("rule") ||
    name.includes("verif") ||
    name.includes("reason") ||
    name.includes("cache") ||
    name.includes("rpc") ||
    name.includes("cluster") ||
    name.includes("workflow") ||
    name.includes("opentelemetry") ||
    name.includes("vitest") ||
    name.includes("experimental")
  )
    return "process";
  if (name.includes("typeclass")) return "core";
  if (hasEntry) return "entry";
  return "internal";
}

function treeSummaryLine(tree: TypeScriptReasoningTree): string {
  const roots = tree.modules.filter((m) => isRootBranch([m.role])).length;
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
