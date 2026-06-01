/**
 * Protocol command parsing and dispatch for the ts-harness CLI.
 */

import path from "node:path";

import { renderTypeScriptProjectHarness, renderTypeScriptProjectHarnessJson } from "../render.js";
import { runTypeScriptProjectHarness } from "../runner.js";
import { isTypeScriptHarnessClean } from "../model.js";
import {
  installCodexAgentHooks,
  isAgentHookEvent,
  renderCodexAgentGuide,
  runCodexAgentHook,
  type AgentHookEvent,
} from "./agent-hooks.js";
import {
  SEMANTIC_LANGUAGE_PROTOCOL_ID,
  SEMANTIC_LANGUAGE_REGISTRY_VERSION,
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_LANGUAGE_ID,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
  TYPE_SCRIPT_PROVIDER_ID,
  semanticLanguageRegistryDocument,
  typeScriptSemanticSearchViewDescriptor,
  typeScriptSemanticLanguageRegistration,
  type TypeScriptSemanticSearchView,
} from "./semantic-language.js";
import {
  buildSemanticSearchPacket,
  renderSemanticSearchPacket,
  renderSemanticSearchPacketJson,
  type SemanticSearchRenderMode,
} from "./semantic-search.js";

export interface CliStreams {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
  readonly stdin?: string;
}

export type ProtocolArgs =
  | SearchArgs
  | CheckArgs
  | AgentArgs
  | ProtocolHelpArgs
  | ProtocolErrorArgs;

interface SearchArgs {
  readonly kind: "search";
  readonly view: TypeScriptSemanticSearchView;
  readonly query: string | undefined;
  readonly projectRoot: string | undefined;
  readonly packagePath: string | undefined;
  readonly ownerPath: string | undefined;
  readonly pipes: readonly TypeScriptSemanticSearchView[];
  readonly querySet: readonly string[];
  readonly json: boolean;
  readonly renderMode: SemanticSearchRenderMode | undefined;
}

interface CheckArgs {
  readonly kind: "check";
  readonly mode: "changed" | "full";
  readonly projectRoot: string | undefined;
  readonly json: boolean;
}

type AgentArgs = AgentDoctorArgs | AgentInstallArgs | AgentHookArgs | AgentGuideArgs;

interface AgentDoctorArgs {
  readonly kind: "agent";
  readonly action: "doctor";
  readonly projectRoot: string | undefined;
  readonly json: boolean;
}

interface AgentInstallArgs {
  readonly kind: "agent";
  readonly action: "install";
  readonly client: "codex";
  readonly projectRoot: string | undefined;
}

interface AgentHookArgs {
  readonly kind: "agent";
  readonly action: "hook";
  readonly client: "codex";
  readonly event: AgentHookEvent;
  readonly projectRoot: string | undefined;
}

interface AgentGuideArgs {
  readonly kind: "agent";
  readonly action: "guide";
  readonly client: "codex";
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
  if (command === "check") return parseCheckArgs(argv.slice(1));
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
    try {
      if (args.action === "doctor") {
        streams.stdout.write(
          args.json ? renderAgentDoctorJson(projectRoot) : renderAgentDoctor(projectRoot),
        );
        return 0;
      }
      if (args.action === "install") {
        streams.stdout.write(installCodexAgentHooks(projectRoot));
        return 0;
      }
      if (args.action === "guide") {
        streams.stdout.write(renderCodexAgentGuide(projectRoot));
        return 0;
      }
      streams.stdout.write(runCodexAgentHook(args.event, projectRoot, streams.stdin ?? ""));
      return 0;
    } catch (error) {
      streams.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 3;
    }
  }

  const projectRoot =
    args.kind === "search"
      ? searchProjectRoot(cwd, args.projectRoot, args.packagePath)
      : path.resolve(cwd, args.projectRoot ?? ".");
  try {
    if (args.kind === "check") {
      const report = runTypeScriptProjectHarness(projectRoot);
      if (args.json) {
        streams.stdout.write(renderTypeScriptProjectHarnessJson(report));
      } else {
        const compact = renderTypeScriptProjectHarness(report);
        streams.stdout.write(compact === "" ? "[ok] typescript\n" : `${compact}\n`);
      }
      return isTypeScriptHarnessClean(report) ? 0 : 1;
    }

    const report = runTypeScriptProjectHarness(projectRoot, undefined, {
      collectSemanticDiagnostics: false,
      collectNativeSyntaxFacts: searchNeedsFullNativeSyntaxFacts(args.view),
      evaluateRules: searchNeedsRuleEvaluation(args.view),
    });
    const packet = buildSemanticSearchPacket(report, {
      view: args.view,
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.querySet.length > 0 ? { querySet: args.querySet } : {}),
      ...(args.ownerPath !== undefined ? { queryScope: { ownerPath: args.ownerPath } } : {}),
      ...(args.pipes.length > 0 ? { pipes: args.pipes } : {}),
      ...(args.renderMode !== undefined ? { renderMode: args.renderMode } : {}),
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

function searchNeedsFullNativeSyntaxFacts(view: TypeScriptSemanticSearchView): boolean {
  switch (view) {
    case "workspace":
    case "prime":
    case "owner":
    case "api":
    case "public-external-types":
      return true;
    case "dependency":
    case "deps":
    case "symbol":
    case "callsite":
    case "import":
    case "tests":
    case "text":
    case "ingest":
      return false;
  }
}

function searchNeedsRuleEvaluation(view: TypeScriptSemanticSearchView): boolean {
  switch (view) {
    case "workspace":
    case "prime":
    case "owner":
      return true;
    case "dependency":
    case "deps":
    case "api":
    case "public-external-types":
    case "symbol":
    case "callsite":
    case "import":
    case "tests":
    case "text":
    case "ingest":
      return false;
  }
}

function parseSearchArgs(argv: readonly string[]): ProtocolArgs {
  const viewValue = argv[0];
  if (viewValue === undefined || viewValue === "--help" || viewValue === "-h") {
    return {
      kind: "error",
      message:
        "usage: ts-harness search <workspace|prime|owner|dependency|deps|api|public-external-types|symbol|callsite|import|tests|text|ingest> ... [--json] [--package PATH] [PROJECT_ROOT]",
    };
  }
  const searchView = typeScriptSemanticSearchViewDescriptor(viewValue);
  if (searchView === undefined) {
    return { kind: "error", message: `unknown search view: ${viewValue}` };
  }

  let json = false;
  let renderMode: SemanticSearchRenderMode | undefined;
  let packagePath: string | undefined;
  let ownerPath: string | undefined;
  const querySet: string[] = [];
  const positionals: string[] = [];
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
    } else if (arg === "--owner") {
      const value = argv[index + 1];
      if (value === undefined) {
        return { kind: "error", message: "--owner requires an owner path" };
      }
      ownerPath = value;
      index += 1;
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
  if (ownerPath !== undefined && !(searchView.view === "text" && querySet.length > 0)) {
    return { kind: "error", message: "--owner is only supported by search text --query-set" };
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
    if (querySet.length === 0 && positionals.length > 2 && pipes.length === 0) {
      return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
    }
    return {
      kind: "search",
      view: searchView.view,
      query,
      projectRoot,
      packagePath,
      ownerPath,
      pipes,
      querySet,
      json,
      renderMode,
    };
  }

  if (positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return {
    kind: "search",
    view: searchView.view,
    query: undefined,
    projectRoot: positionals[0],
    packagePath,
    ownerPath: undefined,
    pipes: [],
    querySet: [],
    json,
    renderMode,
  };
}

function parseSearchPipePositionals(
  positionals: readonly string[],
  acceptedPipes: readonly TypeScriptSemanticSearchView[],
): {
  readonly pipes: readonly TypeScriptSemanticSearchView[];
  readonly projectRoot: string | undefined;
  readonly error?: string;
} {
  const pipes: TypeScriptSemanticSearchView[] = [];
  let index = 0;
  while (index < positionals.length && positionals[index] === acceptedPipes[index]) {
    pipes.push(positionals[index]! as TypeScriptSemanticSearchView);
    index += 1;
  }
  const remaining = positionals.slice(index);
  if (remaining.length > 1) {
    return {
      pipes,
      projectRoot: remaining[0],
      error:
        acceptedPipes.length === 0
          ? "expected at most one PROJECT_ROOT argument"
          : `expected pipes (${acceptedPipes.join(",")}) before PROJECT_ROOT`,
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

function parseAgentArgs(argv: readonly string[]): ProtocolArgs {
  const action = argv[0] ?? "doctor";
  if (action === "install") return parseAgentInstallArgs(argv.slice(1));
  if (action === "hook") return parseAgentHookArgs(argv.slice(1));
  if (action === "guide") return parseAgentGuideArgs(argv.slice(1));
  if (action !== "doctor") return { kind: "error", message: `unknown agent action: ${action}` };
  let json = false;
  const positionals: string[] = [];
  for (const arg of argv.slice(1)) {
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      continue;
    } else if (arg.startsWith("-")) {
      return { kind: "error", message: `unknown agent option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return { kind: "agent", action: "doctor", projectRoot: positionals[0], json };
}

function parseAgentInstallArgs(argv: readonly string[]): ProtocolArgs {
  const parsed = parseAgentClientPositionals(argv);
  if (parsed.error !== undefined) return { kind: "error", message: parsed.error };
  if (parsed.positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return {
    kind: "agent",
    action: "install",
    client: "codex",
    projectRoot: parsed.positionals[0],
  };
}

function parseAgentHookArgs(argv: readonly string[]): ProtocolArgs {
  const parsed = parseAgentClientPositionals(argv);
  if (parsed.error !== undefined) return { kind: "error", message: parsed.error };
  const event = parsed.positionals[0];
  if (!isAgentHookEvent(event)) {
    return { kind: "error", message: "agent hook requires a Codex hook event" };
  }
  if (parsed.positionals.length > 2) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return {
    kind: "agent",
    action: "hook",
    client: "codex",
    event,
    projectRoot: parsed.positionals[1],
  };
}

function parseAgentGuideArgs(argv: readonly string[]): ProtocolArgs {
  const parsed = parseAgentClientPositionals(argv);
  if (parsed.error !== undefined) return { kind: "error", message: parsed.error };
  if (parsed.positionals.length > 1) {
    return { kind: "error", message: "expected at most one PROJECT_ROOT argument" };
  }
  return {
    kind: "agent",
    action: "guide",
    client: "codex",
    projectRoot: parsed.positionals[0],
  };
}

function parseAgentClientPositionals(argv: readonly string[]): {
  readonly positionals: readonly string[];
  readonly error?: string;
} {
  let client: string | undefined;
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--client") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { positionals, error: "--client requires codex" };
      }
      client = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      continue;
    } else if (arg.startsWith("-")) {
      return { positionals, error: `unknown agent option: ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  if (client !== "codex") return { positionals, error: "agent action requires --client codex" };
  return { positionals };
}

function searchProjectRoot(
  cwd: string,
  projectRoot: string | undefined,
  packagePath: string | undefined,
): string {
  const root = path.resolve(cwd, projectRoot ?? ".");
  return packagePath === undefined ? root : path.resolve(root, packagePath);
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
    view === "text" &&
    positionals.length === 0 &&
    querySet.length === 0 &&
    arg.startsWith("-") &&
    arg !== "--view" &&
    arg !== "--package" &&
    arg !== "--owner" &&
    arg !== "--query-set" &&
    arg !== "--help" &&
    arg !== "-h"
  );
}

function searchViewSupportsQuerySet(view: TypeScriptSemanticSearchView): boolean {
  return view === "text";
}

function renderAgentDoctor(projectRoot: string): string {
  const registration = typeScriptSemanticLanguageRegistration();
  return (
    [
      `[agent-doctor] status=ok protocol=${SEMANTIC_LANGUAGE_PROTOCOL_ID} registry=semantic-language-registry.v${SEMANTIC_LANGUAGE_REGISTRY_VERSION}`,
      `|project ${projectRoot}`,
      `|language id=${TYPE_SCRIPT_LANGUAGE_ID} provider=${TYPE_SCRIPT_PROVIDER_ID} binary=${TYPE_SCRIPT_BINARY}`,
      `|namespace ${TYPE_SCRIPT_PROVIDER_NAMESPACE}`,
      `|method ${registration.methods.join(",")}`,
      "|schema semantic-search-packet.v1",
    ].join("\n") + "\n"
  );
}

function renderAgentDoctorJson(projectRoot: string): string {
  return `${JSON.stringify(semanticLanguageRegistryDocument(projectRoot), null, 2)}\n`;
}
