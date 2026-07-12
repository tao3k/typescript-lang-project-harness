/**
 * Semantic-search packet builders for lexical views and query-set composition.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import { ownerNode, testNode } from "./facts.js";
import {
  ownersForHits,
  ownersForPaths,
  testEdges,
  testHits,
  lexicalQuerySetHitsFromHitsByTerm,
  uniqueOwners,
} from "./hits.js";
import { basePacket, normalizedQuerySet } from "./packet-base.js";
import { isTestOwnerPath } from "./test-path.js";
import {
  lexicalAvoidNextActions,
  lexicalOwnerResolution,
  lexicalQueryCoverage,
  lexicalSearchSynthesis,
} from "./lexical-query-synthesis.js";
import { MAX_LEXICAL_HITS } from "./types.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchEdge,
  SemanticSearchHit,
  SemanticSearchOwner,
  SemanticSearchPacket,
} from "./types.js";
import { findOwner, resolveOwnerPath, stripNodePrefix } from "./utils.js";

import { fuzzyLexicalHits, fuzzyLexicalQueryHitsByTerm } from "./hit-search.js";

export function buildLexicalPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const queryTerms = normalizedQuerySet(options.querySet);
  if (queryTerms.length > 0) {
    return buildTextQuerySetPacket(report, options, queryTerms);
  }
  const query = options.query ?? "";
  const hits = fuzzyLexicalHits(report, query);
  const pipes = options.pipes ?? [];
  const lexicalOwners = ownersForHits(report, hits);
  const testEdgesForLexical = pipes.includes("tests")
    ? testEdgesForOwners(report, lexicalOwners)
    : [];
  const testHitsForLexical =
    testEdgesForLexical.length > 0 ? testHits(report, testEdgesForLexical, query) : [];
  const owners = uniqueOwners([
    ...lexicalOwners,
    ...ownersForPaths(
      report,
      testEdgesForLexical.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
    ),
    ...ownersForHits(report, testHitsForLexical),
  ]);
  const notes =
    query.trim() === ""
      ? [{ kind: "empty-query" as const, message: "lexical search requires a non-empty query" }]
      : hits.length === 0
        ? [
            {
              kind: "not-found" as const,
              message:
                "lexical search covers parser-visible source text, owner paths, and exports; pipe rg output to search ingest for docs, schema files, and other non-parser text",
            },
          ]
        : [];
  return basePacket(report, options, {
    header: {
      kind: "search-lexical",
      fields: {
        q: query,
        mode: "fuzzy",
        backend: "provider",
        own: owners.length,
        hit: hits.length + testHitsForLexical.length,
        view: testEdgesForLexical.length > 0 ? "both" : "hits",
        pipes,
        ...(testEdgesForLexical.length > 0 ? { test: testHitsForLexical.length } : {}),
      },
    },
    nodes: owners.map((owner) =>
      owner.role.includes("test") || isTestOwnerPath(owner.path)
        ? testNode(owner)
        : ownerNode(owner),
    ),
    edges: testEdgesForLexical,
    owners,
    hits: [...hits, ...testHitsForLexical],
    findings: [],
    nextActions:
      owners.length > 0
        ? owners.slice(0, 5).map((owner) => ({ kind: "owner" as const, target: owner.path }))
        : query.trim() === ""
          ? []
          : [{ kind: "ingest" as const, target: query }],
    notes,
  });
}

function buildTextQuerySetPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
  queryTerms: readonly string[],
): SemanticSearchPacket {
  const query = queryTerms.join(",");
  const ownerScope =
    options.queryScope?.ownerPath === undefined
      ? undefined
      : resolveOwnerPath(report, options.queryScope.ownerPath);
  const scopedOptions: SemanticSearchBuildOptions = {
    ...options,
    query,
    querySet: queryTerms,
    ...(ownerScope === undefined ? {} : { queryScope: { ownerPath: ownerScope } }),
  };
  const pipes = options.pipes ?? [];
  const hitsByTerm = fuzzyLexicalQueryHitsByTerm(report, queryTerms, ownerScope);
  const hits = lexicalQuerySetHitsFromHitsByTerm(report, hitsByTerm);
  const querySetOwnerHits = querySetOwnerFrontierHits(hitsByTerm, queryTerms);
  const lexicalOwners = uniqueOwners([
    ...ownersForHits(report, querySetOwnerHits),
    ...ownersForHits(report, hits),
  ]);
  const testEdgesForLexical = pipes.includes("tests")
    ? testEdgesForOwners(report, lexicalOwners)
    : [];
  const testHitsForLexical =
    testEdgesForLexical.length > 0 ? testHits(report, testEdgesForLexical, query) : [];
  const owners = uniqueOwners([
    ...lexicalOwners,
    ...ownersForPaths(
      report,
      testEdgesForLexical.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
    ),
    ...ownersForHits(report, testHitsForLexical),
  ]);
  const ownerPaths = owners.map((owner) => owner.path);
  const ownerResolution = lexicalOwnerResolution(report, owners, hits);
  const searchSynthesis = lexicalSearchSynthesis(
    report,
    queryTerms,
    hits,
    ownerPaths,
    ownerResolution,
  );
  const notes =
    hits.length === 0
      ? [
          {
            kind: "not-found" as const,
            message:
              "lexical query-set covers parser-visible source text, owner paths, and exports; pipe external candidates to search ingest",
          },
        ]
      : [];
  return basePacket(report, scopedOptions, {
    header: {
      kind: "search-lexical",
      fields: {
        q: query,
        querySet: queryTerms.length,
        selector: "lexical-set",
        mode: "fuzzy",
        backend: "provider",
        ...(ownerScope === undefined ? {} : { scopeOwner: ownerScope }),
        own: owners.length,
        hit: hits.length + testHitsForLexical.length,
        view: testEdgesForLexical.length > 0 ? "both" : "hits",
        pipes,
        ...(testEdgesForLexical.length > 0 ? { test: testHitsForLexical.length } : {}),
      },
    },
    nodes: owners.map((owner) =>
      owner.role.includes("test") || isTestOwnerPath(owner.path)
        ? testNode(owner)
        : ownerNode(owner),
    ),
    edges: testEdgesForLexical,
    owners,
    hits: [...hits, ...testHitsForLexical],
    queryCoverage: lexicalQueryCoverage(queryTerms, hitsByTerm, hits),
    ownerResolution,
    ...(searchSynthesis === undefined ? {} : { searchSynthesis }),
    avoidNextActions: lexicalAvoidNextActions(queryTerms, ownerResolution),
    findings: [],
    nextActions:
      owners.length > 0
        ? owners.slice(0, 5).map((owner) => ({ kind: "owner" as const, target: owner.path }))
        : [{ kind: "ingest" as const, target: query }],
    notes,
  });
}

function querySetOwnerFrontierHits(
  hitsByTerm: ReadonlyMap<string, readonly SemanticSearchHit[]>,
  queryTerms: readonly string[],
): readonly SemanticSearchHit[] {
  const normalizedTerms = queryTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  const byOwner = new Map<string, { hit: SemanticSearchHit; readonly queryTerms: Set<string> }>();
  for (const [queryTerm, hits] of hitsByTerm) {
    for (const hit of hits) {
      const ownerPath = hit.ownerPath || hit.location.path;
      if (ownerPath === "") {
        continue;
      }
      const current = byOwner.get(ownerPath);
      const normalizedHit = hit.ownerPath === "" ? { ...hit, ownerPath } : hit;
      if (current === undefined) {
        byOwner.set(ownerPath, { hit: normalizedHit, queryTerms: new Set([queryTerm]) });
        continue;
      }
      current.queryTerms.add(queryTerm);
      if (compareQuerySetOwnerFrontierHit(normalizedHit, current.hit, normalizedTerms) < 0) {
        current.hit = normalizedHit;
      }
    }
  }
  const entries = [...byOwner.entries()].filter(([ownerPath, entry]) => {
    if (querySetOwnerSurfaceRank(ownerPath, entry.hit) <= 0) {
      return false;
    }
    const foldedOwner = ownerPath.toLowerCase();
    return (
      normalizedTerms.some((term) => foldedOwner.includes(term)) ||
      (entry.queryTerms.size >= normalizedTerms.length && querySetHitKindRank(entry.hit) >= 2)
    );
  });
  return entries
    .sort((left, right) => {
      const leftRank = querySetOwnerFrontierRank(left[0], left[1], normalizedTerms);
      const rightRank = querySetOwnerFrontierRank(right[0], right[1], normalizedTerms);
      return compareQuerySetOwnerFrontierRank(leftRank, rightRank);
    })
    .map(([, entry]) => entry.hit)
    .slice(0, MAX_LEXICAL_HITS);
}

function querySetOwnerFrontierRank(
  ownerPath: string,
  entry: { readonly hit: SemanticSearchHit; readonly queryTerms: ReadonlySet<string> },
  normalizedTerms: readonly string[],
): readonly [number, number, number, number, number, string] {
  const foldedOwner = ownerPath.toLowerCase();
  return [
    -querySetOwnerSurfaceRank(ownerPath, entry.hit),
    normalizedTerms.some((term) => foldedOwner.includes(term)) ? 0 : 1,
    -entry.queryTerms.size,
    -querySetHitKindRank(entry.hit),
    -entry.hit.score,
    ownerPath,
  ];
}

function compareQuerySetOwnerFrontierHit(
  left: SemanticSearchHit,
  right: SemanticSearchHit,
  normalizedTerms: readonly string[],
): number {
  return compareQuerySetOwnerFrontierRank(
    querySetOwnerFrontierRank(
      left.ownerPath || left.location.path,
      { hit: left, queryTerms: new Set() },
      normalizedTerms,
    ),
    querySetOwnerFrontierRank(
      right.ownerPath || right.location.path,
      { hit: right, queryTerms: new Set() },
      normalizedTerms,
    ),
  );
}

function compareQuerySetOwnerFrontierRank(
  left: readonly [number, number, number, number, number, string],
  right: readonly [number, number, number, number, number, string],
): number {
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    left[2] - right[2] ||
    left[3] - right[3] ||
    left[4] - right[4] ||
    left[5].localeCompare(right[5])
  );
}

function querySetOwnerSurfaceRank(ownerPath: string, hit: SemanticSearchHit): number {
  if (hit.surface === "test-source" || isTestOwnerPath(ownerPath)) {
    return 0;
  }
  if (ownerPath.endsWith(".d.ts")) {
    return 1;
  }
  return 2;
}

function querySetHitKindRank(hit: SemanticSearchHit): number {
  switch (hit.kind) {
    case "export":
    case "path":
      return 2;
    case "text":
      return 1;
    default:
      return 0;
  }
}

function testEdgesForOwners(
  report: TypeScriptHarnessReport,
  owners: readonly SemanticSearchOwner[],
): readonly SemanticSearchEdge[] {
  const edges = owners
    .filter((owner) => !owner.role.includes("test") && !isTestOwnerPath(owner.path))
    .flatMap((owner) => testEdges(report, findOwner(report, owner.path), owner.path));
  return uniqueEdges(edges);
}

function uniqueEdges(edges: readonly SemanticSearchEdge[]): readonly SemanticSearchEdge[] {
  const seen = new Set<string>();
  const unique: SemanticSearchEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.from}:${edge.kind}:${edge.to}:${edge.label ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(edge);
  }
  return unique;
}
