/**
 * Version-aware dependency API usage helpers for the deps search view.
 */

import fs from "node:fs";
import path from "node:path";

import type { TypeScriptHarnessReport } from "../../model.js";
import type { SemanticSearchFields, SemanticSearchHit, SemanticSearchNode } from "./types.js";
import {
  type DependencyImportMatch,
  type DependencyManifestMatch,
  dependencyHit,
  dependencyManifestHit,
  packageRootFromSpecifier,
} from "./hits.js";

export interface DependencyApiQuery {
  readonly raw: string;
  readonly dependency: string;
  readonly packageRoot: string;
  readonly moduleSpecifier: string;
  readonly requestedVersion?: string;
  readonly apiQuery?: string;
}

export interface DependencyWorkspaceVersion {
  readonly currentWorkspaceVersion?: string;
  readonly workspaceVersionSource?: "package-lock" | "package-json";
}

export type DependencyVersionScope = "current" | "external" | "unknown";

export function parseDependencyApiQuery(query: string): DependencyApiQuery | undefined {
  const trimmed = query.trim();
  if (trimmed === "") return undefined;
  const [dependencyInput = "", apiInput] = trimmed.split("::", 2);
  const { dependency, requestedVersion } = splitDependencyVersion(dependencyInput.trim());
  const packageRoot = packageRootFromSpecifier(dependency);
  if (packageRoot === undefined) return undefined;
  return {
    raw: trimmed,
    dependency,
    packageRoot,
    moduleSpecifier: dependency,
    ...(requestedVersion === undefined ? {} : { requestedVersion }),
    ...(apiInput === undefined || apiInput.trim() === "" ? {} : { apiQuery: apiInput.trim() }),
  };
}

export function dependencyApiUsageMatches(
  report: TypeScriptHarnessReport,
  query: DependencyApiQuery,
  matches: readonly DependencyImportMatch[],
): readonly DependencyImportMatch[] {
  const moduleNeedle = query.moduleSpecifier.toLowerCase();
  const apiNeedle = query.apiQuery?.toLowerCase();
  return matches.filter((match) => {
    if (match.packageRoot !== query.packageRoot) return false;
    const moduleSpecifier = match.importFact.moduleSpecifier.toLowerCase();
    if (moduleNeedle !== query.packageRoot && !moduleSpecifier.includes(moduleNeedle)) {
      return false;
    }
    if (apiNeedle === undefined) return true;
    return (
      moduleSpecifier.includes(apiNeedle) ||
      (sourceLineForMatch(match)?.toLowerCase().includes(apiNeedle) ?? false)
    );
  });
}

export function dependencyWorkspaceVersion(
  report: TypeScriptHarnessReport,
  packageRoot: string,
  manifestMatches: readonly DependencyManifestMatch[] = [],
): DependencyWorkspaceVersion {
  const packageLockPath = path.join(report.reasoningTree.projectRoot, "package-lock.json");
  if (fs.existsSync(packageLockPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packageLockPath, "utf8")) as unknown;
      const packageLockVersion = packageLockResolvedVersion(parsed, packageRoot);
      if (packageLockVersion !== undefined) {
        return {
          currentWorkspaceVersion: packageLockVersion,
          workspaceVersionSource: "package-lock",
        };
      }
    } catch {
      return {};
    }
  }
  return manifestExactResolvedVersion(manifestMatches);
}

export function dependencyVersionStatus(
  query: DependencyApiQuery,
  manifestMatches: readonly DependencyManifestMatch[],
  workspaceVersion: DependencyWorkspaceVersion,
): string {
  if (workspaceVersion.currentWorkspaceVersion !== undefined) {
    if (query.requestedVersion === undefined) return "locked";
    return query.requestedVersion === workspaceVersion.currentWorkspaceVersion
      ? "matched"
      : "external-version";
  }
  if (query.requestedVersion !== undefined) {
    return "requested-unresolved";
  }
  return manifestMatches.length > 0 ? "range-only" : "unknown";
}

export function dependencyVersionScope(versionStatus: string): DependencyVersionScope {
  switch (versionStatus) {
    case "locked":
    case "matched":
    case "range-only":
      return "current";
    case "external-version":
    case "requested-unresolved":
      return "external";
    default:
      return "unknown";
  }
}

export function dependencyApiNode(
  query: DependencyApiQuery,
  manifestMatches: readonly DependencyManifestMatch[],
  matches: readonly DependencyImportMatch[],
  workspaceVersion: DependencyWorkspaceVersion,
  versionStatus: string,
  versionScope: DependencyVersionScope,
): SemanticSearchNode {
  const sources = [...new Set(manifestMatches.map((match) => match.dependency.source))].sort();
  const versionRanges = [
    ...new Set(manifestMatches.map((match) => match.dependency.versionRange)),
  ].sort();
  return {
    id: `C:${query.packageRoot}`,
    kind: "dependency",
    fields: {
      dependency: query.packageRoot,
      import: query.packageRoot,
      usage: matches.length,
      sources,
      versionRanges,
      versionStatus,
      versionScope,
      ...(query.requestedVersion === undefined ? {} : { requestedVersion: query.requestedVersion }),
      ...(workspaceVersion.currentWorkspaceVersion === undefined
        ? {}
        : { currentWorkspaceVersion: workspaceVersion.currentWorkspaceVersion }),
      ...(workspaceVersion.workspaceVersionSource === undefined
        ? {}
        : { workspaceVersionSource: workspaceVersion.workspaceVersionSource }),
      ...(query.apiQuery === undefined ? {} : { apiQuery: query.apiQuery }),
    },
  };
}

export function dependencyApiHit(
  report: TypeScriptHarnessReport,
  match: DependencyImportMatch,
  query: DependencyApiQuery,
  workspaceVersion: DependencyWorkspaceVersion,
  versionStatus: string,
  versionScope: DependencyVersionScope,
): SemanticSearchHit {
  const hit = dependencyHit(report, match);
  const sourceLine = sourceLineForMatch(match);
  return {
    ...hit,
    reason: query.apiQuery === undefined ? hit.reason : `api-${hit.reason}`,
    ...(sourceLine === undefined ? {} : { snippet: sourceLine.trim() }),
    fields: {
      ...(hit.fields ?? {}),
      ...dependencyApiVersionFields(query, workspaceVersion, versionStatus, versionScope),
      ...(sourceLine === undefined ? {} : { sourceLine: sourceLine.trim() }),
    },
  };
}

export function dependencyApiManifestHit(
  report: TypeScriptHarnessReport,
  match: DependencyManifestMatch,
  query: DependencyApiQuery,
  workspaceVersion: DependencyWorkspaceVersion,
  versionStatus: string,
  versionScope: DependencyVersionScope,
): SemanticSearchHit {
  const hit = dependencyManifestHit(report, match);
  return {
    ...hit,
    fields: {
      ...(hit.fields ?? {}),
      ...dependencyApiVersionFields(query, workspaceVersion, versionStatus, versionScope),
    },
  };
}

function dependencyApiVersionFields(
  query: DependencyApiQuery,
  workspaceVersion: DependencyWorkspaceVersion,
  versionStatus: string,
  versionScope: DependencyVersionScope,
): SemanticSearchFields {
  return {
    dependency: query.packageRoot,
    versionStatus,
    versionScope,
    ...(query.requestedVersion === undefined ? {} : { requestedVersion: query.requestedVersion }),
    ...(workspaceVersion.currentWorkspaceVersion === undefined
      ? {}
      : { currentWorkspaceVersion: workspaceVersion.currentWorkspaceVersion }),
    ...(workspaceVersion.workspaceVersionSource === undefined
      ? {}
      : { workspaceVersionSource: workspaceVersion.workspaceVersionSource }),
    ...(query.apiQuery === undefined ? {} : { apiQuery: query.apiQuery }),
  };
}

function splitDependencyVersion(value: string): {
  readonly dependency: string;
  readonly requestedVersion?: string;
} {
  const separator = value.lastIndexOf("@");
  if (separator <= 0) {
    return { dependency: value };
  }
  const requestedVersion = value.slice(separator + 1);
  if (requestedVersion === "" || requestedVersion.includes("/")) {
    return { dependency: value };
  }
  return { dependency: value.slice(0, separator), requestedVersion };
}

function packageLockResolvedVersion(parsed: unknown, packageRoot: string): string | undefined {
  if (!isRecord(parsed)) return undefined;
  const packages = parsed.packages;
  if (isRecord(packages)) {
    const nodeModule = packages[`node_modules/${packageRoot}`];
    if (isRecord(nodeModule) && typeof nodeModule.version === "string") {
      return nodeModule.version;
    }
  }
  const dependencies = parsed.dependencies;
  if (isRecord(dependencies)) {
    const dependency = dependencies[packageRoot];
    if (isRecord(dependency) && typeof dependency.version === "string") {
      return dependency.version;
    }
  }
  return undefined;
}

function manifestExactResolvedVersion(
  manifestMatches: readonly DependencyManifestMatch[],
): DependencyWorkspaceVersion {
  const exactVersions = [
    ...new Set(
      manifestMatches
        .map((match) => match.dependency.versionRange)
        .filter((versionRange) => exactSemver(versionRange)),
    ),
  ];
  return exactVersions.length === 1
    ? {
        currentWorkspaceVersion: exactVersions[0]!,
        workspaceVersionSource: "package-json",
      }
    : {};
}

function exactSemver(versionRange: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(versionRange);
}

function sourceLineForMatch(match: DependencyImportMatch): string | undefined {
  try {
    return fs.readFileSync(match.moduleReport.path, "utf8").split(/\r\n|\r|\n/u)[
      match.importFact.location.line - 1
    ];
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
