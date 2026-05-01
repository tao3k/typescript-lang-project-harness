import path from "node:path";

import {
  renderTypeScriptProjectHarness,
  renderTypeScriptProjectHarnessAgentSnapshot,
  renderTypeScriptProjectHarnessJson,
} from "./render.js";
import {
  buildTypeScriptProjectHarnessAgentSnapshot,
  runTypeScriptProjectHarness,
} from "./runner.js";
import { isTypeScriptHarnessClean } from "./model.js";

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

interface ParsedArgs {
  readonly json: boolean;
  readonly agentSnapshot: boolean;
  readonly projectRoot?: string;
  readonly error?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let json = false;
  let agentSnapshot = false;
  let projectRoot: string | undefined;
  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--agent-snapshot") {
      agentSnapshot = true;
      continue;
    }
    if (arg.startsWith("-")) {
      return { json, agentSnapshot, error: `unknown option: ${arg}` };
    }
    if (projectRoot !== undefined) {
      return { json, agentSnapshot, error: "expected at most one project root" };
    }
    projectRoot = arg;
  }
  if (json && agentSnapshot) {
    return { json, agentSnapshot, error: "--json and --agent-snapshot cannot be combined" };
  }
  return projectRoot === undefined ? { json, agentSnapshot } : { json, agentSnapshot, projectRoot };
}

function renderCliOutput(
  args: ParsedArgs,
  report: ReturnType<typeof runTypeScriptProjectHarness>,
): string {
  if (args.json) {
    return renderTypeScriptProjectHarnessJson(report);
  }
  if (args.agentSnapshot) {
    return `${renderTypeScriptProjectHarnessAgentSnapshot(
      buildTypeScriptProjectHarnessAgentSnapshot(report),
    )}\n`;
  }
  return `${renderTypeScriptProjectHarness(report)}\n`;
}
