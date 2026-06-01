/**
 * Codex agent hook bridge for the ts-harness CLI.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_LANGUAGE_ID,
  TYPE_SCRIPT_PROVIDER_ID,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
} from "./semantic-language.js";

export type AgentHookEvent =
  | "session-start"
  | "user-prompt"
  | "pre-tool"
  | "permission-request"
  | "post-tool"
  | "subagent-start"
  | "subagent-stop"
  | "stop";

const PROFILE_REGISTRY_SCHEMA_ID = "agent.semantic-protocols.semantic-agent-hook-profile-registry";
const PROFILE_REGISTRY_SCHEMA_VERSION = "1";
const HOOK_PROTOCOL_ID = "agent.semantic-protocols.agent-hooks";
const HOOK_PROTOCOL_VERSION = "1";

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
  const profilesPath = writeTypeScriptHookProfileRegistry(projectRoot);
  return runSemanticAgentHook(
    ["install", "--client", "codex", "--profiles", profilesPath, projectRoot],
    {
      cwd: projectRoot,
    },
  );
}

export function runCodexAgentHook(
  event: AgentHookEvent,
  projectRoot: string,
  stdin: string,
): string {
  const profilesPath = ensureTypeScriptHookProfileRegistry(projectRoot);
  return runSemanticAgentHook(["hook", "--client", "codex", event, "--profiles", profilesPath], {
    cwd: projectRoot,
    stdin,
  });
}

export function renderCodexAgentGuide(projectRoot: string): string {
  return `${commandGuide({
    ownerTarget: "<owner-path>",
    projectRoot,
  })}\n`;
}

function ensureTypeScriptHookProfileRegistry(projectRoot: string): string {
  const profilesPath = typeScriptHookProfileRegistryPath(projectRoot);
  if (fs.existsSync(profilesPath)) return profilesPath;
  return writeTypeScriptHookProfileRegistry(projectRoot);
}

function writeTypeScriptHookProfileRegistry(projectRoot: string): string {
  const profilesPath = typeScriptHookProfileRegistryPath(projectRoot);
  fs.mkdirSync(path.dirname(profilesPath), { recursive: true });
  fs.writeFileSync(
    profilesPath,
    `${JSON.stringify(typeScriptHookProfileRegistry(), null, 2)}\n`,
    "utf8",
  );
  return profilesPath;
}

function typeScriptHookProfileRegistry(): Record<string, unknown> {
  return {
    schemaId: PROFILE_REGISTRY_SCHEMA_ID,
    schemaVersion: PROFILE_REGISTRY_SCHEMA_VERSION,
    protocolId: HOOK_PROTOCOL_ID,
    protocolVersion: HOOK_PROTOCOL_VERSION,
    projectRoot: ".",
    profiles: [
      {
        languageId: TYPE_SCRIPT_LANGUAGE_ID,
        providerId: TYPE_SCRIPT_PROVIDER_ID,
        binary: TYPE_SCRIPT_BINARY,
        namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
        sourceExtensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
        configFiles: ["package.json", "tsconfig.json", "tsconfig.base.json"],
        sourceRoots: ["src", "test", "tests", "__tests__", "packages", "apps", "lib"],
        ignoredPathPrefixes: ["node_modules", "dist", "build", "coverage", ".git"],
        policy: {
          blockDirectRead: true,
          blockBroadRawSearch: true,
          blockAgentSearchJson: true,
          requirePrimeBeforeEdit: true,
        },
        commands: {
          prime: { argv: [TYPE_SCRIPT_BINARY, "search", "prime", "."] },
          owner: { argv: [TYPE_SCRIPT_BINARY, "search", "owner", "{path}", "."] },
          text: {
            argv: [
              TYPE_SCRIPT_BINARY,
              "search",
              "text",
              "{query}",
              "owner",
              "tests",
              "--view",
              "seeds",
              ".",
            ],
          },
          ingest: {
            argv: [
              TYPE_SCRIPT_BINARY,
              "search",
              "ingest",
              "owner",
              "tests",
              "--view",
              "seeds",
              ".",
            ],
            stdinMode: "pipe-candidates",
          },
          checkChanged: { argv: [TYPE_SCRIPT_BINARY, "check", "--changed", "."] },
        },
      },
    ],
  };
}

function typeScriptHookProfileRegistryPath(projectRoot: string): string {
  return path.join(projectRoot, ".codex", "semantic-agent-hook", "profiles.ts-harness.json");
}

function runSemanticAgentHook(
  args: readonly string[],
  options: { readonly cwd: string; readonly stdin?: string },
): string {
  try {
    return execFileSync(semanticAgentHookBinary(options.cwd), args, {
      cwd: options.cwd,
      encoding: "utf8",
      input: options.stdin ?? "",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(semanticAgentHookErrorMessage(error));
  }
}

function semanticAgentHookBinary(projectRoot: string): string {
  const localBinary = path.join(
    projectRoot,
    ".codex",
    "semantic-agent-hook",
    "bin",
    "semantic-agent-hook",
  );
  return fs.existsSync(localBinary) ? localBinary : "semantic-agent-hook";
}

function semanticAgentHookErrorMessage(error: unknown): string {
  if (isNodeError(error) && error.code === "ENOENT") {
    return "semantic-agent-hook binary is required for Codex hook install/runtime";
  }
  if (isExecFileError(error)) {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const detail = stderr === "" ? String(error.message) : stderr;
    return `semantic-agent-hook failed: ${detail}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isExecFileError(error: unknown): error is Error & {
  readonly stderr?: string;
  readonly stdout?: string;
  readonly status?: number;
} {
  return error instanceof Error && ("stderr" in error || "status" in error);
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
    "|rule agent hooks are dispatched by semantic-agent-hook; ts-harness only publishes the TypeScript profile",
    "|rule use installed ts-harness binary; run one command at a time; no raw TS/JS source reads",
    "|subagent give one |cmd or |pipe line; require evidence/missing/next/risk",
  ].join("\n");
}
