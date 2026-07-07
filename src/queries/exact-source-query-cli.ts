import path from "node:path";

import { renderOwnerItemQueryCode } from "../cli/semantic-search/item-read.js";
import { renderExactSourceWindowCode } from "./exact-source-window.js";
import {
  ownerPathFromQuerySelector,
  selectorHasLineRange,
  structuralItemSelectorFromQuerySelector,
} from "./source-selector.js";

export interface ExactSourceQueryCliStreams {
  readonly stdout: { write(chunk: string): unknown };
}

interface ExactSourceQueryArgs {
  readonly selector: string;
  readonly ownerPath: string;
  readonly itemQuery?: string;
  readonly projectRoot: string | undefined;
}

export function tryRunExactSourceQueryCli(
  argv: readonly string[],
  streams: ExactSourceQueryCliStreams,
  cwd: string,
): number | undefined {
  const args = parseExactSourceQueryArgs(argv);
  if (args === undefined) return undefined;
  const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
  const output =
    args.itemQuery === undefined
      ? renderExactSourceWindowCode(projectRoot, args.ownerPath, args.selector)
      : renderOwnerItemQueryCode(projectRoot, args.ownerPath, args.itemQuery, args.selector);
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
  let workspaceRoot: string | undefined;
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
      index += 1;
    } else if (arg === "--workspace") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      workspaceRoot = value;
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
  if (positionals.length > 0) return undefined;
  const structuralItem = structuralItemSelectorFromQuerySelector(selector);
  if (structuralItem !== undefined) {
    return {
      selector,
      ownerPath: structuralItem.ownerPath,
      itemQuery: structuralItem.itemName,
      projectRoot: workspaceRoot,
    };
  }
  if (!hasTerm && fromHook !== "direct-source-read") return undefined;
  const ownerPath = ownerPathFromQuerySelector(selector);
  if (ownerPath === undefined || !selectorHasLineRange(selector, ownerPath)) return undefined;
  return {
    selector,
    ownerPath,
    projectRoot: workspaceRoot,
  };
}
