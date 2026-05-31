/**
 * Semantic-search hit builders for text, symbol, import, dependency, and tests views.
 */

import path from "node:path";

import type {
  TypeScriptExportFact,
  TypeScriptHarnessReport,
  TypeScriptModuleReport,
  TypeScriptNativeImportResolutionFact,
  TypeScriptReasoningOwnerBranchFact,
  TypeScriptReasoningOwnerDependencyFact,
} from "../../model.js";
import type {
  SemanticSearchEdge,
  SemanticSearchHit,
  SemanticSearchNode,
  SemanticSearchOwner,
} from "./types.js";
import { MAX_IMPORT_HITS, MAX_SYMBOL_HITS, MAX_TEXT_HITS } from "./types.js";
import { edgeFact, ownerFact } from "./facts.js";
import {
  locationFromSource,
  ownerId,
  relPath,
  slashPath,
  stripNodePrefix,
  testId,
} from "./utils.js";

export function textHits(
  report: TypeScriptHarnessReport,
  query: string,
): readonly SemanticSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const hits: SemanticSearchHit[] = [];
  for (const branch of report.reasoningTree.ownerBranches) {
    const rel = relPath(report, branch.path);
    const pathMatch = rel.toLowerCase().includes(needle);
    const exportMatches = branch.exportNames.filter((name) => name.toLowerCase().includes(needle));
    if (!pathMatch && exportMatches.length === 0) continue;
    hits.push({
      kind: exportMatches.length > 0 ? "export" : "path",
      ownerPath: rel,
      ...(exportMatches[0] ? { symbol: exportMatches[0] } : {}),
      location: { path: rel },
      score: exportMatches.length * 3 + (pathMatch ? 2 : 0),
      reason: exportMatches.length > 0 ? "export-name" : "path",
      fields: { matches: exportMatches.slice(0, 6) },
    });
  }
  return hits.sort((left, right) => right.score - left.score).slice(0, MAX_TEXT_HITS);
}

export function symbolHits(
  report: TypeScriptHarnessReport,
  query: string,
): readonly SemanticSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return report.modules
    .flatMap((moduleReport) =>
      moduleReport.exports.flatMap((exportFact) =>
        symbolHit(report, moduleReport, exportFact, needle),
      ),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_SYMBOL_HITS);
}

export function symbolHit(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  exportFact: TypeScriptExportFact,
  needle: string,
): readonly SemanticSearchHit[] {
  const lowerName = exportFact.name.toLowerCase();
  if (!lowerName.includes(needle)) return [];
  const exact = lowerName === needle;
  return [
    {
      kind: "symbol",
      ownerPath: relPath(report, moduleReport.path),
      symbol: exportFact.name,
      location: locationFromSource(report, exportFact.location),
      score: exact ? 10 : 5,
      reason: exact ? "export-name-exact" : "export-name",
      fields: {
        exportKind: exportFact.kind,
        typeOnly: exportFact.isTypeOnly,
      },
    },
  ];
}

export function callsiteHits(
  report: TypeScriptHarnessReport,
  query: string,
  definitionHits: readonly SemanticSearchHit[],
): readonly SemanticSearchHit[] {
  if (query.trim() === "" || definitionHits.length === 0) return [];
  const definitionPaths = new Set(
    definitionHits.map((hit) => path.resolve(report.reasoningTree.projectRoot, hit.ownerPath)),
  );
  return report.modules
    .flatMap((moduleReport) =>
      moduleReport.importResolutions.flatMap((importFact) =>
        callsiteHit(report, moduleReport, importFact, definitionPaths, query),
      ),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_TEXT_HITS);
}

export function callsiteHit(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptModuleReport,
  importFact: TypeScriptNativeImportResolutionFact,
  definitionPaths: ReadonlySet<string>,
  query: string,
): readonly SemanticSearchHit[] {
  if (importFact.resolvedPath === undefined) return [];
  const resolvedPath = path.resolve(importFact.resolvedPath);
  if (!definitionPaths.has(resolvedPath) || path.resolve(moduleReport.path) === resolvedPath) {
    return [];
  }
  return [
    {
      kind: "callsite",
      ownerPath: relPath(report, moduleReport.path),
      symbol: query,
      location: locationFromSource(report, importFact.location),
      score: importFact.kind === "import" ? 4 : 3,
      reason: importFact.kind === "export" ? "reexport-owner" : "import-owner",
      fields: {
        moduleSpecifier: importFact.moduleSpecifier,
        importKind: importFact.kind,
        typeOnly: importFact.isTypeOnly,
        targetPath: relPath(report, resolvedPath),
      },
    },
  ];
}

export function importHits(
  report: TypeScriptHarnessReport,
  query: string,
): readonly SemanticSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return report.reasoningTree.ownerDependencies
    .flatMap((dependency) => importHit(report, dependency, needle))
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_IMPORT_HITS);
}

export function importHit(
  report: TypeScriptHarnessReport,
  dependency: TypeScriptReasoningOwnerDependencyFact,
  needle: string,
): readonly SemanticSearchHit[] {
  const fromPath = relPath(report, dependency.fromPath);
  const toPath = dependency.toPath ? relPath(report, dependency.toPath) : undefined;
  const haystack = [dependency.moduleSpecifier, fromPath, toPath ?? ""].join("\n").toLowerCase();
  if (!haystack.includes(needle)) return [];
  const exact = dependency.moduleSpecifier.toLowerCase() === needle;
  return [
    {
      kind: "import",
      ownerPath: fromPath,
      location: locationFromSource(report, dependency.location),
      score: exact ? 6 : 3,
      reason: dependency.resolution,
      fields: {
        moduleSpecifier: dependency.moduleSpecifier,
        importKind: dependency.kind,
        typeOnly: dependency.isTypeOnly,
        test: dependency.isTestContext,
        resolution: dependency.resolution,
        ...(toPath ? { targetPath: toPath } : {}),
      },
    },
  ];
}

export function importEdges(
  report: TypeScriptHarnessReport,
  query: string,
): readonly SemanticSearchEdge[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return report.reasoningTree.ownerDependencies
    .filter((dependency) => {
      const fromPath = relPath(report, dependency.fromPath);
      const toPath = dependency.toPath ? relPath(report, dependency.toPath) : "";
      return [dependency.moduleSpecifier, fromPath, toPath]
        .join("\n")
        .toLowerCase()
        .includes(needle);
    })
    .map((dependency) => edgeFact(report, dependency))
    .slice(0, MAX_IMPORT_HITS);
}

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
        : relPath(report, left.moduleReport.path).localeCompare(
            relPath(report, right.moduleReport.path),
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

export function testEdges(
  report: TypeScriptHarnessReport,
  owner: TypeScriptReasoningOwnerBranchFact | undefined,
  query: string,
): readonly SemanticSearchEdge[] {
  const targetPath = owner ? relPath(report, owner.path) : slashPath(query.trim());
  if (targetPath === "") return [];
  return report.reasoningTree.ownerDependencies
    .filter((dependency) => {
      if (!dependency.isTestContext || dependency.toPath === undefined) return false;
      const fromPath = relPath(report, dependency.fromPath);
      const toPath = relPath(report, dependency.toPath);
      return (
        toPath === targetPath ||
        toPath.endsWith(`/${targetPath}`) ||
        fromPath.includes(targetPath) ||
        dependency.moduleSpecifier.includes(query)
      );
    })
    .map((dependency) => {
      const sourcePath = dependency.toPath ? relPath(report, dependency.toPath) : slashPath(query);
      const testPath = relPath(report, dependency.fromPath);
      return {
        from: ownerId(sourcePath),
        kind: "test" as const,
        to: testId(testPath),
        label: dependency.moduleSpecifier,
        location: locationFromSource(report, dependency.location),
        fields: {
          importKind: dependency.kind,
          typeOnly: dependency.isTypeOnly,
          resolution: dependency.resolution,
        },
      };
    })
    .slice(0, MAX_IMPORT_HITS);
}

export function testHits(
  report: TypeScriptHarnessReport,
  edges: readonly SemanticSearchEdge[],
  query: string,
): readonly SemanticSearchHit[] {
  const edgeHits = edges.map((edge) => ({
    kind: "test" as const,
    ownerPath: stripNodePrefix(edge.to),
    symbol: query,
    location: edge.location ?? { path: stripNodePrefix(edge.to) },
    score: 4,
    reason: "test-import-owner",
    fields: {
      moduleSpecifier: edge.label ?? "",
      sourceOwner: stripNodePrefix(edge.from),
    },
  }));
  if (edgeHits.length > 0 || query.trim() === "") return edgeHits;
  const needle = query.trim().toLowerCase();
  return report.reasoningTree.ownerBranches
    .filter(
      (branch) =>
        branch.roles.includes("test") &&
        relPath(report, branch.path).toLowerCase().includes(needle),
    )
    .map((branch) => {
      const ownerPath = relPath(report, branch.path);
      return {
        kind: "test" as const,
        ownerPath,
        symbol: query,
        location: { path: ownerPath },
        score: 2,
        reason: "test-path",
        fields: {},
      };
    })
    .slice(0, MAX_IMPORT_HITS);
}

export function ownersForHits(
  report: TypeScriptHarnessReport,
  hits: readonly SemanticSearchHit[],
): readonly SemanticSearchOwner[] {
  const byPath = new Map(
    report.reasoningTree.ownerBranches.map((branch) => [relPath(report, branch.path), branch]),
  );
  const owners: SemanticSearchOwner[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.ownerPath)) continue;
    seen.add(hit.ownerPath);
    const branch = byPath.get(hit.ownerPath);
    if (branch !== undefined) {
      owners.push(ownerFact(report, branch));
    } else {
      owners.push({
        path: hit.ownerPath,
        role: "unknown",
        public: false,
        fields: {},
      });
    }
  }
  return owners;
}

export function ownersForPaths(
  report: TypeScriptHarnessReport,
  paths: readonly string[],
): readonly SemanticSearchOwner[] {
  const byPath = new Map(
    report.reasoningTree.ownerBranches.map((branch) => [relPath(report, branch.path), branch]),
  );
  const owners: SemanticSearchOwner[] = [];
  const seen = new Set<string>();
  for (const rawPath of paths) {
    const ownerPath = slashPath(rawPath);
    if (seen.has(ownerPath)) continue;
    const branch = byPath.get(ownerPath);
    if (branch === undefined) continue;
    seen.add(ownerPath);
    owners.push(ownerFact(report, branch));
  }
  return owners;
}

export function uniqueOwners(
  owners: readonly SemanticSearchOwner[],
): readonly SemanticSearchOwner[] {
  const seen = new Set<string>();
  const result: SemanticSearchOwner[] = [];
  for (const owner of owners) {
    if (seen.has(owner.path)) continue;
    seen.add(owner.path);
    result.push(owner);
  }
  return result;
}

export function isTestOwnerPath(ownerPath: string): boolean {
  return (
    ownerPath.includes("/test/") || ownerPath.includes("/tests/") || ownerPath.includes(".test.")
  );
}
