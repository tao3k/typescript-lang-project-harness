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
import { renderStats } from "./render-stats.js";
import { renderCache } from "./render-cache.js";
import { HELP_TEXT } from "./help.js";

export interface CliStreams {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export function runCliFromEnv(): number {
  return runCli(
    process.argv.slice(2),
    {
      stdout: process.stdout,
      stderr: process.stderr,
    },
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
  if (args.showCache) {
    streams.stdout.write(renderCache(path.resolve(cwd, args.projectRoot ?? ".")));
    return 0;
  }
  const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
  try {
    const report = runTypeScriptProjectHarness(projectRoot);
    streams.stdout.write(renderCliOutput(args, report));
    return isTypeScriptHarnessClean(report) ? 0 : 1;
  } catch (error) {
    streams.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

export interface ParsedArgs {
  readonly showJson: boolean;
  readonly showAgentCompact: boolean;
  readonly showAgentSnapshot: boolean;
  readonly showTree: boolean;
  readonly showFindings: boolean;
  readonly showStats: boolean;
  readonly showHelp: boolean;
  readonly showCache: boolean;
  readonly projectRoot?: string;
  readonly error?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let showJson = false;
  let showAgentCompact = false;
  let showAgentSnapshot = false;
  let showTree = false;
  let showFindings = false;
  let showStats = false;
  let showHelp = false;
  let showCache = false;
  let projectRoot: string | undefined;
  for (const arg of argv) {
    if (arg === "--json") {
      showJson = true;
      continue;
    }
    if (arg === "--agent-compact") {
      showAgentCompact = true;
      continue;
    }
    if (arg === "--agent-snapshot") {
      showAgentSnapshot = true;
      continue;
    }
    if (arg === "--tree") {
      showTree = true;
      continue;
    }
    if (arg === "--findings") {
      showFindings = true;
      continue;
    }
    if (arg === "--stats") {
      showStats = true;
      continue;
    }
    if (arg === "--help") {
      showHelp = true;
      continue;
    }
    if (arg === "--cache") {
      showCache = true;
      continue;
    }
    if (arg.startsWith("-")) {
      return {
        showJson,
        showAgentCompact,
        showAgentSnapshot,
        showTree,
        showFindings,
        showStats,
        showHelp,
        showCache,
        error: `unknown option: ${arg}. Use --help for usage.`,
      };
    }
    if (projectRoot !== undefined) {
      return {
        showJson,
        showAgentCompact,
        showAgentSnapshot,
        showTree,
        showFindings,
        showStats,
        showHelp,
        showCache,
        error: "expected at most one project root",
      };
    }
    projectRoot = arg;
  }
  const outputModeCount = [
    showJson,
    showAgentCompact,
    showAgentSnapshot,
    showTree,
    showFindings,
    showStats,
  ].filter(Boolean).length;
  if (outputModeCount > 1) {
    return {
      showJson,
      showAgentCompact,
      showAgentSnapshot,
      showTree,
      showFindings,
      showStats,
      showHelp,
      showCache,
      error: "cannot combine output flags",
    };
  }
  return projectRoot === undefined
    ? {
        showJson,
        showAgentCompact,
        showAgentSnapshot,
        showTree,
        showFindings,
        showStats,
        showHelp,
        showCache,
      }
    : {
        showJson,
        showAgentCompact,
        showAgentSnapshot,
        showTree,
        showFindings,
        showStats,
        showHelp,
        showCache,
        projectRoot,
      };
}

function renderCliOutput(
  args: ParsedArgs,
  report: ReturnType<typeof runTypeScriptProjectHarness>,
): string {
  if (args.showJson) {
    return renderTypeScriptProjectHarnessJson(report);
  }
  if (args.showAgentCompact) {
    const compact = renderTypeScriptProjectHarnessAgentCompactText(report, { findings: "all" });
    return compact === "" ? `${renderTypeScriptProjectHarness(report)}\n` : `${compact}\n`;
  }
  if (args.showAgentSnapshot) {
    return `${renderTypeScriptProjectHarnessAgentSnapshot(
      buildTypeScriptProjectHarnessAgentSnapshot(report),
    )}\n`;
  }
  if (args.showTree) {
    return renderTree(report);
  }
  if (args.showFindings) {
    const findings = renderTypeScriptProjectHarness(report);
    return findings === "" ? "[ok] all clean\n" : findings + "\n";
  }
  if (args.showStats) {
    return renderStats(report);
  }
  return `${renderTypeScriptProjectHarness(report)}\n`;
}
