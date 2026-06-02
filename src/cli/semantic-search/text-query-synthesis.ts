/**
 * Query-set coverage, owner resolution, and follow-up synthesis for text search.
 */

import type { TypeScriptHarnessReport, TypeScriptReasoningOwnerBranchFact } from "../../model.js";
import type {
  SemanticSearchAvoidNextAction,
  SemanticSearchHit,
  SemanticSearchNextAction,
  SemanticSearchOwner,
  SemanticSearchOwnerResolution,
  SemanticSearchQueryCoverage,
  SemanticSearchSynthesis,
  SemanticSearchSurfaceKind,
} from "./types.js";
import { relPath } from "./utils.js";

export function textQueryCoverage(
  queryTerms: readonly string[],
  hitsByTerm: ReadonlyMap<string, readonly SemanticSearchHit[]>,
  selectedHits: readonly SemanticSearchHit[],
): readonly SemanticSearchQueryCoverage[] {
  const selectedCounts = selectedQueryTermCounts(selectedHits);
  return queryTerms.map((term) => {
    const hits = hitsByTerm.get(term) ?? [];
    const selectedCount = selectedCounts.get(term) ?? 0;
    return {
      value: term,
      kind: "text" as const,
      selector: "exact" as const,
      status: coverageStatus(hits.length, selectedCount),
      hitCount: hits.length,
      surfaces: unique(hits.map((hit) => hit.surface ?? surfaceForOwnerPath(hit.ownerPath))).slice(
        0,
        8,
      ),
      ownerPaths: unique(hits.map((hit) => hit.ownerPath)).slice(0, 8),
      fixturePaths: unique(
        hits.flatMap((hit) => (hit.fixturePath === undefined ? [] : [hit.fixturePath])),
      ).slice(0, 8),
      fields: { selectedHits: selectedCount },
    };
  });
}

export function textOwnerResolution(
  report: TypeScriptHarnessReport,
  owners: readonly SemanticSearchOwner[],
  hits: readonly SemanticSearchHit[],
): readonly SemanticSearchOwnerResolution[] {
  const realOwners = realOwnerMap(report);
  const resolutions = new Map<string, SemanticSearchOwnerResolution>();
  for (const owner of owners) {
    resolutions.set(owner.path, {
      target: owner.path,
      status: "workspace-owner",
      realOwner: true,
      ownerPath: owner.path,
      reason: "parser-visible owner selected by text search",
    });
  }
  for (const hit of hits) {
    if (hit.fixturePath === undefined) continue;
    const realOwner = realOwners.get(hit.fixturePath);
    if (realOwner === undefined) {
      resolutions.set(hit.fixturePath, {
        target: hit.fixturePath,
        status: "fixture-path",
        realOwner: false,
        fixturePath: hit.fixturePath,
        fixtureOwner: hit.fixtureOwner ?? hit.ownerPath,
        reason: "path appears only as a test fixture string",
      });
    } else {
      resolutions.set(hit.fixturePath, {
        target: hit.fixturePath,
        status: "workspace-owner",
        realOwner: true,
        ownerPath: hit.fixturePath,
        fixturePath: hit.fixturePath,
        fixtureOwner: hit.fixtureOwner ?? hit.ownerPath,
        reason: "fixture path also exists as a parser-visible workspace owner",
      });
    }
  }
  return [...resolutions.values()].slice(0, 12);
}

export function textSearchSynthesis(
  report: TypeScriptHarnessReport,
  queryTerms: readonly string[],
  hits: readonly SemanticSearchHit[],
  ownerPaths: readonly string[],
  ownerResolution: readonly SemanticSearchOwnerResolution[],
): SemanticSearchSynthesis | undefined {
  if (queryTerms.length === 0) return undefined;
  const realOwners = realOwnerMap(report);
  const rankedOwners = rankedSynthesisOwners(hits, ownerPaths, ownerResolution, realOwners);
  const editFrontier = rankedOwners
    .filter((ownerPath) => surfaceForOwnerPath(ownerPath) !== "test-source")
    .slice(0, 4);
  const testFrontier = unique([
    ...rankedOwners.filter((ownerPath) => surfaceForOwnerPath(ownerPath) === "test-source"),
    ...hits
      .map((hit) => hit.ownerPath)
      .filter((ownerPath) => surfaceForOwnerPath(ownerPath) === "test-source"),
  ]).slice(0, 4);
  const windowSet = [
    ...editFrontier.map((ownerPath) => ({ kind: "owner" as const, target: ownerPath })),
    ...testFrontier.map((ownerPath) => ({ kind: "tests" as const, target: ownerPath })),
  ].slice(0, 8);
  const seeds: SemanticSearchNextAction[] = [];
  for (const ownerPath of rankedOwners) {
    const branch = realOwners.get(ownerPath);
    if (branch !== undefined) {
      for (const exportName of rankedExportNames(branch, hits, queryTerms).slice(0, 4)) {
        addSeed(seeds, { kind: "text", target: exportName, ownerPath });
      }
    }
    addSeed(seeds, { kind: "owner", target: ownerPath });
    addSeed(seeds, { kind: "tests", target: ownerPath });
  }
  return {
    algorithm: "query-set-owner-resolution",
    scope: "query-set",
    summary: `query-set compressed ${queryTerms.length} text terms into ${ownerPaths.length} parser-visible owners`,
    selectedOwners: rankedOwners.length,
    ...(editFrontier.length === 0 ? {} : { editFrontier }),
    ...(testFrontier.length === 0 ? {} : { testFrontier }),
    ...(windowSet.length === 0 ? {} : { windowSet }),
    seeds: seeds.slice(0, 8),
    fields: {
      querySet: queryTerms.length,
      owners: ownerPaths.length,
      hits: hits.length,
    },
  };
}

export function textAvoidNextActions(
  queryTerms: readonly string[],
  ownerResolution: readonly SemanticSearchOwnerResolution[],
): readonly SemanticSearchAvoidNextAction[] {
  const avoid: SemanticSearchAvoidNextAction[] = [];
  for (const resolution of ownerResolution) {
    if (resolution.status !== "fixture-path") continue;
    avoid.push({
      kind: "owner",
      target: resolution.target,
      reason: "fixture-path-not-workspace-owner",
      ...(resolution.fixtureOwner === undefined ? {} : { ownerPath: resolution.fixtureOwner }),
    });
  }
  const resolvedTargets = new Set(ownerResolution.map((resolution) => resolution.target));
  for (const term of queryTerms) {
    if (!looksLikeProjectPath(term) || resolvedTargets.has(term)) continue;
    avoid.push({
      kind: "owner",
      target: term,
      reason: "query-term-not-parser-visible-owner",
    });
  }
  return avoid.slice(0, 8);
}

function selectedQueryTermCounts(
  selectedHits: readonly SemanticSearchHit[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const hit of selectedHits) {
    const queryTerms = hit.fields?.queryTerms;
    if (!Array.isArray(queryTerms)) continue;
    for (const term of queryTerms) {
      if (typeof term !== "string") continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return counts;
}

function coverageStatus(
  hitCount: number,
  selectedCount: number,
): SemanticSearchQueryCoverage["status"] {
  if (hitCount > 0 && selectedCount < hitCount) return "partial";
  if (hitCount > 0) return "hit";
  return "miss";
}

function realOwnerMap(
  report: TypeScriptHarnessReport,
): ReadonlyMap<string, TypeScriptReasoningOwnerBranchFact> {
  return new Map(
    report.reasoningTree.ownerBranches.map((branch) => [relPath(report, branch.path), branch]),
  );
}

function rankedSynthesisOwners(
  hits: readonly SemanticSearchHit[],
  ownerPaths: readonly string[],
  ownerResolution: readonly SemanticSearchOwnerResolution[],
  realOwners: ReadonlyMap<string, TypeScriptReasoningOwnerBranchFact>,
): readonly string[] {
  const candidates = unique([
    ...ownerResolution.flatMap((resolution) =>
      resolution.realOwner && resolution.ownerPath !== undefined ? [resolution.ownerPath] : [],
    ),
    ...ownerPaths,
  ]).filter((ownerPath) => realOwners.has(ownerPath));
  const termCounts = new Map<string, Set<string>>();
  const bestScores = new Map<string, number>();
  for (const hit of hits) {
    const terms = Array.isArray(hit.fields?.queryTerms)
      ? hit.fields.queryTerms.filter((term): term is string => typeof term === "string")
      : [];
    const owners = unique([hit.ownerPath, hit.fixturePath ?? ""]).filter((ownerPath) =>
      candidates.includes(ownerPath),
    );
    for (const ownerPath of owners) {
      const currentTerms = termCounts.get(ownerPath) ?? new Set<string>();
      for (const term of terms) currentTerms.add(term);
      termCounts.set(ownerPath, currentTerms);
      bestScores.set(ownerPath, Math.max(bestScores.get(ownerPath) ?? 0, hit.score));
    }
  }
  return candidates.sort(
    (left, right) =>
      (termCounts.get(right)?.size ?? 0) - (termCounts.get(left)?.size ?? 0) ||
      (bestScores.get(right) ?? 0) - (bestScores.get(left) ?? 0) ||
      left.localeCompare(right),
  );
}

function rankedExportNames(
  branch: TypeScriptReasoningOwnerBranchFact,
  hits: readonly SemanticSearchHit[],
  queryTerms: readonly string[],
): readonly string[] {
  const querySet = new Set(queryTerms);
  const snippets = hits.map((hit) => hit.snippet ?? "").join("\n");
  return branch.exportNames
    .map((name, index) => ({ name, index }))
    .sort(
      (left, right) =>
        exportRank(right.name, querySet, snippets) - exportRank(left.name, querySet, snippets) ||
        left.index - right.index,
    )
    .map(({ name }) => name);
}

function exportRank(exportName: string, querySet: ReadonlySet<string>, snippets: string): number {
  let score = 0;
  if (querySet.has(exportName)) score += 100;
  if (snippets.includes(exportName)) score += 60;
  if (/^[a-z]/u.test(exportName)) score += 20;
  return score;
}

function addSeed(seeds: SemanticSearchNextAction[], seed: SemanticSearchNextAction): void {
  if (
    seeds.some(
      (current) =>
        current.kind === seed.kind &&
        current.target === seed.target &&
        current.ownerPath === seed.ownerPath,
    )
  ) {
    return;
  }
  seeds.push(seed);
}

function unique<T>(items: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function surfaceForOwnerPath(ownerPath: string): SemanticSearchSurfaceKind {
  return ownerPath.includes("/test") ||
    ownerPath.endsWith(".test.ts") ||
    ownerPath.endsWith(".spec.ts")
    ? "test-source"
    : "real-source";
}

function looksLikeProjectPath(term: string): boolean {
  return (
    term.includes("/") &&
    !term.includes(" ") &&
    !term.includes("\\") &&
    !term.includes(":") &&
    !term.startsWith("/") &&
    term.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}
