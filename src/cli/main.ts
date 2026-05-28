#!/usr/bin/env node

import path from "node:path";

import {
  renderTypeScriptProjectHarness,
  renderTypeScriptProjectHarnessAgentCompactText,
  renderTypeScriptProjectHarnessAgentSnapshot,
  renderTypeScriptProjectHarnessJson,
} from "../render.js";
import {
  buildTypeScriptProjectHarnessAgentSnapshot,
  runTypeScriptProjectHarness,
} from "../runner.js";
import { isTypeScriptHarnessClean } from "../model.js";
import { renderTree } from "./render-tree.js";
import { renderStats, renderHarnessFindings, renderHarnessFindingsWith } from "./render-stats.js";
import { renderDeps } from "./render-deps.js";
import { renderTopology } from "./render-topology.js";
import { renderDomain } from "./render-domain.js";
import { renderGuide } from "./render-guide.js";
import { renderSearch } from "./render-search.js";

export const HELP_TEXT = `ts-harness — TypeScript project reasoning harness for agents

Usage:
  ts-harness [FLAG] [project-root]

FLAGS (one at a time)
  --stats            One-line project identity: files, roots, deps, errors, ext
  --stats            One-line project identity: files, roots, deps, ext
  --tree             Structure map: domains, entrypoints, branches
  --topology         Key nodes: foundations, orchestrators, bridges, orphans
  --deps <path>      Dependency subgraph for a specific file (grouped by namespace)
  --domain <path>    Branch summary for a specific directory/domain
  --harness          Run policy engine, output findings in compact format
  --harness --all    Include TS-SEM semantic diagnostics
  --json             Full JSON report (includes both tree + findings)
  --agent-compact    Compact text for agent consumption
  --agent-snapshot   Agent snapshot with reasoning tree
  --help             This help

EXAMPLES
  ts-harness --stats .          what is this project?
  ts-harness --tree .           what does the structure look like?
  ts-harness --topology .       what are the key nodes?
  ts-harness --deps src/a.ts .  what does this file depend on?
  ts-harness --harness .        what findings does the policy engine report?
`;

export interface CliStreams {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export function runCliFromEnv(): number {
  return runCli(
    process.argv.slice(2),
    { stdout: process.stdout, stderr: process.stderr },
    process.cwd(),
  );
}

export function runCli(argv: readonly string[], streams: CliStreams, cwd: string): number {
  const args = parseArgs(argv);
  if (args.error !== undefined) {
    streams.stderr.write(`${args.error}\n`);
    return 2;
  }
  if (args.showHelp) {
    streams.stdout.write(HELP_TEXT);
    return 0;
  }

  const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");

  if (args.showCache) {
    streams.stdout.write(renderCacheHint(projectRoot));
    return 0;
  }

  try {
    const report = runTypeScriptProjectHarness(projectRoot);
    streams.stdout.write(renderCliOutput(args, report));
    return isTypeScriptHarnessClean(report) ? 0 : 1;
  } catch (error) {
    streams.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

// ── Args ───────────────────────────────────────────────────

interface ParsedArgs {
  readonly showJson: boolean;
  readonly showAgentCompact: boolean;
  readonly showAgentSnapshot: boolean;
  readonly showTree: boolean;
  readonly showHarness: boolean;
  readonly showStats: boolean;
  readonly showTopology: boolean;
  readonly showDeps: boolean;
  readonly showDomain: boolean;
  readonly showGuide: boolean;
  readonly showSearch: boolean;
  readonly showHelp: boolean;
  readonly showCache: boolean;
  readonly showAll: boolean;
  readonly depsTarget: string | undefined;
  readonly domainTarget: string | undefined;
  readonly guideTopic: string | undefined;
  readonly searchPattern: string | undefined;
  readonly projectRoot: string | undefined;
  readonly error: string | undefined;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: Record<string, boolean | string | undefined> = {};
  let depsTarget: string | undefined;
  let domainTarget: string | undefined;
  let guideTopic: string | undefined;
  let searchPattern: string | undefined;
  let projectRoot: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--json":
      case "--agent-compact":
      case "--agent-snapshot":
      case "--tree":
      case "--harness":
      case "--stats":
      case "--topology":
      case "--deps":
      case "--domain":
      case "--guide":
      case "--search":
      case "--help":
      case "--cache":
      case "--all":
        flags[arg] = true;
        break;
      default:
        if (arg.startsWith("-")) {
          return blankArgs(`unknown option: ${arg}. Use --help.`);
        }
        // If previous arg was --deps or --domain, this is the target path
        if (i > 0 && argv[i - 1] === "--deps") {
          depsTarget = arg;
        } else if (i > 0 && argv[i - 1] === "--domain") {
          domainTarget = arg;
        } else if (i > 0 && argv[i - 1] === "--search") {
          searchPattern = arg;
        } else if (i > 0 && argv[i - 1] === "--guide") {
          // Only treat as topic if it doesn't look like a project root
          if (arg === "." || arg === ".." || arg.includes("/")) {
            // Looks like a path — treat as project root, leave guideTopic empty
            if (projectRoot === undefined) projectRoot = arg;
          } else {
            guideTopic = arg;
          }
        } else if (projectRoot === undefined) {
          projectRoot = arg;
        } else {
          return blankArgs("expected at most one project root");
        }
    }
  }

  const outputFlags = [
    "--json",
    "--agent-compact",
    "--agent-snapshot",
    "--tree",
    "--harness",
    "--stats",
    "--topology",
    "--deps",
    "--domain",
    "--guide",
  ];
  const activeOutputs = outputFlags.filter((f) => flags[f]);
  if (activeOutputs.length > 1) {
    return blankArgs(`cannot combine flags: ${activeOutputs.join(", ")}`);
  }

  return {
    showJson: flags["--json"] === true,
    showAgentCompact: flags["--agent-compact"] === true,
    showAgentSnapshot: flags["--agent-snapshot"] === true,
    showTree: flags["--tree"] === true,
    showHarness: flags["--harness"] === true,
    showStats: flags["--stats"] === true,
    showTopology: flags["--topology"] === true,
    showDeps: flags["--deps"] === true,
    showDomain: flags["--domain"] === true,
    showGuide: flags["--guide"] === true,
    showSearch: flags["--search"] === true,
    showHelp: flags["--help"] === true,
    showCache: flags["--cache"] === true,
    showAll: flags["--all"] === true,
    depsTarget,
    domainTarget,
    guideTopic,
    searchPattern,
    projectRoot,
    error: undefined,
  };
}

function blankArgs(error: string): ParsedArgs {
  return {
    showJson: false,
    showAgentCompact: false,
    showAgentSnapshot: false,
    showTree: false,
    showHarness: false,
    showStats: false,
    showTopology: false,
    showDeps: false,
    showDomain: false,
    showGuide: false,
    showSearch: false,
    showHelp: false,
    showCache: false,
    showAll: false,
    depsTarget: undefined,
    domainTarget: undefined,
    guideTopic: undefined,
    searchPattern: undefined,
    projectRoot: undefined,
    error,
  };
}

// ── Render dispatch ────────────────────────────────────────

function renderCliOutput(
  args: ParsedArgs,
  report: ReturnType<typeof runTypeScriptProjectHarness>,
): string {
  if (args.showJson) return renderTypeScriptProjectHarnessJson(report);
  if (args.showAgentCompact) {
    const compact = renderTypeScriptProjectHarnessAgentCompactText(report, { findings: "all" });
    return compact === "" ? `${renderTypeScriptProjectHarness(report)}\n` : `${compact}\n`;
  }
  if (args.showAgentSnapshot) {
    return `${renderTypeScriptProjectHarnessAgentSnapshot(
      buildTypeScriptProjectHarnessAgentSnapshot(report),
    )}\n`;
  }
  if (args.showTree) return renderTree(report);
  if (args.showHarness) {
    return args.showAll
      ? renderHarnessFindingsWith(report, { includeSemantic: true, minSeverity: "info" })
      : renderHarnessFindings(report);
  }
  if (args.showStats) return renderStats(report);
  if (args.showTopology) return renderTopology(report);
  if (args.showDeps) {
    return renderDeps(report, args.depsTarget ?? "");
  }
  if (args.showDomain) {
    return renderDomain(report, args.domainTarget ?? "");
  }
  if (args.showGuide) {
    return renderGuide(report, args.guideTopic ?? "");
  }
  // Default when no flags: show agent guide as starting point
  if (
    !args.showJson &&
    !args.showAgentCompact &&
    !args.showAgentSnapshot &&
    !args.showTree &&
    !args.showHarness &&
    !args.showStats &&
    !args.showTopology &&
    !args.showDeps &&
    !args.showDomain &&
    !args.showSearch &&
    !args.showGuide
  ) {
    return renderGuide(report, "");
  }
  if (args.showSearch) {
    return renderSearch(report, args.searchPattern ?? "");
  }

  // Default: compact findings or [ok]
  const compact = renderTypeScriptProjectHarness(report);
  return compact === "" ? "[ok] ts\n" : `${compact}\n`;
}

function renderCacheHint(projectRoot: string): string {
  const cacheDir = path.join(projectRoot, ".cache", "ts-harness");
  return `[cache] dir=${cacheDir}\n`;
}
