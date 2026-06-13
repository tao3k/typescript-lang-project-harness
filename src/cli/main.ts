#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tryRunExactSourceQueryCli } from "../queries/exact-source-query-cli.js";

export interface CliStreams {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
  readonly stdin?: string;
}

export const HELP_TEXT = `ts-harness — TypeScript semantic search and project harness

Usage:
  ts-harness search <view> ... [--json] [--code] [--package <path>] [--workspace <workspace-root>]
  ts-harness query <owner-path> --term <symbol> [--term <symbol>] [--workspace <workspace-root>] [--names-only | --code]
  ts-harness query (--catalog <id> | --treesitter-query <s-expression>) [<workspace-root>] [--workspace <workspace-root>] [--selector <path[:start[:end]]>] [--code] [--json]
  ts-harness query --catalog flow-lite --where 'source.call=NAME sink.constructs=TYPE scope.fn=FUNCTION' [<workspace-root>] [--json] [--workspace <workspace-root>]
  ts-harness ast-patch dry-run --packet <semantic-ast-patch.json|->
  ts-harness check [--changed | --full] [--json]
  ts-harness evidence graph [--json] [PROJECT_ROOT]
  ts-harness evidence analyze [--json] [PROJECT_ROOT]
  ts-harness agent doctor [--json]
  ts-harness agent guide

SEARCH VIEWS
  search workspace          Workspace package/router index
  search prime              Project semantic-search map
  search owner <path>       Owner graph slice
  search owner <path> items --query <symbol> [--names-only | --code]
                             Parser-owned item query and compact code extraction
  search dependency <pkg>   NPM/external dependency usage
  search deps <pkg[/subpath][@ver][::api]>
                             Versioned dependency API usage
  search api <query>         Parser-owned exported/public API facts
  search public-external-types <pkg>
                             Public API types that expose a dependency
  search policy <rule-id-or-alias>
                             Provider-owned policy rule handles
  search symbol <name>      Exported symbol definitions
  search callsite <name>    Owner-level import/reexport sites
  search import <query>     Import/reexport owner edges
  search tests <owner>      Tests that import an owner
  search fzf <query>        Fuzzy lexical owner/source-text candidates
  search fzf <query> owner tests
                             Minimal final-only fuzzy -> owner -> tests pipe
  search fzf --query-set <q1> --query-set <q2> [owner tests] [--owner <path>]
                             Homogeneous fuzzy query-set with optional owner scope
  search semantic-facts <query>
                             Provider-owned field/type/collection facts for graph-turbo
  search ingest             Detect stdin shape and group hits by owner
  --package <path>          Run the selected search in a workspace package scope

QUERY
  query <owner-path> --term <symbol>
                             Parser-owned owner item query
  query <owner-path> --term <a> --term <b> --names-only
                             Owner-local item discovery without code windows
  query <owner-path> --term <symbol> --code
                              Pure compact parser-owned code output
  query --treesitter-query <s-expression> [--selector <selector>] [--code]
                             Tree-sitter-compatible syntax locate, capture, and pure code extraction
  query --from-hook direct-source-read --workspace <workspace-root> --selector <workspace-path:start:end> --code
                             Source-preserved direct read for workspace-relative selectors
  query --catalog declarations
                             Provider-embedded canonical tree-sitter query catalog
  query --catalog flow-lite --where 'source.call=NAME sink.constructs=TYPE scope.fn=FUNCTION'
                             Flow-lite ABI compatibility surface; TypeScript executor is not enabled yet

AST PATCH
  ast-patch dry-run --packet <path|->
                             Provider-native TypeScript AST dry-run receipt; never mutates files

CHECK
  check --changed           Fast lane alias; currently delegates to project check
  check --full              Full project harness check
  check --json              Structured TypeScriptHarnessReport JSON

EVIDENCE
  evidence graph --json     Portable semantic-evidence-graph packet
  evidence analyze --json   Graph-turbo request for evidence-quality ranking

AGENT
  agent doctor              Print semantic-language provider readiness
  agent doctor --json       Semantic language registry document
  agent guide
                            Print command-line search flow guide
  Hook install/runtime is owned by asp in the root toolchain.

GENERAL
  --help             This help

EXAMPLES
  ts-harness search workspace --workspace .
  ts-harness search prime --package packages/core --workspace .
  ts-harness search prime --workspace .
  ts-harness search dependency react --workspace .
  ts-harness search deps react/jsx-runtime@19.0.0::jsx --workspace .
  ts-harness search api OrderStatus --workspace .
  ts-harness search public-external-types react --workspace .
  ts-harness search policy TS-AGENT-R001 owner tests --workspace .
  ts-harness search symbol OrderStatus --workspace .
  ts-harness search callsite OrderStatus --workspace .
  ts-harness search import ./order --workspace .
  ts-harness search tests src/domain/order.ts --workspace .
  ts-harness search fzf OrderStatus --workspace .
  ts-harness search fzf --query-set OrderStatus --query-set findOrderStatus owner tests --workspace .
  ts-harness query src/domain/order.ts --term findOrderStatus --workspace . --names-only
  ts-harness query src/domain/order.ts --term findOrderStatus --workspace . --code
  ts-harness query --treesitter-query '(function_declaration name: (identifier) @function.name)' --workspace .
  ts-harness query --catalog declarations --selector src/domain/order.ts --workspace . --code
  ts-harness query --catalog flow-lite --where 'source.call=payload sink.constructs=Action scope.fn=collect' --workspace .
  ts-harness ast-patch dry-run --packet semantic-ast-patch.json
  ts-harness evidence graph --json .
  ts-harness evidence analyze --json .
  rg -n "OrderStatus" src tests | ts-harness search ingest --workspace .
  ts-harness check --changed
  ts-harness agent guide

`;

export async function runCliFromEnv(): Promise<number> {
  const argv = process.argv.slice(2);
  const cwd = process.cwd();
  const log = startDevCommandLog(argv, cwd);
  try {
    const exitCode = await runCli(
      argv,
      {
        stdout: process.stdout,
        stderr: process.stderr,
        stdin: await readStdin(),
      },
      cwd,
    );
    finishDevCommandLog(log, exitCode);
    return exitCode;
  } catch (error) {
    finishDevCommandLog(log, 2);
    throw error;
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  process.stdin.setEncoding("utf8");
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}

export async function runCli(
  argv: readonly string[],
  streams: CliStreams,
  cwd: string,
): Promise<number> {
  const exactSourceStatus = tryRunExactSourceQueryCli(argv, streams, cwd);
  if (exactSourceStatus !== undefined) return exactSourceStatus;
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    streams.stdout.write(HELP_TEXT);
    return 0;
  }
  const { parseProtocolArgs, runProtocolCli } = await import("./protocol.js");
  const protocolArgs = parseProtocolArgs(argv);
  if (protocolArgs !== undefined) {
    return runProtocolCli(protocolArgs, streams, cwd, HELP_TEXT);
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
  void runCliFromEnv().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = 2;
    },
  );
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
import { finishDevCommandLog, startDevCommandLog } from "./dev-command-log.js";
