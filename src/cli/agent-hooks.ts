/**
 * Codex agent hook install/runtime support for the ts-harness CLI.
 */

import fs from "node:fs";
import path from "node:path";

export type AgentHookEvent =
  | "session-start"
  | "user-prompt"
  | "pre-tool"
  | "permission-request"
  | "post-tool"
  | "subagent-start"
  | "subagent-stop"
  | "stop";

type HookDecision = {
  readonly blocked: string;
  readonly path?: string;
  readonly command?: string;
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const SOURCE_ROOTS = new Set(["src", "test", "tests", "__tests__", "packages", "apps", "lib"]);
const DUMP_COMMANDS = new Set(["cat", "sed", "nl", "bat", "head", "tail", "less", "more"]);
const SEARCH_COMMANDS = new Set(["r" + "g", "gr" + "ep", "a" + "g"]);
const CONFIG_BEGIN = "# BEGIN ts-harness agent hooks";
const CONFIG_END = "# END ts-harness agent hooks";

export function isAgentHookEvent(value: string | undefined): value is AgentHookEvent {
  return (
    value === "session-start" ||
    value === "user-prompt" ||
    value === "pre-tool" ||
    value === "permission-request" ||
    value === "post-tool" ||
    value === "subagent-start" ||
    value === "subagent-stop" ||
    value === "stop"
  );
}

export function installCodexAgentHooks(projectRoot: string): string {
  const codexDir = path.join(projectRoot, ".codex");
  fs.mkdirSync(codexDir, { recursive: true });
  const configPath = path.join(codexDir, "config.toml");
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : undefined;
  const merged = mergeCodexHookConfig(existing, codexHookConfig());
  fs.writeFileSync(configPath, merged.content, "utf8");
  return `[agent-install] client=codex path=${path.relative(projectRoot, configPath)} mode=${merged.mode}\n`;
}

export function runCodexAgentHook(
  event: AgentHookEvent,
  projectRoot: string,
  stdin: string,
): string {
  if (event === "pre-tool" || event === "permission-request") {
    const decision = classify(stdin);
    if (decision !== undefined) {
      return event === "permission-request"
        ? permissionRequestDeny(decision, projectRoot)
        : preToolDeny(decision, projectRoot);
    }
    return "";
  }

  if (event === "session-start" || event === "user-prompt" || event === "subagent-start") {
    return contextMessage(projectRoot);
  }

  return "";
}

export function renderCodexAgentGuide(projectRoot: string): string {
  return `${commandGuide({
    ownerTarget: "<owner-path>",
    projectRoot,
  })}\n`;
}

function parseHookPayload(stdin: string): unknown | undefined {
  const trimmed = stdin.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function classify(stdin: string): HookDecision | undefined {
  const payload = parseHookPayload(stdin);
  if (payload === undefined) return undefined;
  const toolName = lowerString(
    payloadValue(payload, "tool_name") ?? payloadValue(payload, "toolName"),
  );
  const strings = collectStrings(payload);
  const command = commandMaybe(payload);
  if (command !== undefined) {
    if (usesTsHarnessSearch(command)) return undefined;
    const dumpPath = rawDumpSourcePath(command);
    if (dumpPath !== undefined) return { blocked: "read-source", path: dumpPath, command };
    if (isRawSearch(command)) return { blocked: "raw-search", command };
  }
  if (isReadTool(toolName)) {
    for (const text of strings) {
      const pathValue = sourcePathFromValue(text);
      if (pathValue !== undefined) return { blocked: "read-source", path: pathValue };
    }
  }
  return undefined;
}

function payloadValue(payload: unknown, key: string): string | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function collectStrings(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry));
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap((entry) => collectStrings(entry));
}

function nestedPayloadValue(payload: unknown, pathKeys: readonly string[]): string | undefined {
  let current = payload;
  for (const key of pathKeys) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

function commandMaybe(payload: unknown): string | undefined {
  return (
    nestedPayloadValue(payload, ["tool_input", "cmd"]) ??
    nestedPayloadValue(payload, ["toolInput", "cmd"]) ??
    nestedPayloadValue(payload, ["tool_input", "command"]) ??
    nestedPayloadValue(payload, ["toolInput", "command"])
  );
}

function rawDumpSourcePath(command: string): string | undefined {
  const tokens = shellWords(command);
  const dumpIndex = tokens.findIndex((token) => DUMP_COMMANDS.has(path.basename(token)));
  if (dumpIndex < 0) return undefined;
  for (const token of tokens.slice(dumpIndex + 1)) {
    const pathValue = sourcePathFromValue(token);
    if (pathValue !== undefined) return pathValue;
  }
  return undefined;
}

function isRawSearch(command: string): boolean {
  const tokens = shellWords(command);
  if (!tokens.some((token) => SEARCH_COMMANDS.has(path.basename(token)))) return false;
  if (tokens.some((token) => token.includes("ts-harness"))) return false;
  return tokens.some((token) => sourceRootToken(token) || sourceGlobToken(token));
}

function usesTsHarnessSearch(command: string): boolean {
  return command.includes("ts-harness search");
}

function sourcePathFromValue(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/");
  const extension = path.extname(normalized);
  if (!SOURCE_EXTENSIONS.has(extension)) return undefined;
  if (normalized.includes("node_modules/") || normalized.includes("/dist/")) return undefined;
  return path.isAbsolute(normalized) ? normalized : stripLeadingDot(normalized);
}

function sourceRootToken(token: string): boolean {
  const clean = stripLeadingDot(token.replaceAll("\\", "/"));
  return SOURCE_ROOTS.has(clean) || [...SOURCE_ROOTS].some((root) => clean.startsWith(`${root}/`));
}

function sourceGlobToken(token: string): boolean {
  return token.includes("*.ts") || token.includes("*.tsx") || token.includes("*.js");
}

function shellWords(command: string): readonly string[] {
  return command
    .replace(/[;&()]/gu, " ")
    .split(/\s+/u)
    .map((token) => token.replace(/^['"]|['"]$/gu, ""))
    .filter((token) => token.length > 0);
}

function isReadTool(toolName: string): boolean {
  return toolName.includes("read");
}

function lowerString(value: string | undefined): string {
  return value?.toLowerCase() ?? "";
}

function stripLeadingDot(value: string): string {
  return value.replace(/^\.\//u, "");
}

function preToolDeny(decision: HookDecision, projectRoot: string): string {
  return `${JSON.stringify(denyPayload("PreToolUse", decision, projectRoot))}\n`;
}

function permissionRequestDeny(decision: HookDecision, projectRoot: string): string {
  return `${JSON.stringify(denyPayload("PermissionRequest", decision, projectRoot))}\n`;
}

function denyPayload(
  eventName: string,
  decision: HookDecision,
  projectRoot: string,
): Record<string, unknown> {
  const guide = flowGuide(decision, projectRoot);
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      permissionDecision: "deny",
      permissionDecisionReason: guide,
    },
    systemMessage: guide,
  };
}

function contextMessage(projectRoot: string): string {
  return `${JSON.stringify({
    systemMessage: commandGuide({ ownerTarget: "<owner-path>", projectRoot }),
  })}\n`;
}

function flowGuide(decision: HookDecision, projectRoot: string): string {
  const projectHint = projectHintForDecision(decision, projectRoot);
  const lines = [
    `[ts-harness-flow] blocked=${decision.blocked}${decision.path === undefined ? "" : ` path=${decision.path}`} policy=search-first`,
    commandGuide({
      ownerTarget: projectHint.ownerTarget ?? "<owner-path>",
      projectRoot: projectHint.projectRoot,
    }),
  ];
  if (decision.command !== undefined) lines.push(`|denied command=${decision.command}`);
  return lines.join("\n");
}

function commandGuide(input: {
  readonly ownerTarget: string;
  readonly projectRoot: string;
}): string {
  const root = input.projectRoot === "." ? "." : input.projectRoot;
  return [
    `[ts-harness-guide] project=${root}`,
    `|cmd ts-harness search prime --view seeds ${root}`,
    `|cmd ts-harness search owner ${input.ownerTarget} --view seeds ${root}`,
    `|cmd ts-harness search text <query> owner tests --view seeds ${root}`,
    `|cmd ts-harness search deps <dep[/subpath][@version][::api]> ${root}`,
    `|pipe <candidate-lines> | ts-harness search ingest --view seeds ${root}`,
    `|cmd ts-harness check --changed ${root}`,
    "|rule use installed ts-harness binary; run one command at a time; no raw TS/JS source reads",
    "|subagent give one |cmd or |pipe line; require evidence/missing/next/risk",
  ].join("\n");
}

function projectHintForDecision(
  decision: HookDecision,
  projectRoot: string,
): { readonly ownerTarget: string | undefined; readonly projectRoot: string } {
  if (decision.path === undefined) return { ownerTarget: undefined, projectRoot: "." };
  if (!path.isAbsolute(decision.path)) return { ownerTarget: decision.path, projectRoot: "." };
  const root = nearestTypeScriptProjectRoot(decision.path) ?? projectRoot;
  const ownerTarget = path.relative(root, decision.path).replaceAll("\\", "/");
  return { ownerTarget, projectRoot: root };
}

function nearestTypeScriptProjectRoot(sourcePath: string): string | undefined {
  let current: string;
  try {
    current = fs.statSync(sourcePath).isDirectory() ? sourcePath : path.dirname(sourcePath);
  } catch {
    current = path.dirname(sourcePath);
  }
  while (true) {
    if (
      fs.existsSync(path.join(current, "package.json")) ||
      fs.existsSync(path.join(current, "tsconfig.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function mergeCodexHookConfig(
  existing: string | undefined,
  block: string,
): { readonly content: string; readonly mode: "created" | "merged" | "updated" | "present" } {
  if (existing === undefined || existing.trim() === "") return { content: block, mode: "created" };

  const begin = existing.indexOf(CONFIG_BEGIN);
  const end = existing.indexOf(CONFIG_END);
  if (begin >= 0 && end > begin) {
    const nextEnd = end + CONFIG_END.length;
    const content = `${existing.slice(0, begin)}${block.trimEnd()}${existing.slice(nextEnd)}`;
    return { content: ensureTrailingNewline(content), mode: "updated" };
  }

  if (existing.includes("ts-harness agent hook --client codex")) {
    return { content: ensureTrailingNewline(existing), mode: "present" };
  }

  return { content: `${existing.trimEnd()}\n\n${block}`, mode: "merged" };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function codexHookConfig(): string {
  return `${CONFIG_BEGIN}
# Generated by \`ts-harness agent install --client codex\`.
#
# Search-first flow:
# - TypeScript/JavaScript source reads are routed through ts-harness search packets.
# - Subagents should receive bounded search commands, not raw file inventories.
# - Pipe broad external candidates into \`ts-harness search ingest\`.
# - Run one search command at a time; do not chain denied-read recovery commands.

[[hooks.SessionStart]]
matcher = "startup|resume|clear|compact"

[[hooks.SessionStart.hooks]]
type = "command"
timeout = 5
statusMessage = "Loading ts-harness search protocol"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex session-start "$repo_root"
'''

[[hooks.UserPromptSubmit]]

[[hooks.UserPromptSubmit.hooks]]
type = "command"
timeout = 5
statusMessage = "Planning ts-harness search flow"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex user-prompt "$repo_root"
'''

[[hooks.PreToolUse]]
matcher = "Read|read_file|mcp__.*__read.*|Bash|exec_command|apply_patch|Edit|Write"

[[hooks.PreToolUse.hooks]]
type = "command"
timeout = 5
statusMessage = "Checking ts-harness search flow"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex pre-tool "$repo_root"
'''

[[hooks.PermissionRequest]]
matcher = "Read|read_file|mcp__.*__read.*|Bash|exec_command|apply_patch|Edit|Write"

[[hooks.PermissionRequest.hooks]]
type = "command"
timeout = 5
statusMessage = "Checking ts-harness approval flow"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex permission-request "$repo_root"
'''

[[hooks.PostToolUse]]
matcher = "Read|read_file|mcp__.*__read.*|Bash|exec_command|apply_patch|Edit|Write"

[[hooks.PostToolUse.hooks]]
type = "command"
timeout = 5
statusMessage = "Updating ts-harness search flow state"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex post-tool "$repo_root"
'''

[[hooks.SubagentStart]]
matcher = ".*"

[[hooks.SubagentStart.hooks]]
type = "command"
timeout = 5
statusMessage = "Preparing ts-harness subagent context"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex subagent-start "$repo_root"
'''

[[hooks.SubagentStop]]
matcher = ".*"

[[hooks.SubagentStop.hooks]]
type = "command"
timeout = 5
statusMessage = "Checking ts-harness subagent evidence"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex subagent-stop "$repo_root"
'''

[[hooks.Stop]]

[[hooks.Stop.hooks]]
type = "command"
timeout = 5
statusMessage = "Checking ts-harness changed files"
command = '''
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"
exec ts-harness agent hook --client codex stop "$repo_root"
'''
${CONFIG_END}
`;
}
