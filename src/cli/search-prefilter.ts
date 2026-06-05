/**
 * Filesystem-backed candidate pruning for large semantic search scopes.
 *
 * fd/rg only select parser input files. The TypeScript parser still owns the
 * owners, exports, API facts, imports, and packet evidence derived later.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  DEFAULT_IGNORED_DIR_NAMES,
  discoverTypeScriptFiles,
  isTypeScriptSourcePath,
} from "../parser.js";
import type { SemanticSearchRuntimeCost } from "./semantic-search/types.js";

const TYPE_SCRIPT_EXTENSIONS = ["ts", "tsx", "mts", "cts"] as const;
const MIN_PREFILTER_FILES = 128;
const MAX_PREFILTER_FILES_PER_TERM = 16;
const MAX_PREFILTER_FILES_TOTAL = 48;

export interface TypeScriptSearchPrefilterResult {
  readonly fileNames: readonly string[];
  readonly totalFiles: number;
  readonly termCappedFiles: number;
  readonly matchedFiles: number;
  readonly elapsedMs: number;
  readonly tool: string;
  readonly reason: string;
}

export function typeScriptSearchScopeFileNames(
  scopePaths: readonly string[],
  ignoredDirNames: readonly string[] = DEFAULT_IGNORED_DIR_NAMES,
  includeHiddenDirNames: readonly string[] = [],
): readonly string[] {
  if (scopePaths.length === 0) return [];
  return discoverTypeScriptFiles(scopePaths, ignoredDirNames, includeHiddenDirNames);
}

export function prefilterTypeScriptSearchPaths(
  projectRoot: string,
  queryTerms: readonly string[],
  options: {
    readonly scopePaths?: readonly string[];
    readonly ignoredDirNames?: readonly string[];
    readonly includeHiddenDirNames?: readonly string[];
    readonly ownerPath?: string;
  } = {},
): TypeScriptSearchPrefilterResult | undefined {
  const terms = normalizedTerms(queryTerms);
  const rg = commandPath("rg");
  if (rg === undefined || terms.length === 0) return undefined;

  const ignoredDirNames = options.ignoredDirNames ?? DEFAULT_IGNORED_DIR_NAMES;
  const includeHiddenDirNames = options.includeHiddenDirNames ?? [];
  const started = performance.now();
  const scopePaths = options.scopePaths ?? [];
  const allFiles = listTypeScriptFiles(
    projectRoot,
    scopePaths,
    ignoredDirNames,
    includeHiddenDirNames,
  );
  if (allFiles.length <= MIN_PREFILTER_FILES) return undefined;

  const termCapped = termCappedMatches(
    projectRoot,
    rg,
    allFiles,
    terms,
    ignoredDirNames,
    scopePaths,
  );
  const selected = selectedSearchPaths(projectRoot, termCapped, terms, options.ownerPath);
  const elapsedMs = Math.round(performance.now() - started);
  return {
    fileNames: selected,
    totalFiles: allFiles.length,
    termCappedFiles: new Set(termCapped).size,
    matchedFiles: selected.length,
    elapsedMs,
    tool: commandPath("fd") === undefined ? "rg" : "fd+rg",
    reason: "rg/fd prefilter selected parser input files for search query",
  };
}

export function runtimeCostForTypeScriptPrefilter(
  result: TypeScriptSearchPrefilterResult,
  elapsedMs: number,
  sourceFilesParsed: number,
): SemanticSearchRuntimeCost {
  return {
    cacheStatus: "disabled",
    elapsedMs,
    sourceFilesParsed,
    reason: result.reason,
    fields: {
      prefilterTool: result.tool,
      candidateFiles: result.totalFiles,
      minCandidateFiles: MIN_PREFILTER_FILES,
      termCappedFiles: result.termCappedFiles,
      matchedFiles: result.matchedFiles,
      maxFilesPerTerm: MAX_PREFILTER_FILES_PER_TERM,
      maxFilesTotal: MAX_PREFILTER_FILES_TOTAL,
      mode: "search-query-prefilter",
    },
  };
}

function listTypeScriptFiles(
  projectRoot: string,
  scopePaths: readonly string[],
  ignoredDirNames: readonly string[],
  includeHiddenDirNames: readonly string[],
): readonly string[] {
  const resolvedScopes =
    scopePaths.length === 0
      ? [projectRoot]
      : scopePaths.map((scopePath) => path.resolve(scopePath));
  const directFiles = resolvedScopes.filter((scopePath) => {
    try {
      return fs.statSync(scopePath).isFile() && isTypeScriptSourcePath(scopePath);
    } catch {
      return false;
    }
  });
  const dirScopes = resolvedScopes.filter((scopePath) => {
    try {
      return fs.statSync(scopePath).isDirectory();
    } catch {
      return false;
    }
  });
  if (dirScopes.length === 0 && directFiles.length > 0) return sortedUnique(directFiles);
  const fd = commandPath("fd");
  const fdFiles =
    fd === undefined
      ? []
      : pathsFromOutput(
          projectRoot,
          runCommand(
            fd,
            [
              "--color",
              "never",
              "-t",
              "f",
              ...TYPE_SCRIPT_EXTENSIONS.flatMap((extension) => ["-e", extension]),
              ...fdExcludeArgs(ignoredDirNames),
              ".",
              ...commandScopeArgs(projectRoot, dirScopes),
            ],
            projectRoot,
          ).stdout,
        );
  const discovered =
    fdFiles.length > 0 || dirScopes.length === 0
      ? fdFiles
      : discoverTypeScriptFiles(dirScopes, ignoredDirNames, includeHiddenDirNames);
  return sortedUnique([...directFiles, ...discovered]);
}

function termCappedMatches(
  projectRoot: string,
  rg: string,
  allFiles: readonly string[],
  terms: readonly string[],
  ignoredDirNames: readonly string[],
  scopePaths: readonly string[],
): readonly string[] {
  const matched: string[] = [];
  for (const term of terms) {
    const sourceScores = sourceMatchScores(projectRoot, rg, term, ignoredDirNames, scopePaths);
    const termMatches = rankedTermMatches(projectRoot, term, allFiles, sourceScores);
    matched.push(
      ...termMatches.slice(0, MAX_PREFILTER_FILES_PER_TERM).map(([fileName]) => fileName),
    );
  }
  return matched;
}

function sourceMatchScores(
  projectRoot: string,
  rg: string,
  term: string,
  ignoredDirNames: readonly string[],
  scopePaths: readonly string[],
): ReadonlyMap<string, number> {
  const process = runCommand(
    rg,
    [
      "--color",
      "never",
      "-i",
      "-F",
      "-n",
      "--max-count",
      "50",
      ...TYPE_SCRIPT_EXTENSIONS.flatMap((extension) => ["--glob", `*.${extension}`]),
      ...rgExcludeArgs(ignoredDirNames),
      "-e",
      term,
      ...commandScopeArgs(projectRoot, scopePaths),
    ],
    projectRoot,
  );
  if (process.status !== 0 && process.status !== 1) return new Map();

  const scores = new Map<string, number>();
  for (const line of process.stdout.split("\n")) {
    const [rawPath, sourceLine] = splitRgLine(line);
    if (rawPath === undefined) continue;
    const resolved = path.resolve(projectRoot, rawPath);
    if (!isTypeScriptSourcePath(resolved)) continue;
    const score = sourceLineScore(sourceLine, term);
    scores.set(resolved, Math.min(scores.get(resolved) ?? score, score));
  }
  return scores;
}

function rankedTermMatches(
  projectRoot: string,
  term: string,
  allFiles: readonly string[],
  sourceScores: ReadonlyMap<string, number>,
): readonly (readonly [string, number])[] {
  const scores = new Map<string, number>();
  const allowedFiles = new Set(allFiles);
  for (const fileName of allFiles) {
    if (relativePath(projectRoot, fileName).toLowerCase().includes(term.toLowerCase())) {
      scores.set(fileName, 1);
    }
  }
  for (const [fileName, score] of sourceScores) {
    if (!allowedFiles.has(fileName)) continue;
    scores.set(fileName, Math.min(scores.get(fileName) ?? score, score));
  }
  return [...scores.entries()].sort(
    (left, right) =>
      left[1] - right[1] ||
      comparePathRank(
        pathRank(projectRoot, left[0], [term]),
        pathRank(projectRoot, right[0], [term]),
      ),
  );
}

function rankedCappedMatches(
  projectRoot: string,
  paths: readonly string[],
  terms: readonly string[],
): readonly string[] {
  return [...sortedUnique(paths)]
    .sort((left, right) =>
      comparePathRank(pathRank(projectRoot, left, terms), pathRank(projectRoot, right, terms)),
    )
    .slice(0, MAX_PREFILTER_FILES_TOTAL);
}

function selectedSearchPaths(
  projectRoot: string,
  termCapped: readonly string[],
  terms: readonly string[],
  ownerPath: string | undefined,
): readonly string[] {
  const selected = rankedCappedMatches(projectRoot, termCapped, terms);
  if (ownerPath !== undefined) {
    const ownerCandidate = path.resolve(projectRoot, ownerPath);
    if (
      fs.existsSync(ownerCandidate) &&
      fs.statSync(ownerCandidate).isFile() &&
      isTypeScriptSourcePath(ownerCandidate)
    ) {
      return [...new Set([...selected, ownerCandidate])].sort((left, right) =>
        comparePathRank(pathRank(projectRoot, left, terms), pathRank(projectRoot, right, terms)),
      );
    }
  }
  return selected;
}

function pathRank(
  projectRoot: string,
  fileName: string,
  terms: readonly string[],
): readonly [number, number, number, number, string] {
  const relative = relativePath(projectRoot, fileName);
  const folded = relative.toLowerCase();
  const foldedTerms = terms.map((term) => term.toLowerCase());
  return [
    isTestPath(relative) ? 1 : 0,
    foldedTerms.some((term) => folded.includes(term)) ? 0 : 1,
    relative.split("/").length,
    relative.length,
    relative,
  ];
}

function comparePathRank(
  left: readonly [number, number, number, number, string],
  right: readonly [number, number, number, number, string],
): number {
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    left[2] - right[2] ||
    left[3] - right[3] ||
    left[4].localeCompare(right[4])
  );
}

function commandScopeArgs(projectRoot: string, scopePaths: readonly string[]): readonly string[] {
  if (scopePaths.length === 0) return ["."];
  return scopePaths.map((scopePath) => relativePath(projectRoot, scopePath));
}

function pathsFromOutput(projectRoot: string, stdout: string): readonly string[] {
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    const resolved = path.resolve(projectRoot, line);
    if (fs.existsSync(resolved) && isTypeScriptSourcePath(resolved)) {
      paths.push(resolved);
    }
  }
  return sortedUnique(paths);
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): { readonly status: number | null; readonly stdout: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

function commandPath(command: string): string | undefined {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  const resolved = result.stdout.trim();
  return result.status === 0 && resolved !== "" ? resolved : undefined;
}

function fdExcludeArgs(ignoredDirNames: readonly string[]): readonly string[] {
  return [...ignoredDirNames].sort().flatMap((name) => ["-E", name]);
}

function rgExcludeArgs(ignoredDirNames: readonly string[]): readonly string[] {
  return [...ignoredDirNames].sort().flatMap((name) => ["--glob", `!${name}/**`]);
}

function splitRgLine(line: string): readonly [string | undefined, string] {
  const first = line.indexOf(":");
  if (first === -1) return [undefined, ""];
  const second = line.indexOf(":", first + 1);
  if (second === -1) return [undefined, ""];
  return [line.slice(0, first), line.slice(second + 1)];
}

function sourceLineScore(sourceLine: string, term: string): number {
  const escaped = escapeRegExp(term);
  if (
    new RegExp(
      String.raw`^\s*export\s+(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+${escaped}\b`,
      "iu",
    ).test(sourceLine) ||
    new RegExp(
      String.raw`^\s*(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+${escaped}\b`,
      "iu",
    ).test(sourceLine)
  ) {
    return 0;
  }
  if (new RegExp(String.raw`\b${escaped}\s*\(`, "iu").test(sourceLine)) return 1;
  if (/\bexport\b/iu.test(sourceLine)) return 2;
  return 3;
}

function normalizedTerms(queryTerms: readonly string[]): readonly string[] {
  const terms: string[] = [];
  for (const rawTerm of queryTerms) {
    const term = rawTerm.trim();
    if (term !== "" && !terms.includes(term)) terms.push(term);
  }
  return terms;
}

function sortedUnique(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.map((fileName) => path.resolve(fileName)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function relativePath(projectRoot: string, fileName: string): string {
  return path.relative(projectRoot, fileName).replaceAll("\\", "/") || ".";
}

function isTestPath(relative: string): boolean {
  return (
    relative === "test" ||
    relative === "tests" ||
    relative.startsWith("test/") ||
    relative.startsWith("tests/") ||
    relative.includes("/test/") ||
    relative.includes("/tests/") ||
    relative.endsWith(".test.ts") ||
    relative.endsWith(".spec.ts") ||
    relative.endsWith(".test.tsx") ||
    relative.endsWith(".spec.tsx")
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
