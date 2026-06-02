/**
 * Search hit builders for text, symbols, callsites, and imports.
 */

import path from "node:path";

import type {
  TypeScriptExportFact,
  TypeScriptHarnessReport,
  TypeScriptModuleReport,
  TypeScriptNativeImportResolutionFact,
  TypeScriptReasoningOwnerDependencyFact,
} from "../../model.js";
import { edgeFact } from "./facts.js";
import { compareHitsByRecency } from "./recency.js";
import { fuzzySourceTextHits, fuzzyTextMatch, sourceTextHits } from "./source-text.js";
import { isTestOwnerPath } from "./test-path.js";
import type { SemanticSearchEdge, SemanticSearchHit, SemanticSearchSurfaceKind } from "./types.js";
import { MAX_IMPORT_HITS, MAX_SYMBOL_HITS, MAX_FZF_HITS } from "./types.js";
import { locationFromSource, relPath } from "./utils.js";

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
      surface: ownerSurface(rel),
      realOwner: true,
      fields: { matches: exportMatches.slice(0, 6) },
    });
  }
  hits.push(...sourceTextHits(report, query.trim(), needle));
  return hits.sort((left, right) => compareHits(report, left, right)).slice(0, MAX_FZF_HITS);
}

export function fuzzyFzfHits(
  report: TypeScriptHarnessReport,
  query: string,
): readonly SemanticSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const hits: SemanticSearchHit[] = [];
  for (const branch of report.reasoningTree.ownerBranches) {
    const rel = relPath(report, branch.path);
    const pathMatch = fuzzyTextMatch(rel, needle);
    const exportMatches = branch.exportNames
      .map((name) => ({ name, match: fuzzyTextMatch(name, needle) }))
      .filter(
        (
          entry,
        ): entry is {
          readonly name: string;
          readonly match: { readonly score: number; readonly column: number };
        } => entry.match !== undefined,
      )
      .sort((left, right) => right.match.score - left.match.score);
    if (pathMatch === undefined && exportMatches.length === 0) continue;
    hits.push({
      kind: exportMatches.length > 0 ? "export" : "path",
      ownerPath: rel,
      ...(exportMatches[0] ? { symbol: exportMatches[0].name } : {}),
      location: { path: rel },
      score: Math.max(exportMatches[0]?.match.score ?? 0, pathMatch?.score ?? 0),
      reason: exportMatches.length > 0 ? "export-name-fuzzy" : "path-fuzzy",
      surface: ownerSurface(rel),
      realOwner: true,
      fields: { matches: exportMatches.slice(0, 6).map((entry) => entry.name), matchMode: "fuzzy" },
    });
  }
  hits.push(...fuzzySourceTextHits(report, query));
  return hits.sort((left, right) => compareHits(report, left, right)).slice(0, MAX_FZF_HITS);
}

export function textQuerySetHits(
  report: TypeScriptHarnessReport,
  queryTerms: readonly string[],
  ownerScope: string | undefined,
): readonly SemanticSearchHit[] {
  return fzfQuerySetHitsFromHitsByTerm(report, textQueryHitsByTerm(report, queryTerms, ownerScope));
}

export function textQueryHitsByTerm(
  report: TypeScriptHarnessReport,
  queryTerms: readonly string[],
  ownerScope: string | undefined,
): ReadonlyMap<string, readonly SemanticSearchHit[]> {
  return new Map(
    queryTerms.map((queryTerm) => [
      queryTerm,
      textHits(report, queryTerm).filter(
        (hit) => ownerScope === undefined || hit.ownerPath === ownerScope,
      ),
    ]),
  );
}

export function fuzzyFzfQueryHitsByTerm(
  report: TypeScriptHarnessReport,
  queryTerms: readonly string[],
  ownerScope: string | undefined,
): ReadonlyMap<string, readonly SemanticSearchHit[]> {
  return new Map(
    queryTerms.map((queryTerm) => [
      queryTerm,
      fuzzyFzfHits(report, queryTerm).filter(
        (hit) => ownerScope === undefined || hit.ownerPath === ownerScope,
      ),
    ]),
  );
}

export function fzfQuerySetHitsFromHitsByTerm(
  report: TypeScriptHarnessReport,
  hitsByTerm: ReadonlyMap<string, readonly SemanticSearchHit[]>,
): readonly SemanticSearchHit[] {
  const byKey = new Map<
    string,
    { readonly hit: SemanticSearchHit; readonly queryTerms: Set<string> }
  >();
  const orderedTerms = [...hitsByTerm.keys()].sort(compareQueryTermsBySpecificity);
  const depth = Math.max(...[...hitsByTerm.values()].map((hits) => hits.length), 0);
  for (let offset = 0; offset < depth; offset += 1) {
    for (const queryTerm of orderedTerms) {
      const hit = hitsByTerm.get(queryTerm)?.[offset];
      if (hit === undefined) continue;
      mergeTextQuerySetHit(byKey, queryTerm, hit);
    }
  }
  return [...byKey.values()]
    .map(({ hit, queryTerms: matchedTerms }) => ({
      ...hit,
      score: hit.score + matchedTerms.size,
      fields: {
        ...hit.fields,
        queryTerms: [...matchedTerms],
      },
    }))
    .sort((left, right) => compareHits(report, left, right))
    .slice(0, MAX_FZF_HITS);
}

function mergeTextQuerySetHit(
  byKey: Map<string, { readonly hit: SemanticSearchHit; readonly queryTerms: Set<string> }>,
  queryTerm: string,
  hit: SemanticSearchHit,
): void {
  const key = semanticHitKey(hit);
  const current = byKey.get(key);
  if (current === undefined) {
    if (byKey.size >= MAX_FZF_HITS) return;
    byKey.set(key, { hit, queryTerms: new Set([queryTerm]) });
    return;
  }
  current.queryTerms.add(queryTerm);
}

function compareQueryTermsBySpecificity(left: string, right: string): number {
  return queryTermSpecificity(right) - queryTermSpecificity(left) || left.localeCompare(right);
}

function queryTermSpecificity(term: string): number {
  const structural = [...term].filter((character) =>
    new Set([".", "_", "/", '"', "'", "(", ")", "[", "]", ":"]).has(character),
  ).length;
  return new Set(term.toLowerCase()).size + term.length + structural * 8;
}

function semanticHitKey(hit: SemanticSearchHit): string {
  return [
    hit.kind,
    hit.ownerPath,
    hit.symbol ?? "",
    hit.location.path,
    hit.location.lineRange ?? "",
    hit.reason,
  ].join("\0");
}

function ownerSurface(ownerPath: string): SemanticSearchSurfaceKind {
  return isTestOwnerPath(ownerPath) ? "test-source" : "real-source";
}

function compareHits(
  report: TypeScriptHarnessReport,
  left: SemanticSearchHit,
  right: SemanticSearchHit,
): number {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) return scoreDiff;
  return compareHitsByRecency(report.reasoningTree.projectRoot, left, right);
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
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareHitsByRecency(report.reasoningTree.projectRoot, left, right),
    )
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
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareHitsByRecency(report.reasoningTree.projectRoot, left, right),
    )
    .slice(0, MAX_FZF_HITS);
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
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareHitsByRecency(report.reasoningTree.projectRoot, left, right),
    )
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
