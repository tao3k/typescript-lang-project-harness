import fs from "node:fs";
import path from "node:path";

import type { PackageJsonWorkspaceFact, TypeScriptWorkspacePackageFact } from "../model.js";
import { parsePackageJsonDocument } from "./package_document.js";

const IGNORED_WORKSPACE_DIR_NAMES = new Set([".git", "dist", "node_modules"]);

export function workspacePackageFacts(
  projectRoot: string,
  workspaces: readonly PackageJsonWorkspaceFact[],
): TypeScriptWorkspacePackageFact[] {
  const factsByPath = new Map<string, TypeScriptWorkspacePackageFact>();
  for (const workspace of workspaces) {
    for (const packageRoot of workspacePackageRoots(projectRoot, workspace.pattern)) {
      const fact = workspacePackageFact(packageRoot, workspace);
      if (fact !== undefined && !factsByPath.has(fact.path)) {
        factsByPath.set(fact.path, fact);
      }
    }
  }
  return [...factsByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function workspacePackageRoots(projectRoot: string, pattern: string): string[] {
  if (pattern.startsWith("!") || path.isAbsolute(pattern)) {
    return [];
  }
  const segments = workspacePatternSegments(pattern);
  if (segments.length === 0) {
    return [];
  }
  return expandWorkspaceSegments([projectRoot], segments)
    .filter((candidate) => fs.existsSync(path.join(candidate, "package.json")))
    .sort();
}

function workspacePatternSegments(pattern: string): string[] {
  return pattern
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

function expandWorkspaceSegments(
  currentPaths: readonly string[],
  segments: readonly string[],
): string[] {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    return [...currentPaths];
  }
  const nextPaths = currentPaths.flatMap((currentPath) =>
    segment === "**"
      ? descendantDirectories(currentPath)
      : childDirectoriesMatching(currentPath, segment),
  );
  return expandWorkspaceSegments(nextPaths, rest);
}

function childDirectoriesMatching(parentPath: string, segment: string): string[] {
  if (!fs.existsSync(parentPath)) {
    return [];
  }
  if (!segment.includes("*")) {
    const childPath = path.join(parentPath, segment);
    return fs.existsSync(childPath) && fs.statSync(childPath).isDirectory() ? [childPath] : [];
  }
  return fs
    .readdirSync(parentPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && matchesWorkspaceSegment(entry.name, segment))
    .map((entry) => path.join(parentPath, entry.name));
}

function descendantDirectories(rootPath: string): string[] {
  if (!fs.existsSync(rootPath)) {
    return [];
  }
  const descendants: string[] = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORED_WORKSPACE_DIR_NAMES.has(entry.name)) {
      continue;
    }
    const childPath = path.join(rootPath, entry.name);
    descendants.push(childPath, ...descendantDirectories(childPath));
  }
  return descendants;
}

function matchesWorkspaceSegment(name: string, pattern: string): boolean {
  const parts = pattern.split("*");
  const firstPart = parts[0] ?? "";
  const lastPart = parts.at(-1) ?? "";
  if (!name.startsWith(firstPart) || !name.endsWith(lastPart)) {
    return false;
  }
  let searchIndex = firstPart.length;
  for (const part of parts.slice(1, -1)) {
    const foundIndex = name.indexOf(part, searchIndex);
    if (foundIndex < 0) {
      return false;
    }
    searchIndex = foundIndex + part.length;
  }
  return true;
}

function workspacePackageFact(
  packageRoot: string,
  workspace: PackageJsonWorkspaceFact,
): TypeScriptWorkspacePackageFact | undefined {
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }
  const configCandidate = path.join(packageRoot, "tsconfig.json");
  const configPath = fs.existsSync(configCandidate) ? configCandidate : undefined;
  const rawJson = fs.readFileSync(packageJsonPath, "utf8");
  const document = parsePackageJsonDocument(packageJsonPath, rawJson);
  const parsed = document.packageJson;
  const fact: TypeScriptWorkspacePackageFact = {
    path: packageRoot,
    packageJsonPath,
    pattern: workspace.pattern,
    location: workspace.location,
    diagnostics: document.diagnostics,
  };
  const withConfig = configPath === undefined ? fact : { ...fact, configPath };
  const withName =
    typeof parsed.name === "string" ? { ...withConfig, name: parsed.name } : withConfig;
  return typeof parsed.type === "string" ? { ...withName, packageType: parsed.type } : withName;
}
