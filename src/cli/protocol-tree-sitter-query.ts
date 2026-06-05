/**
 * Tree-sitter query argument parsing for the ts-harness CLI.
 */

import type { SyntaxQueryPlan } from "../parser/native_syntax/tree-sitter-query.js";

export interface TreeSitterQueryArgs {
  readonly kind: "tree-sitter-query";
  readonly catalogId: string | undefined;
  readonly treeSitterQuery: string | undefined;
  readonly terms: readonly string[];
  readonly selector: string | undefined;
  readonly aspSyntaxQueryPlan: SyntaxQueryPlan | undefined;
  readonly projectRoot: string | undefined;
  readonly packagePath: string | undefined;
  readonly json: boolean;
  readonly codeOnly: boolean;
}

export type TreeSitterQueryParseResult =
  | TreeSitterQueryArgs
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string };

interface MutableSyntaxQueryPlan {
  captures: readonly string[];
  nodeTypes: readonly string[];
  fields: readonly string[];
}

interface TreeSitterQueryParseState {
  catalogId: string | undefined;
  treeSitterQuery: string | undefined;
  selector: string | undefined;
  packagePath: string | undefined;
  aspSyntaxQueryPlan: MutableSyntaxQueryPlan | undefined;
  json: boolean;
  codeOnly: boolean;
  terms: string[];
  positionals: string[];
}

type TreeSitterQueryOptionParseResult =
  | TreeSitterQueryParseState
  | { readonly kind: "error"; readonly message: string };

export function parseTreeSitterQueryArgs(argv: readonly string[]): TreeSitterQueryParseResult {
  if (argv[0] === "--help" || argv[0] === "-h") return { kind: "help" };
  const parsed = parseTreeSitterQueryOptions(argv);
  if ("kind" in parsed) return parsed;
  return finalizeTreeSitterQueryArgs(parsed);
}

export function isTreeSitterQueryArgs(argv: readonly string[]): boolean {
  return argv.includes("--treesitter-query") || argv.includes("--catalog");
}

function parseTreeSitterQueryOptions(argv: readonly string[]): TreeSitterQueryOptionParseResult {
  const state = initialTreeSitterQueryParseState();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--catalog") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--catalog requires a catalog id" };
      }
      state.catalogId = value;
      index += 1;
    } else if (arg === "--treesitter-query") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--treesitter-query requires a query expression" };
      }
      state.treeSitterQuery = value;
      index += 1;
    } else if (arg === "--term" || arg === "--query") {
      const value = argv[index + 1];
      if (value === undefined) return { kind: "error", message: `${arg} requires a value` };
      state.terms.push(
        ...(arg === "--query"
          ? value
              .split("|")
              .map((term) => term.trim())
              .filter((term) => term.length > 0)
          : [value]),
      );
      index += 1;
    } else if (arg === "--selector") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--selector requires a selector" };
      }
      state.selector = value;
      index += 1;
    } else if (arg === "--package") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--package requires a package path" };
      }
      state.packagePath = value;
      index += 1;
    } else if (isAspSyntaxQueryPlanOption(arg)) {
      const value = argv[index + 1];
      if (value === undefined) {
        return { kind: "error", message: `${arg} requires an ASP query plan value` };
      }
      state.aspSyntaxQueryPlan = updateAspSyntaxQueryPlan(state.aspSyntaxQueryPlan, arg, value);
      index += 1;
    } else if (arg === "--json") {
      state.json = true;
    } else if (arg === "--code") {
      state.codeOnly = true;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown tree-sitter query option: ${arg}` };
    } else {
      state.positionals.push(arg);
    }
  }
  return state;
}

function initialTreeSitterQueryParseState(): TreeSitterQueryParseState {
  return {
    catalogId: undefined,
    treeSitterQuery: undefined,
    selector: undefined,
    packagePath: undefined,
    aspSyntaxQueryPlan: undefined,
    json: false,
    codeOnly: false,
    terms: [],
    positionals: [],
  };
}

function finalizeTreeSitterQueryArgs(state: TreeSitterQueryParseState): TreeSitterQueryParseResult {
  const {
    catalogId,
    treeSitterQuery,
    terms,
    selector,
    aspSyntaxQueryPlan,
    positionals,
    packagePath,
    json,
    codeOnly,
  } = state;
  if ((catalogId === undefined) === (treeSitterQuery === undefined)) {
    return {
      kind: "error",
      message: "query requires exactly one of --catalog or --treesitter-query",
    };
  }
  if (json && codeOnly) {
    return { kind: "error", message: "--code cannot be combined with --json" };
  }
  if (positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return {
    kind: "tree-sitter-query",
    catalogId,
    treeSitterQuery,
    terms,
    selector,
    aspSyntaxQueryPlan,
    projectRoot: positionals[0],
    packagePath,
    json,
    codeOnly,
  };
}

function isAspSyntaxQueryPlanOption(arg: string): boolean {
  return (
    arg === "--asp-syntax-query-captures" ||
    arg === "--asp-syntax-query-node-types" ||
    arg === "--asp-syntax-query-fields"
  );
}

function updateAspSyntaxQueryPlan(
  current: MutableSyntaxQueryPlan | undefined,
  arg: string,
  value: string,
): MutableSyntaxQueryPlan {
  const plan = current ?? { captures: [], nodeTypes: [], fields: [] };
  if (arg === "--asp-syntax-query-captures") {
    return { ...plan, captures: splitAspSyntaxQueryPlanList(value) };
  }
  if (arg === "--asp-syntax-query-node-types") {
    return { ...plan, nodeTypes: splitAspSyntaxQueryPlanList(value) };
  }
  return { ...plan, fields: splitAspSyntaxQueryPlanList(value) };
}

function splitAspSyntaxQueryPlanList(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
}
