import path from "node:path";

import { renderExactSourceWindowCode } from "./exact-source-window.js";
import { ownerPathFromQuerySelector, selectorHasLineRange } from "./source-selector.js";

export interface ExactSourceQueryCliStreams {
  readonly stdout: { write(chunk: string): unknown };
}

interface ExactSourceQueryArgs {
  readonly selector: string;
  readonly ownerPath: string;
  readonly projectRoot: string | undefined;
  readonly packagePath: string | undefined;
}

export function tryRunExactSourceQueryCli(
  argv: readonly string[],
  streams: ExactSourceQueryCliStreams,
  cwd: string,
): number | undefined {
  const args = parseExactSourceQueryArgs(argv);
  if (args === undefined) return undefined;
  let projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
  if (args.packagePath !== undefined) {
    projectRoot = path.resolve(projectRoot, args.packagePath);
  }
  const output = renderExactSourceWindowCode(projectRoot, args.ownerPath, args.selector);
  if (output === undefined) return undefined;
  streams.stdout.write(`${output}\n`);
  return 0;
}

function parseExactSourceQueryArgs(argv: readonly string[]): ExactSourceQueryArgs | undefined {
  if (argv[0] !== "query") return undefined;
  let codeOnly = false;
  let json = false;
  let namesOnly = false;
  let fromHook: string | undefined;
  let selector: string | undefined;
  let packagePath: string | undefined;
  let hasTerm = false;
  const positionals: string[] = [];
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--term") {
      const value = argv[index + 1];
      if (value === undefined) return undefined;
      hasTerm = true;
      index += 1;
    } else if (arg === "--query") {
      const value = argv[index + 1];
      if (value === undefined) return undefined;
      hasTerm = value
        .split("|")
        .map((term) => term.trim())
        .some((term) => term.length > 0);
      index += 1;
    } else if (arg === "--selector") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      selector = value;
      index += 1;
    } else if (arg === "--package") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      packagePath = value;
      index += 1;
    } else if (arg === "--from-hook") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      fromHook = value;
      index += 1;
    } else if (arg === "--code") {
      codeOnly = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--names-only") {
      namesOnly = true;
    } else if (
      arg === "--catalog" ||
      arg === "--treesitter-query" ||
      arg === "--view" ||
      arg === "--where"
    ) {
      return undefined;
    } else if (arg.startsWith("-")) {
      return undefined;
    } else {
      positionals.push(arg);
    }
  }
  if (!codeOnly || json || namesOnly || selector === undefined) return undefined;
  if (fromHook !== undefined && fromHook !== "direct-source-read") return undefined;
  if (!hasTerm && fromHook !== "direct-source-read") return undefined;
  if (positionals.length > 1) return undefined;
  const ownerPath = ownerPathFromQuerySelector(selector);
  if (ownerPath === undefined || !selectorHasLineRange(selector, ownerPath)) return undefined;
  return {
    selector,
    ownerPath,
    projectRoot: positionals[0],
    packagePath,
  };
}
