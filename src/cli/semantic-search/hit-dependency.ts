/**
 * Dependency semantic-search match, hit, edge, and node helpers.
 */

import type {
  TypeScriptHarnessReport,
  TypeScriptModuleReport,
  TypeScriptNativeImportResolutionFact,
} from "../../model.js";
import { compareProjectPathsByRecency } from "./recency.js";
import type { SemanticSearchEdge, SemanticSearchHit, SemanticSearchNode } from "./types.js";
import { MAX_IMPORT_HITS } from "./types.js";
import { locationFromSource, ownerId, relPath } from "./utils.js";

export interface DependencyImportMatch {
  readonly moduleReport: TypeScriptModuleReport;
  readonly importFact: TypeScriptNativeImportResolutionFact;
  readonly packageRoot: string;
  readonly reason: string;
  readonly score: number;
}

export interface DependencyManifestMatch {
  readonly dependency: TypeScriptHarnessReport["reasoningTree"]["packageDependencies"][number];
  readonly packageRoot: string;
  readonly reason: string;
  readonly score: number;
}

export function dependencyManifestMatches(
  report: TypeScriptHarnessReport,
  query: string,
): readonly DependencyManifestMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return report.reasoningTree.packageDependencies
    .flatMap((dependency) => dependencyManifestMatch(dependency, needle))
    .sort((left, right) =>
      right.score - left.score !== 0
        ? right.score - left.score
        : `${left.dependency.source}:${left.dependency.name}`.localeCompare(
            `${right.dependency.source}:${right.dependency.name}`,
          ),
    );
}

export function dependencyManifestMatch(
  dependency: TypeScriptHarnessReport["reasoningTree"]["packageDependencies"][number],
  needle: string,
): readonly DependencyManifestMatch[] {
  const packageRoot = dependency.name;
  const normalizedRoot = packageRoot.toLowerCase();
  const queryRoot = packageRootFromSpecifier(needle) ?? needle;
  const reasonAndScore = dependencyMatchReasonAndScore(
    normalizedRoot,
    normalizedRoot,
    queryRoot,
    needle,
  );
  if (reasonAndScore === undefined) return [];
  return [
    {
      dependency,
      packageRoot,
      reason:
        reasonAndScore.reason === "package-root-exact"
          ? "manifest-package-exact"
          : "manifest-package",
      score: reasonAndScore.score + 2,
    },
  ];
}

export function dependencyImportMatches(
  report: TypeScriptHarnessReport,
  query: string,
): readonly DependencyImportMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return report.modules
    .flatMap((moduleReport) =>
      moduleReport.importResolutions.flatMap((importFact) =>
        dependencyImportMatch(moduleReport, importFact, needle),
      ),
    )
    .sort((left, right) =>
      right.score - left.score !== 0
        ? right.score - left.score
        : compareProjectPathsByRecency(
            report.reasoningTree.projectRoot,
            left.moduleReport.path,
            right.moduleReport.path,
          ),
    )
    .slice(0, MAX_IMPORT_HITS);
}

export function dependencyImportMatch(
  moduleReport: TypeScriptModuleReport,
  importFact: TypeScriptNativeImportResolutionFact,
  needle: string,
): readonly DependencyImportMatch[] {
  if (!isDependencyImport(importFact)) return [];
  const packageRoot = packageRootFromSpecifier(importFact.moduleSpecifier);
  if (packageRoot === undefined) return [];
  const normalizedRoot = packageRoot.toLowerCase();
  const normalizedSpecifier = importFact.moduleSpecifier.toLowerCase();
  const queryRoot = packageRootFromSpecifier(needle) ?? needle;
  const reasonAndScore = dependencyMatchReasonAndScore(
    normalizedRoot,
    normalizedSpecifier,
    queryRoot,
    needle,
  );
  if (reasonAndScore === undefined) return [];
  return [
    {
      moduleReport,
      importFact,
      packageRoot,
      reason: reasonAndScore.reason,
      score: reasonAndScore.score,
    },
  ];
}

export function dependencyMatchReasonAndScore(
  packageRoot: string,
  moduleSpecifier: string,
  queryRoot: string,
  query: string,
): { readonly reason: string; readonly score: number } | undefined {
  if (packageRoot === queryRoot) {
    return { reason: "package-root-exact", score: 8 };
  }
  if (moduleSpecifier === query) {
    return { reason: "module-specifier-exact", score: 7 };
  }
  if (moduleSpecifier.startsWith(`${query}/`) || moduleSpecifier.includes(query)) {
    return { reason: "module-specifier", score: 4 };
  }
  return undefined;
}

export function isDependencyImport(importFact: TypeScriptNativeImportResolutionFact): boolean {
  return (
    importFact.resolution === "external" &&
    packageRootFromSpecifier(importFact.moduleSpecifier) !== undefined
  );
}

export function dependencyHit(
  report: TypeScriptHarnessReport,
  match: DependencyImportMatch,
): SemanticSearchHit {
  const ownerPath = relPath(report, match.moduleReport.path);
  return {
    kind: "dependency",
    ownerPath,
    location: locationFromSource(report, match.importFact.location),
    score: match.score,
    reason: match.reason,
    fields: {
      moduleSpecifier: match.importFact.moduleSpecifier,
      packageRoot: match.packageRoot,
      importKind: match.importFact.kind,
      typeOnly: match.importFact.isTypeOnly,
      resolution: match.importFact.resolution,
    },
  };
}

export function dependencyManifestHit(
  report: TypeScriptHarnessReport,
  match: DependencyManifestMatch,
): SemanticSearchHit {
  return {
    kind: "dependency",
    ownerPath: ".",
    location: locationFromSource(report, match.dependency.location),
    score: match.score,
    reason: match.reason,
    fields: {
      packageRoot: match.packageRoot,
      source: match.dependency.source,
      versionRange: match.dependency.versionRange,
    },
  };
}

export function dependencyEdge(
  report: TypeScriptHarnessReport,
  match: DependencyImportMatch,
): SemanticSearchEdge {
  const ownerPath = relPath(report, match.moduleReport.path);
  return {
    from: ownerId(ownerPath),
    kind: "dependency",
    to: `C:${match.packageRoot}`,
    label: match.importFact.moduleSpecifier,
    location: locationFromSource(report, match.importFact.location),
    fields: {
      moduleSpecifier: match.importFact.moduleSpecifier,
      packageRoot: match.packageRoot,
      importKind: match.importFact.kind,
      typeOnly: match.importFact.isTypeOnly,
      resolution: match.importFact.resolution,
    },
  };
}

export function dependencyNodesForMatches(
  matches: readonly DependencyImportMatch[],
  manifestMatches: readonly DependencyManifestMatch[],
  query: string,
): readonly SemanticSearchNode[] {
  const counts = new Map<string, number>();
  const sources = new Map<string, Set<string>>();
  const versionRanges = new Map<string, Set<string>>();
  for (const match of manifestMatches) {
    counts.set(match.packageRoot, (counts.get(match.packageRoot) ?? 0) + 1);
    const sourceSet = sources.get(match.packageRoot) ?? new Set<string>();
    sourceSet.add(match.dependency.source);
    sources.set(match.packageRoot, sourceSet);
    const versionSet = versionRanges.get(match.packageRoot) ?? new Set<string>();
    versionSet.add(match.dependency.versionRange);
    versionRanges.set(match.packageRoot, versionSet);
  }
  for (const match of matches) {
    counts.set(match.packageRoot, (counts.get(match.packageRoot) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([packageRoot, usage]) => ({
      id: `C:${packageRoot}`,
      kind: "dependency" as const,
      fields: {
        import: packageRoot,
        usage,
        sources: [...(sources.get(packageRoot) ?? new Set<string>())].sort(),
        versions: [...(versionRanges.get(packageRoot) ?? new Set<string>())].sort(),
        ...(query.trim() === "" ? {} : { query }),
      },
    }));
}

export function dependencyPackageRoots(
  matches: readonly DependencyImportMatch[],
  manifestMatches: readonly DependencyManifestMatch[] = [],
): readonly string[] {
  return [
    ...new Set([
      ...matches.map((match) => match.packageRoot),
      ...manifestMatches.map((match) => match.packageRoot),
    ]),
  ].sort();
}

export function packageRootFromSpecifier(moduleSpecifier: string): string | undefined {
  const specifier = moduleSpecifier.trim();
  if (
    specifier === "" ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#")
  ) {
    return undefined;
  }
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    const scope = parts[0];
    const name = parts[1];
    return scope !== undefined && name !== undefined ? `${scope}/${name}` : undefined;
  }
  return parts[0];
}
