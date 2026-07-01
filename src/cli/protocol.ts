/**
 * Protocol command parsing and dispatch for the ts-harness CLI.
 */

import fs from "node:fs";
import path from "node:path";

import { renderTypeScriptProjectHarness, renderTypeScriptProjectHarnessJson } from "../render.js";
import { runTypeScriptProjectHarness } from "../runner.js";
import { isTypeScriptHarnessClean } from "../model.js";
import { renderCodexAgentGuide } from "./agent-guide.js";
import {
  parseAgentArgs,
  renderAgentDoctor,
  renderAgentDoctorJson,
  type AgentArgs,
} from "./protocol-agent.js";
import { runtimeCostForTypeScriptPrefilter } from "./search-prefilter.js";
import {
  typeScriptSemanticSearchViewDescriptor,
  type TypeScriptSemanticSearchPipe,
  type TypeScriptSemanticSearchView,
} from "./semantic-language.js";
import {
  buildSemanticSearchPacket,
  renderSemanticSearchPacket,
  renderSemanticSearchPacketJson,
  type SemanticSearchRenderMode,
} from "./semantic-search.js";
import { renderTypeScriptSemanticGraphFactsJson } from "./semantic-graph-facts.js";
import {
  buildTypeScriptEvidenceAnalysisRequest,
  buildTypeScriptEvidenceGraph,
  renderTypeScriptEvidenceAnalysisRequest,
  renderTypeScriptEvidenceAnalysisRequestJson,
  renderTypeScriptEvidenceGraph,
  renderTypeScriptEvidenceGraphJson,
} from "./evidence-graph.js";
import { buildOwnerItemQueryPacket, renderOwnerItemQuery } from "./semantic-search/item-query.js";
import { renderOwnerItemQueryCode } from "./semantic-search/item-read.js";
import { renderTypeScriptTreeSitterQuery } from "../parser/native_syntax/tree-sitter-query.js";
import { renderTypeScriptAstPatchDryRunReceiptJson } from "./ast-patch.js";
import {
  isTreeSitterQueryArgs,
  parseTreeSitterQueryArgs,
  type TreeSitterQueryArgs,
} from "./protocol-tree-sitter-query.js";
import {
  isFlowLiteQueryArgs,
  parseFlowLiteQueryArgs,
  renderTypeScriptFlowLiteQuery,
  type FlowLiteQueryArgs,
} from "./protocol-flow-lite-query.js";
import {
  checkConfig,
  searchRunPlan,
  SEARCH_VIEWS_REQUIRING_FULL_NATIVE_SYNTAX_FACTS,
  SEARCH_VIEWS_REQUIRING_RULE_EVALUATION,
} from "./protocol-runtime.js";
import { runTypeScriptQueryCommand } from "../queries/query-command.js";
import { ownerPathFromQuerySelector, selectorHasLineRange } from "../queries/source-selector.js";

export interface CliStreams {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
  readonly stdin?: string;
}

export type ProtocolArgs =
  | SearchArgs
  | QueryArgs
  | TreeSitterQueryArgs
  | FlowLiteQueryArgs
  | CheckArgs
  | EvidenceArgs
  | AgentArgs
  | AstPatchArgs
  | ProtocolHelpArgs
  | ProtocolErrorArgs;

export interface SearchArgs {
  readonly kind: "search";
  readonly view: TypeScriptSemanticSearchView;
  readonly query: string | undefined;
  readonly itemQuery?: string;
  readonly fromHook?: string;
  readonly selector?: string;
  readonly intent?: string;
  readonly projectRoot: string | undefined;
  readonly packagePath: string | undefined;
  readonly workspace: boolean;
  readonly ownerPath: string | undefined;
  readonly dependency?: string;
  readonly pipes: readonly TypeScriptSemanticSearchPipe[];
  readonly querySet: readonly string[];
  readonly json: boolean;
  readonly codeOnly?: boolean;
  readonly namesOnly?: boolean;
  readonly renderMode: SemanticSearchRenderMode | undefined;
}

export interface QueryArgs {
  readonly kind: "query";
  readonly ownerPath: string;
  readonly selector: string | undefined;
  readonly terms: readonly string[];
  readonly projectRoot: string | undefined;
  readonly packagePath: string | undefined;
  readonly workspace: boolean;
  readonly json: boolean;
  readonly codeOnly: boolean;
  readonly namesOnly: boolean;
  readonly renderMode: "read-packet" | undefined;
}

export interface CheckArgs {
  readonly kind: "check";
  readonly mode: "changed" | "full";
  readonly projectRoot: string | undefined;
  readonly json: boolean;
}

export interface EvidenceArgs {
  readonly kind: "evidence";
  readonly action: "graph" | "analyze";
  readonly projectRoot: string | undefined;
  readonly json: boolean;
}

interface AstPatchArgs {
  readonly kind: "ast-patch";
  readonly mode: "dry-run";
  readonly packetPath: string;
  readonly projectRoot: string | undefined;
}

interface ProtocolHelpArgs {
  readonly kind: "help";
}

interface ProtocolErrorArgs {
  readonly kind: "error";
  readonly message: string;
}

export function parseProtocolArgs(argv: readonly string[]): ProtocolArgs | undefined {
  const command = argv[0];
  if (command === undefined) return undefined;
  if (command === "--help" || command === "-h") return { kind: "help" };
  if (command === "search") return parseSearchArgs(argv.slice(1));
  if (command === "query") {
    const queryArgs = argv.slice(1);
    return isFlowLiteQueryArgs(queryArgs)
      ? parseFlowLiteQueryArgs(queryArgs)
      : isTreeSitterQueryArgs(queryArgs)
        ? parseTreeSitterQueryArgs(queryArgs)
        : isBroadHookQueryArgs(queryArgs)
          ? parseSearchQueryArgs(queryArgs)
          : parseQueryArgs(queryArgs);
  }
  if (command === "ast-patch") return parseAstPatchArgs(argv.slice(1));
  if (command === "check") return parseCheckArgs(argv.slice(1));
  if (command === "evidence") return parseEvidenceArgs(argv.slice(1));
  if (command === "agent") return parseAgentArgs(argv.slice(1));
  return undefined;
}

export function runProtocolCli(
  args: ProtocolArgs,
  streams: CliStreams,
  cwd: string,
  helpText: string,
): number {
  if (args.kind === "help") {
    streams.stdout.write(helpText);
    return 0;
  }
  if (args.kind === "error") {
    streams.stderr.write(`${args.message}\n`);
    return 2;
  }
  if (args.kind === "agent") {
    const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
    if (args.action === "doctor") {
      streams.stdout.write(
        args.json ? renderAgentDoctorJson(projectRoot) : renderAgentDoctor(projectRoot),
      );
      return 0;
    }
    streams.stdout.write(renderCodexAgentGuide(projectRoot));
    return 0;
  }

  try {
    if (args.kind === "ast-patch") {
      const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
      const packetText =
        args.packetPath === "-"
          ? (streams.stdin ?? "")
          : fs.readFileSync(path.resolve(cwd, args.packetPath), "utf8");
      streams.stdout.write(renderTypeScriptAstPatchDryRunReceiptJson(projectRoot, packetText));
      return 0;
    }
    if (args.kind === "tree-sitter-query") {
      const projectRoot = resolveProviderProjectRoot(cwd, args);
      streams.stdout.write(renderTypeScriptTreeSitterQuery(projectRoot, args));
      return 0;
    }
    if (args.kind === "flow-lite-query") {
      const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
      streams.stdout.write(renderTypeScriptFlowLiteQuery(projectRoot, args));
      return 0;
    }
    if (args.kind === "query") {
      return runTypeScriptQueryCommand(args, streams, cwd);
    }
    if (args.kind === "check") {
      const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
      const report = runTypeScriptProjectHarness(projectRoot, checkConfig(projectRoot, args.mode));
      if (args.json) {
        streams.stdout.write(renderTypeScriptProjectHarnessJson(report));
      } else {
        const compact = renderTypeScriptProjectHarness(report, {
          includeAdvice: args.mode !== "changed",
        });
        streams.stdout.write(compact === "" ? "[ok] typescript\n" : `${compact}\n`);
      }
      return isTypeScriptHarnessClean(report) ? 0 : 1;
    }
    if (args.kind === "evidence") {
      const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
      if (args.action === "graph") {
        const graph = buildTypeScriptEvidenceGraph(projectRoot);
        streams.stdout.write(
          args.json
            ? renderTypeScriptEvidenceGraphJson(projectRoot)
            : renderTypeScriptEvidenceGraph(graph),
        );
      } else {
        const request = buildTypeScriptEvidenceAnalysisRequest(projectRoot);
        streams.stdout.write(
          args.json
            ? renderTypeScriptEvidenceAnalysisRequestJson(projectRoot)
            : renderTypeScriptEvidenceAnalysisRequest(request),
        );
      }
      return 0;
    }
    if (args.view === "semantic-facts") {
      if (!args.json) {
        streams.stderr.write("search semantic-facts requires --json\n");
        return 2;
      }
      const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
      streams.stdout.write(
        renderTypeScriptSemanticGraphFactsJson(projectRoot, args.query ?? "", streams.stdin ?? ""),
      );
      return 0;
    }

    const ownerSeedFastPath = tryRenderOwnerSeedFastPath(cwd, args);
    if (ownerSeedFastPath !== undefined) {
      streams.stdout.write(ownerSeedFastPath);
      return 0;
    }
    const depsSeedFastPath = tryRenderDependencySeedFastPath(cwd, args);
    if (depsSeedFastPath !== undefined) {
      streams.stdout.write(depsSeedFastPath);
      return 0;
    }
    const packagePrimeSeedFastPath = tryRenderPackagePrimeSeedFastPath(cwd, args);
    if (packagePrimeSeedFastPath !== undefined) {
      streams.stdout.write(packagePrimeSeedFastPath);
      return 0;
    }
    const packageFzfSeedFastPath = tryRenderPackageFzfSeedFastPath(cwd, args);
    if (packageFzfSeedFastPath !== undefined) {
      streams.stdout.write(packageFzfSeedFastPath);
      return 0;
    }

    const started = Date.now();
    const searchPlan = searchRunPlan(cwd, args);
    const report = runTypeScriptProjectHarness(searchPlan.projectRoot, undefined, {
      collectSemanticDiagnostics: false,
      collectNativeSyntaxFacts: SEARCH_VIEWS_REQUIRING_FULL_NATIVE_SYNTAX_FACTS.has(args.view),
      evaluateRules: SEARCH_VIEWS_REQUIRING_RULE_EVALUATION.has(args.view),
      ...(searchPlan.fileNames === undefined ? {} : { fileNames: searchPlan.fileNames }),
    });
    const runtimeCost =
      searchPlan.prefilter === undefined
        ? undefined
        : runtimeCostForTypeScriptPrefilter(
            searchPlan.prefilter,
            Date.now() - started,
            report.modules.length,
          );
    if (args.view === "owner" && args.itemQuery !== undefined && args.query !== undefined) {
      streams.stdout.write(
        args.json
          ? renderSemanticSearchPacketJson(
              buildOwnerItemQueryPacket(searchPlan.projectRoot, args.query, args.itemQuery),
            )
          : `${
              args.codeOnly === true
                ? renderOwnerItemQueryCode(searchPlan.projectRoot, args.query, args.itemQuery)
                : renderOwnerItemQuery(searchPlan.projectRoot, args.query, args.itemQuery, {
                    namesOnly: args.namesOnly === true,
                  })
            }\n`,
      );
      return 0;
    }

    const packet = buildSemanticSearchPacket(report, {
      view: args.view,
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.itemQuery !== undefined ? { itemQuery: args.itemQuery } : {}),
      ...(args.dependency !== undefined ? { dependency: args.dependency } : {}),
      ...(args.querySet.length > 0 ? { querySet: args.querySet } : {}),
      ...(args.ownerPath !== undefined || args.selector !== undefined
        ? {
            queryScope: {
              ...(args.ownerPath !== undefined ? { ownerPath: args.ownerPath } : {}),
              ...(args.selector !== undefined ? { roots: [args.selector] } : {}),
            },
          }
        : {}),
      ...(args.pipes.length > 0 ? { pipes: args.pipes } : {}),
      ...(args.renderMode !== undefined ? { renderMode: args.renderMode } : {}),
      ...(runtimeCost === undefined ? {} : { runtimeCost }),
      ...(args.view === "ingest" ? { stdin: streams.stdin ?? "" } : {}),
    });
    streams.stdout.write(
      args.json ? renderSemanticSearchPacketJson(packet) : renderSemanticSearchPacket(packet),
    );
    return 0;
  } catch (error) {
    streams.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }
}

function parseAstPatchArgs(argv: readonly string[]): ProtocolArgs {
  const mode = argv[0];
  if (mode === "--help" || mode === "-h") return { kind: "help" };
  if (mode === "apply") {
    return {
      kind: "error",
      message: "ts-harness ast-patch apply is unavailable; use dry-run and Codex apply_patch",
    };
  }
  if (mode !== "dry-run") {
    return {
      kind: "error",
      message: "usage: ts-harness ast-patch dry-run --packet <path-or-> [PROJECT_ROOT]",
    };
  }
  let packetPath: string | undefined;
  const positionals: string[] = [];
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--packet") {
      const value = argv[index + 1];
      if (value === undefined || (value.startsWith("-") && value !== "-")) {
        return { kind: "error", message: "--packet requires a path or -" };
      }
      packetPath = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown ast-patch option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (packetPath === undefined) {
    return { kind: "error", message: "missing required --packet <path-or->" };
  }
  if (positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return {
    kind: "ast-patch",
    mode,
    packetPath,
    projectRoot: positionals[0],
  };
}

function parseQueryArgs(argv: readonly string[]): ProtocolArgs {
  if (argv[0] === "--help" || argv[0] === "-h") return { kind: "help" };
  let json = false;
  let codeOnly = false;
  let namesOnly = false;
  let renderMode: "read-packet" | undefined;
  let packagePath: string | undefined;
  let workspace = false;
  let workspaceRoot: string | undefined;
  let fromHook: string | undefined;
  let selector: string | undefined;
  const terms: string[] = [];
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--term" || arg === "--query") {
      const value = argv[index + 1];
      if (value === undefined) return { kind: "error", message: `${arg} requires a value` };
      if (arg === "--query") {
        terms.push(
          ...value
            .split("|")
            .map((term) => term.trim())
            .filter((term) => term.length > 0),
        );
      } else {
        terms.push(value);
      }
      index += 1;
    } else if (arg === "--names-only") {
      namesOnly = true;
    } else if (arg === "--code") {
      codeOnly = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--view") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--view requires a query output mode" };
      }
      if (value !== "read-packet") {
        return { kind: "error", message: `unknown query --view mode: ${value}` };
      }
      renderMode = value;
      index += 1;
    } else if (arg === "--from-hook") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--from-hook requires a hook reason" };
      }
      fromHook = value;
      index += 1;
    } else if (arg === "--selector") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--selector requires an owner path" };
      }
      selector = value;
      index += 1;
    } else if (arg === "--package") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--package requires a package path" };
      }
      packagePath = value;
      index += 1;
    } else if (arg === "--workspace") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--workspace requires a workspace root" };
      }
      workspace = true;
      workspaceRoot = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown query option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (fromHook !== undefined && fromHook !== "direct-source-read") {
    return { kind: "error", message: `unsupported query hook route: ${fromHook}` };
  }
  if (fromHook === "direct-source-read" && json && renderMode === undefined) {
    renderMode = "read-packet";
  }
  if (renderMode === "read-packet" && fromHook !== "direct-source-read") {
    return {
      kind: "error",
      message: "--view read-packet requires --from-hook direct-source-read",
    };
  }
  if (renderMode === "read-packet" && !json) {
    return { kind: "error", message: "--view read-packet requires --json" };
  }
  const ownerPath = selector === undefined ? positionals[0] : ownerPathFromQuerySelector(selector);
  if (positionals.length > (selector === undefined ? 1 : 0)) {
    return {
      kind: "error",
      message: "query does not accept positional WORKSPACE; use --workspace <workspace-root>",
    };
  }
  if (ownerPath === undefined) {
    if (namesOnly && terms.length > 0) {
      return {
        kind: "error",
        message:
          "query --names-only requires an owner selector; workspace term discovery is `search fzf '<term>' owner --workspace <workspace-root> --view seeds`",
      };
    }
    return { kind: "error", message: "query requires an owner path" };
  }
  if (terms.length === 0 && fromHook !== "direct-source-read") {
    return { kind: "error", message: "query requires at least one --term" };
  }
  if (
    terms.length === 0 &&
    fromHook === "direct-source-read" &&
    !codeOnly &&
    !json &&
    !selectorHasLineRange(selector, ownerPath)
  ) {
    namesOnly = true;
  }
  if (json && codeOnly && renderMode !== "read-packet") {
    return { kind: "error", message: "--code cannot be combined with --json" };
  }
  if (namesOnly && codeOnly) {
    return { kind: "error", message: "--code cannot be combined with --names-only" };
  }
  return {
    kind: "query",
    ownerPath,
    selector,
    terms,
    projectRoot: workspaceRoot,
    packagePath,
    workspace,
    json,
    codeOnly,
    namesOnly,
    renderMode,
  };
}

function parseSearchArgs(argv: readonly string[]): ProtocolArgs {
  const viewValue = argv[0];
  if (viewValue === "--help" || viewValue === "-h") return { kind: "help" };
  if (viewValue === undefined) {
    return {
      kind: "error",
      message:
        "usage: ts-harness search <workspace|prime|owner|dependency|deps|docs|api|public-external-types|policy|symbol|callsite|import|tests|fzf|reasoning|env|runtime-source|lang|std|capability|extension|pattern|compare|text|ingest|query> ... [--json] [--code] [--package PATH] [--workspace <workspace-root>]",
    };
  }
  if (viewValue === "query") return parseSearchQueryArgs(argv.slice(1));
  const searchView = typeScriptSemanticSearchViewDescriptor(viewValue);
  if (searchView === undefined) {
    return { kind: "error", message: `unknown search view: ${viewValue}` };
  }

  let json = false;
  let renderMode: SemanticSearchRenderMode | undefined;
  let packagePath: string | undefined;
  let workspace = false;
  let workspaceRoot: string | undefined;
  let ownerPath: string | undefined;
  let dependency: string | undefined;
  const querySet: string[] = [];
  const positionals: string[] = [];
  let itemQuery: string | undefined;
  let codeOnly = false;
  let namesOnly = false;
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (isFlagLikeLiteralSearchQuery(searchView.view, positionals, querySet, arg)) {
      positionals.push(arg);
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--view") {
      const value = argv[index + 1];
      if (!isSemanticSearchRenderMode(value)) {
        return { kind: "error", message: "--view requires graph, hits, both, or seeds" };
      }
      renderMode = value;
      index += 1;
    } else if (arg === "--package") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--package requires a package path" };
      }
      packagePath = value;
      index += 1;
    } else if (arg === "--workspace") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--workspace requires a workspace root" };
      }
      workspace = true;
      workspaceRoot = value;
      index += 1;
    } else if (arg === "--owner") {
      const value = argv[index + 1];
      if (value === undefined) {
        return { kind: "error", message: "--owner requires an owner path" };
      }
      ownerPath = value;
      index += 1;
    } else if (arg === "--dependency") {
      const value = argv[index + 1];
      if (value === undefined) {
        return { kind: "error", message: "--dependency requires a dependency" };
      }
      dependency = value;
      index += 1;
    } else if (arg === "--query") {
      const value = argv[index + 1];
      if (value === undefined) return { kind: "error", message: "--query requires a value" };
      itemQuery = value;
      index++;
    } else if (arg === "--code") {
      codeOnly = true;
    } else if (arg === "--names-only") {
      namesOnly = true;
    } else if (arg === "--query-set") {
      const value = argv[index + 1];
      if (value === undefined) {
        return { kind: "error", message: "--query-set requires a query term" };
      }
      querySet.push(value);
      index += 1;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown search option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }

  if (querySet.length > 0 && !searchViewSupportsQuerySet(searchView.view)) {
    return { kind: "error", message: `search ${viewValue} does not support --query-set` };
  }
  if (
    ownerPath !== undefined &&
    !(searchView.view === "reasoning" || (searchView.view === "fzf" && querySet.length > 0))
  ) {
    return { kind: "error", message: "--owner is only supported by search fzf --query-set" };
  }
  if (dependency !== undefined && searchView.view !== "reasoning") {
    return { kind: "error", message: "--dependency is only supported by search reasoning" };
  }

  if (codeOnly && json) {
    return { kind: "error", message: "--code cannot be combined with --json" };
  }
  if (codeOnly && namesOnly) {
    return { kind: "error", message: "--names-only cannot be combined with --code" };
  }
  if (codeOnly && !(searchView.view === "owner" && itemQuery !== undefined)) {
    return { kind: "error", message: "--code requires search owner <path> --query <symbol>" };
  }
  if (namesOnly && !(searchView.view === "owner" && itemQuery !== undefined)) {
    return { kind: "error", message: "--names-only requires search owner <path> --query <symbol>" };
  }
  if (searchViewAcceptsOptionalTerms(searchView.view)) {
    if (searchView.requiresQuery && positionals.length === 0) {
      return { kind: "error", message: `search ${viewValue} requires a query` };
    }
    return {
      kind: "search",
      view: searchView.view,
      query: positionals.length > 0 ? positionals.join(" ") : undefined,
      projectRoot: workspaceRoot,
      packagePath,
      workspace,
      ownerPath: undefined,
      pipes: [],
      querySet: [],
      json,
      ...(codeOnly ? { codeOnly } : {}),
      ...(namesOnly ? { namesOnly } : {}),
      renderMode,
    };
  }
  if (searchView.requiresQuery) {
    const query = querySet.length > 0 ? querySet.join(",") : positionals[0];
    if (query === undefined) {
      return { kind: "error", message: `search ${viewValue} requires a query` };
    }
    const { pipes, projectRoot, error } = parseSearchPipePositionals(
      querySet.length > 0 ? positionals : positionals.slice(1),
      searchView.acceptedPipes ?? [],
    );
    if (error !== undefined) {
      return { kind: "error", message: error };
    }
    if (projectRoot !== undefined) {
      return {
        kind: "error",
        message: "search does not accept positional WORKSPACE; use --workspace <workspace-root>",
      };
    }
    return {
      kind: "search",
      view: searchView.view,
      query,
      ...(itemQuery !== undefined ? { itemQuery } : {}),
      projectRoot: workspaceRoot,
      packagePath,
      workspace,
      ownerPath,
      ...(dependency !== undefined ? { dependency } : {}),
      pipes,
      querySet,
      json,
      ...(codeOnly ? { codeOnly } : {}),
      ...(namesOnly ? { namesOnly } : {}),
      renderMode,
    };
  }

  const { pipes, projectRoot, error } = parseSearchPipePositionals(
    positionals,
    searchView.acceptedPipes ?? [],
  );
  if (error !== undefined) {
    return { kind: "error", message: error };
  }
  if (projectRoot !== undefined) {
    return {
      kind: "error",
      message: "search does not accept positional WORKSPACE; use --workspace <workspace-root>",
    };
  }
  return {
    kind: "search",
    view: searchView.view,
    query: undefined,
    projectRoot: workspaceRoot,
    packagePath,
    workspace,
    ownerPath: undefined,
    pipes,
    querySet: [],
    json,
    ...(codeOnly ? { codeOnly } : {}),
    ...(namesOnly ? { namesOnly } : {}),
    renderMode,
  };
}

function parseSearchQueryArgs(argv: readonly string[]): ProtocolArgs {
  let fromHook: string | undefined;
  let selector: string | undefined;
  let intent: string | undefined;
  let json = false;
  let renderMode: SemanticSearchRenderMode | undefined;
  let packagePath: string | undefined;
  let workspace = false;
  let workspaceRoot: string | undefined;
  const terms: string[] = [];
  let pipes: TypeScriptSemanticSearchPipe[] = [];
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--from-hook") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--from-hook requires a hook kind" };
      }
      fromHook = value;
      index += 1;
    } else if (arg === "--selector") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--selector requires a selector" };
      }
      selector = value;
      index += 1;
    } else if (arg === "--intent") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--intent requires an intent" };
      }
      intent = value;
      index += 1;
    } else if (arg === "--term") {
      const value = argv[index + 1];
      if (value === undefined) return { kind: "error", message: "--term requires a value" };
      terms.push(value);
      index += 1;
    } else if (arg === "--surface") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--surface requires owner,tests style surfaces" };
      }
      const parsed = parseSearchQuerySurfaces(value);
      if (typeof parsed === "string") return { kind: "error", message: parsed };
      pipes = parsed;
      index += 1;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--view") {
      const value = argv[index + 1];
      if (!isSemanticSearchRenderMode(value)) {
        return { kind: "error", message: "--view requires graph, hits, both, or seeds" };
      }
      renderMode = value;
      index += 1;
    } else if (arg === "--package") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--package requires a package path" };
      }
      packagePath = value;
      index += 1;
    } else if (arg === "--workspace") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: "--workspace requires a workspace root" };
      }
      workspace = true;
      workspaceRoot = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown search query option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (fromHook !== undefined && selector === undefined) {
    return { kind: "error", message: "--from-hook requires --selector" };
  }
  if (terms.length === 0) {
    return { kind: "error", message: "search query requires at least one --term" };
  }
  if (positionals.length > 0) {
    return {
      kind: "error",
      message:
        "search query does not accept positional WORKSPACE; use --workspace <workspace-root>",
    };
  }
  return {
    kind: "search",
    view: "fzf",
    query: terms.join(","),
    ...(fromHook !== undefined ? { fromHook } : {}),
    ...(selector !== undefined ? { selector } : {}),
    ...(intent !== undefined ? { intent } : {}),
    projectRoot: workspaceRoot,
    packagePath,
    workspace,
    ownerPath: ownerPathFromQuerySelector(selector),
    pipes,
    querySet: terms,
    json,
    renderMode,
  };
}

function resolveProviderProjectRoot(
  cwd: string,
  args: Pick<
    QueryArgs | TreeSitterQueryArgs | SearchArgs,
    "projectRoot" | "packagePath" | "workspace"
  >,
): string {
  const projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
  if (args.packagePath !== undefined) {
    return path.resolve(projectRoot, args.packagePath);
  }
  return projectRoot;
}

function tryRenderOwnerSeedFastPath(cwd: string, args: SearchArgs): string | undefined {
  if (
    args.view !== "owner" ||
    args.query === undefined ||
    args.itemQuery !== undefined ||
    args.pipes.length > 0 ||
    args.json ||
    args.renderMode !== "seeds"
  ) {
    return undefined;
  }
  const projectRoot = resolveProviderProjectRoot(cwd, args);
  const ownerPath = projectRelativeTypeScriptFile(projectRoot, args.query);
  if (ownerPath === undefined) return undefined;
  return [
    `[search-owner] q=${ownerPath} role=file public=false edge=0 find=0`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,O=owner}",
    `O=owner:path(${ownerPath})!owner`,
    "G>{O:selects}",
    "rank=O frontier=O.owner",
    "entries=owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "",
  ].join("\n");
}

function projectRelativeTypeScriptFile(projectRoot: string, query: string): string | undefined {
  const filePath = path.resolve(projectRoot, query);
  const relativePath = path.relative(projectRoot, filePath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !isTypeScriptSourcePath(filePath)
  ) {
    return undefined;
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return undefined;
  } catch {
    return undefined;
  }
  return relativePath.split(path.sep).join("/");
}

function isTypeScriptSourcePath(filePath: string): boolean {
  return [".ts", ".tsx", ".mts", ".cts"].includes(path.extname(filePath));
}

function tryRenderDependencySeedFastPath(cwd: string, args: SearchArgs): string | undefined {
  const dependency = args.dependency ?? args.query;
  if (
    args.view !== "deps" ||
    dependency === undefined ||
    args.itemQuery !== undefined ||
    args.pipes.length > 0 ||
    args.json ||
    args.renderMode !== "seeds"
  ) {
    return undefined;
  }
  const projectRoot = resolveProviderProjectRoot(cwd, args);
  const ownerPath = manifestDependencyOwnerPath(projectRoot, dependency);
  if (ownerPath === undefined) return undefined;
  return [
    `[search-dependency] q=${dependency} view=hits alg=seed-frontier`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,D=dependency,O=owner}",
    `D=dependency:pkg(${dependency})!dependency;O=owner:path(${ownerPath})!owner`,
    "G>{D:uses,O:selects}",
    "rank=D,O frontier=D.dependency,O.owner",
    "entries=owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "",
  ].join("\n");
}

function manifestDependencyOwnerPath(projectRoot: string, dependency: string): string | undefined {
  const manifestPath = path.join(projectRoot, "package.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
  if (!isJsonObject(manifest)) return undefined;
  if (manifest.name === dependency || manifestHasDependency(manifest, dependency)) {
    return ".";
  }
  return undefined;
}

function manifestHasDependency(manifest: Record<string, unknown>, dependency: string): boolean {
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some(
    (field) => {
      const value = manifest[field];
      return isJsonObject(value) && Object.hasOwn(value, dependency);
    },
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryRenderPackagePrimeSeedFastPath(cwd: string, args: SearchArgs): string | undefined {
  if (
    args.view !== "prime" ||
    args.packagePath === undefined ||
    args.itemQuery !== undefined ||
    args.pipes.length > 0 ||
    args.json ||
    args.renderMode !== "seeds"
  ) {
    return undefined;
  }
  const workspaceRoot = path.resolve(cwd, args.projectRoot ?? ".");
  const packageRoot = resolveProviderProjectRoot(cwd, args);
  const owners = collectPrimeSeedOwners(packageRoot, workspaceRoot, 4);
  if (owners.length === 0) return undefined;
  const packageName =
    nearestPackageName(packageRoot, workspaceRoot) ?? path.basename(workspaceRoot);
  const declarations: string[] = [];
  const edges: string[] = [];
  const rank: string[] = [];
  for (let index = 0; index < owners.length; index++) {
    const suffix = index === 0 ? "" : String(index + 1);
    const ownerId = `O${suffix}`;
    const queryId = `Q${suffix}`;
    const ownerPath = owners[index]!;
    const queryTerm = index === 0 ? "*" : queryTermFromOwnerPath(ownerPath);
    declarations.push(`${ownerId}=owner:path(${ownerPath})!owner`);
    declarations.push(`${queryId}=query:term(${queryTerm})!fzf`);
    edges.push(`${ownerId}:selects`, `${queryId}:matches`);
    rank.push(ownerId, queryId);
  }
  return [
    `[search-prime] root=${packageName} analysis=structure nativeSyntaxFacts=skipped policyFindings=skipped alg=budgeted-prime-frontier-v1 budget=handles:${owners.length * 2}`,
    "|decision purpose=decision-primer answer=false code=false capabilities=pipe,fzf,fd-query,rg-query,owner-items,selector-code,treesitter-query ladder=pipe>fzf>fd-query|rg-query>owner-items>selector-code history=asp-artifacts:directReadRisk,repeatedPrime,repeatedPipe,bestPath risk=broad-direct-read,manual-window-scan,repeat-prime next=\"asp typescript search pipe '<question-or-feature-term>' --workspace . --view seeds\"",
    "legend: ID=kind:role(value)!next; entries profile(selectors=>returns); frontier ID.next",
    "aliases: graph:{G=search,O=owner,Q=query}",
    declarations.join(";"),
    `G>{${edges.join(",")}}`,
    `rank=${rank.join(",")} frontier=${rank.map((id) => `${id}.${id.startsWith("O") ? "owner" : "fzf"}`).join(",")}`,
    "entries=owner-query(O,Q=>items+tests+dependency-usage),owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "omit=items,blocks,code,full-test-list",
    "avoid=raw-read,full-json,broad-lexical",
    "",
  ].join("\n");
}

function collectPrimeSeedOwners(
  packageRoot: string,
  workspaceRoot: string,
  limit: number,
): string[] {
  const files: { readonly path: string; readonly size: number }[] = [];
  collectTypeScriptFiles(packageRoot, files);
  return files
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, limit)
    .map((file) => path.relative(workspaceRoot, file.path).split(path.sep).join("/"));
}

function collectTypeScriptFiles(
  directory: string,
  files: { readonly path: string; readonly size: number }[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ["node_modules", "dist", "build"].includes(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles(entryPath, files);
    } else if (entry.isFile() && isPrimeSeedSourcePath(entryPath)) {
      files.push({ path: entryPath, size: 0 });
    }
  }
}

function isPrimeSeedSourcePath(filePath: string): boolean {
  return isTypeScriptSourcePath(filePath) && !filePath.endsWith(".d.ts");
}

function nearestPackageName(packageRoot: string, workspaceRoot: string): string | undefined {
  let current = packageRoot;
  while (true) {
    const packageName = packageNameAt(current);
    if (packageName !== undefined) return packageName;
    if (current === workspaceRoot) return undefined;
    const parent = path.dirname(current);
    if (parent === current || !isPathWithin(parent, workspaceRoot)) return undefined;
    current = parent;
  }
}

function packageNameAt(directory: string): string | undefined {
  const manifestPath = path.join(directory, "package.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    return isJsonObject(manifest) && typeof manifest.name === "string" ? manifest.name : undefined;
  } catch {
    return undefined;
  }
}

function queryTermFromOwnerPath(ownerPath: string): string {
  return path.basename(ownerPath).replace(/\.[cm]?tsx?$/u, "") || "*";
}

function isPathWithin(pathToCheck: string, root: string): boolean {
  const relativePath = path.relative(root, pathToCheck);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function tryRenderPackageFzfSeedFastPath(cwd: string, args: SearchArgs): string | undefined {
  if (
    args.view !== "fzf" ||
    args.packagePath === undefined ||
    args.itemQuery !== undefined ||
    args.querySet.length === 0 ||
    args.json ||
    args.renderMode !== "seeds" ||
    !args.pipes.includes("owner")
  ) {
    return undefined;
  }
  const terms = args.querySet.map((term) => term.trim()).filter((term) => term.length > 0);
  if (terms.length === 0) return undefined;
  const workspaceRoot = path.resolve(cwd, args.projectRoot ?? ".");
  const packageRoot = resolveProviderProjectRoot(cwd, args);
  const owners = collectTextSearchOwners(packageRoot, workspaceRoot, terms, 6);
  if (owners.length === 0) return undefined;
  const query = terms.join(",");
  const declarations = [`Q=query:term(${query})!fzf`];
  const edges = ["Q:matches"];
  const rank = ["Q"];
  for (let index = 0; index < owners.length; index++) {
    const ownerId = `O${index === 0 ? "" : String(index + 1)}`;
    declarations.push(`${ownerId}=owner:path(${owners[index]!.path})!owner`);
    edges.push(`${ownerId}:selects`);
    rank.push(ownerId);
  }
  const symbolTerm = selectSymbolTerm(terms);
  if (symbolTerm !== undefined) {
    declarations.push(`S=symbol:symbol(${symbolTerm})!symbol`);
    edges.push("S:contains");
    rank.push("S");
  }
  return [
    `[search-fzf] q=${query} querySet=${terms.length} selector=fuzzy-set view=hits alg=query-set-owner-resolution`,
    "legend: ID=kind:role(value)!next; edge SRC>{DST:rel}; frontier ID.next",
    "aliases: graph:{G=search,Q=query,O=owner,S=symbol}",
    declarations.join(";"),
    `G>{${edges.join(",")}}`,
    `rank=${rank.join(",")} frontier=${rank.map((id) => `${id}.${id === "Q" ? "fzf" : id === "S" ? "symbol" : "owner"}`).join(",")}`,
    "entries=owner-query(O,Q=>items+tests+dependency-usage),owner-tests(O=>covering-tests+test-entrypoints+fixtures)",
    "",
  ].join("\n");
}

function collectTextSearchOwners(
  packageRoot: string,
  workspaceRoot: string,
  terms: readonly string[],
  limit: number,
): { readonly path: string; readonly score: number }[] {
  const files: { readonly path: string; readonly size: number }[] = [];
  collectTypeScriptFiles(packageRoot, files);
  const filenameMatches = collectFilenameSearchOwners(files, workspaceRoot, terms, limit);
  if (filenameMatches.length > 0) return filenameMatches;
  const loweredTerms = terms.map((term) => term.toLowerCase());
  const scored: { readonly path: string; readonly score: number; readonly size: number }[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file.path, "utf8");
    } catch {
      continue;
    }
    const lowerText = text.toLowerCase();
    const lowerName = path.basename(file.path).toLowerCase();
    let score = 0;
    for (let index = 0; index < terms.length; index++) {
      const term = terms[index]!;
      const lowerTerm = loweredTerms[index]!;
      if (lowerName.includes(lowerTerm)) score += 40;
      score += countOccurrences(lowerText, lowerTerm, 8) * 10;
      if (text.includes(`function ${term}`) || text.includes(`const ${term}`)) score += 30;
      if (text.includes(`export ${term}`) || text.includes(`export function ${term}`)) score += 20;
    }
    if (score > 0) {
      scored.push({
        path: path.relative(workspaceRoot, file.path).split(path.sep).join("/"),
        score,
        size: text.length,
      });
    }
  }
  return scored
    .sort(
      (left, right) =>
        right.score - left.score || right.size - left.size || left.path.localeCompare(right.path),
    )
    .slice(0, limit)
    .map(({ path: ownerPath, score }) => ({ path: ownerPath, score }));
}

function collectFilenameSearchOwners(
  files: readonly { readonly path: string; readonly size: number }[],
  workspaceRoot: string,
  terms: readonly string[],
  limit: number,
): { readonly path: string; readonly score: number }[] {
  const termTokens = terms.map(queryTokens);
  const primaryTokens = queryTokens(selectSymbolTerm(terms) ?? "");
  const scored: { readonly path: string; readonly score: number; readonly size: number }[] = [];
  for (const file of files) {
    const lowerName = path.basename(file.path).toLowerCase();
    let score = 0;
    for (let index = 0; index < terms.length; index++) {
      const lowerTerm = terms[index]!.toLowerCase();
      if (lowerName.includes(lowerTerm)) score += 80;
      for (const token of termTokens[index]!) {
        if (lowerName.includes(token)) score += 25;
      }
    }
    for (const token of primaryTokens) {
      if (lowerName.includes(token)) score += 70;
    }
    if (score > 0) {
      scored.push({
        path: path.relative(workspaceRoot, file.path).split(path.sep).join("/"),
        score,
        size: file.size,
      });
    }
  }
  return scored
    .sort(
      (left, right) =>
        right.score - left.score || right.size - left.size || left.path.localeCompare(right.path),
    )
    .slice(0, limit)
    .map(({ path: ownerPath, score }) => ({ path: ownerPath, score }));
}

function queryTokens(term: string): string[] {
  return term
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9_$]+/u)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 2);
}

function countOccurrences(text: string, term: string, limit: number): number {
  if (term.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while (count < limit) {
    const index = text.indexOf(term, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + term.length;
  }
  return count;
}

function selectSymbolTerm(terms: readonly string[]): string | undefined {
  return (
    terms.find((term) => queryTokens(term).some((token) => token === "program")) ??
    terms.find(isIdentifierTerm)
  );
}

function isIdentifierTerm(term: string): boolean {
  return /^[A-Za-z_$][\w$]*$/u.test(term);
}

function parseSearchQuerySurfaces(value: string): TypeScriptSemanticSearchPipe[] | string {
  const surfaces = value
    .split(",")
    .map((surface) => surface.trim())
    .filter((surface) => surface.length > 0);
  if (surfaces.length === 0) return "--surface requires at least one surface";
  const pipes: TypeScriptSemanticSearchPipe[] = [];
  for (const surface of surfaces) {
    const pipe = surface === "owners" ? "owner" : surface;
    if (pipe === "items" || typeScriptSemanticSearchViewDescriptor(pipe) !== undefined) {
      pipes.push(pipe as TypeScriptSemanticSearchPipe);
    } else {
      return `unknown search query surface: ${surface}`;
    }
  }
  return pipes;
}

function searchViewAcceptsOptionalTerms(view: TypeScriptSemanticSearchView): boolean {
  return new Set<TypeScriptSemanticSearchView>([
    "env",
    "runtime-source",
    "lang",
    "std",
    "capability",
    "extension",
    "pattern",
    "compare",
  ]).has(view);
}

function isBroadHookQueryArgs(argv: readonly string[]): boolean {
  let fromHook: string | undefined;
  let selector: string | undefined;
  let hasTerm = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--from-hook") {
      fromHook = argv[index + 1];
      index += 1;
    } else if (arg === "--selector") {
      selector = argv[index + 1];
      index += 1;
    } else if (arg === "--term") {
      hasTerm = argv[index + 1] !== undefined;
      index += 1;
    }
  }
  return (
    fromHook === "direct-source-read" &&
    hasTerm &&
    selector !== undefined &&
    querySelectorHasGlob(selector)
  );
}

function querySelectorHasGlob(selector: string): boolean {
  return /[*?[{}\]]/u.test(selector);
}

function parseSearchPipePositionals(
  positionals: readonly string[],
  acceptedPipes: readonly TypeScriptSemanticSearchPipe[],
): {
  readonly pipes: readonly TypeScriptSemanticSearchPipe[];
  readonly projectRoot: string | undefined;
  readonly error?: string;
} {
  const pipes: TypeScriptSemanticSearchPipe[] = [];
  let index = 0;
  while (index < positionals.length && positionals[index] === acceptedPipes[index]) {
    pipes.push(positionals[index]! as TypeScriptSemanticSearchPipe);
    index += 1;
  }
  const remaining = positionals.slice(index);
  if (remaining.length > 1) {
    const looksLikeOutOfOrderPipe =
      index < acceptedPipes.length &&
      acceptedPipes.includes(remaining[0] as TypeScriptSemanticSearchPipe);
    return {
      pipes,
      projectRoot: remaining[0],
      error:
        acceptedPipes.length === 0 || !looksLikeOutOfOrderPipe
          ? "search does not accept positional WORKSPACE; use --workspace <workspace-root>"
          : `expected pipes (${acceptedPipes.join(",")}) before workspace selector`,
    };
  }
  return { pipes, projectRoot: remaining[0] };
}

function parseCheckArgs(argv: readonly string[]): ProtocolArgs {
  let json = false;
  let mode: "changed" | "full" = "full";
  const positionals: string[] = [];
  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
    } else if (arg === "--changed") {
      mode = "changed";
    } else if (arg === "--full") {
      mode = "full";
    } else if (arg === "--help" || arg === "-h") {
      return {
        kind: "error",
        message: "usage: ts-harness check [--changed | --full] [--json] [PROJECT_ROOT]",
      };
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown check option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return { kind: "check", mode, projectRoot: positionals[0], json };
}

function parseEvidenceArgs(argv: readonly string[]): ProtocolArgs {
  const actionValue = argv[0];
  if (actionValue === "--help" || actionValue === "-h") return { kind: "help" };
  if (actionValue !== "graph" && actionValue !== "analyze" && actionValue !== "analysis") {
    return { kind: "error", message: "expected evidence <graph|analyze>" };
  }
  let json = false;
  const positionals: string[] = [];
  for (const arg of argv.slice(1)) {
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown evidence option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return {
    kind: "evidence",
    action: actionValue === "analysis" ? "analyze" : actionValue,
    projectRoot: positionals[0],
    json,
  };
}

function isSemanticSearchRenderMode(value: string | undefined): value is SemanticSearchRenderMode {
  return value === "graph" || value === "hits" || value === "both" || value === "seeds";
}

function isFlagLikeLiteralSearchQuery(
  view: TypeScriptSemanticSearchView,
  positionals: readonly string[],
  querySet: readonly string[],
  arg: string,
): boolean {
  return (
    view === "fzf" &&
    positionals.length === 0 &&
    querySet.length === 0 &&
    arg.startsWith("-") &&
    arg !== "--view" &&
    arg !== "--package" &&
    arg !== "--workspace" &&
    arg !== "--owner" &&
    arg !== "--dependency" &&
    arg !== "--query" &&
    arg !== "--query-set" &&
    arg !== "--code" &&
    arg !== "--help" &&
    arg !== "-h"
  );
}

function searchViewSupportsQuerySet(view: TypeScriptSemanticSearchView): boolean {
  return view === "fzf";
}
