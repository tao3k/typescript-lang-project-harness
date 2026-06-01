#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseProtocolArgs, runProtocolCli, type CliStreams } from "./protocol.js";

export const HELP_TEXT = `ts-harness — TypeScript semantic search and project harness

Usage:
  ts-harness search <view> ... [--json] [--package <path>] [project-root]
  ts-harness check [--changed | --full] [--json] [project-root]
  ts-harness agent doctor [--json] [project-root]
  ts-harness agent guide [project-root]

SEARCH VIEWS
  search workspace          Workspace package/router index
  search prime              Project semantic-search map
  search owner <path>       Owner graph slice
  search dependency <pkg>   NPM/external dependency usage
  search deps <pkg[/subpath][@ver][::api]>
                             Versioned dependency API usage
  search api <query>         Parser-owned exported/public API facts
  search public-external-types <pkg>
                             Public API types that expose a dependency
  search symbol <name>      Exported symbol definitions
  search callsite <name>    Owner-level import/reexport sites
  search import <query>     Import/reexport owner edges
  search tests <owner>      Tests that import an owner
  search text <query>       Owner-grouped path/export/source-text search
  search text <query> owner tests
                             Minimal final-only text -> owner -> tests pipe
  search text --query-set <q1> --query-set <q2> [owner tests] [--owner <path>]
                             Homogeneous text query-set with optional owner scope
  search ingest             Detect stdin shape and group hits by owner
  --package <path>          Run the selected search in a workspace package scope

CHECK
  check --changed           Fast lane alias; currently delegates to project check
  check --full              Full project harness check
  check --json              Structured TypeScriptHarnessReport JSON

AGENT
  agent doctor              Print semantic-language provider readiness
  agent doctor --json       Semantic language registry document
  agent guide
                            Print command-line search flow guide
  Hook install/runtime is owned by semantic-agent-hook in the root toolchain.

GENERAL
  --help             This help

EXAMPLES
  ts-harness search workspace .
  ts-harness search prime --package packages/core .
  ts-harness search prime .
  ts-harness search dependency react .
  ts-harness search deps react/jsx-runtime@19.0.0::jsx .
  ts-harness search api OrderStatus .
  ts-harness search public-external-types react .
  ts-harness search symbol OrderStatus .
  ts-harness search callsite OrderStatus .
  ts-harness search import ./order .
  ts-harness search tests src/domain/order.ts .
  ts-harness search text OrderStatus .
  ts-harness search text --query-set OrderStatus --query-set findOrderStatus owner tests .
  rg -n "OrderStatus" src tests | ts-harness search ingest .
  ts-harness check --changed .
  ts-harness agent guide .

`;

export function runCliFromEnv(): number {
  return runCli(
    process.argv.slice(2),
    {
      stdout: process.stdout,
      stderr: process.stderr,
      stdin: process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8"),
    },
    process.cwd(),
  );
}

export function runCli(argv: readonly string[], streams: CliStreams, cwd: string): number {
  const protocolArgs = parseProtocolArgs(argv);
  if (protocolArgs !== undefined) {
    return runProtocolCli(protocolArgs, streams, cwd, HELP_TEXT);
  }
  if (argv.length === 0) {
    streams.stdout.write(HELP_TEXT);
    return 0;
  }

  const command = argv[0]!;
  if (command.startsWith("-")) {
    streams.stderr.write(`unknown option: ${command}. Use --help.\n`);
  } else {
    streams.stderr.write(`unknown command: ${command}. Use --help.\n`);
  }
  return 2;
}

if (isDirectCliEntry(process.argv[1])) {
  process.exitCode = runCliFromEnv();
}

function isDirectCliEntry(argvPath: string | undefined): boolean {
  if (argvPath === undefined) return false;
  const currentPath = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync(currentPath) === fs.realpathSync(argvPath);
  } catch {
    return currentPath === path.resolve(argvPath);
  }
}
