/**
 * Semantic-search packet builders for fzf views and query-set composition.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import { ownerNode, testNode } from "./facts.js";
import {
  ownersForHits,
  ownersForPaths,
  testEdges,
  testHits,
  fzfQuerySetHitsFromHitsByTerm,
  uniqueOwners,
} from "./hits.js";
import { basePacket, normalizedQuerySet } from "./packet-base.js";
import { isTestOwnerPath } from "./test-path.js";
import {
  fzfAvoidNextActions,
  fzfOwnerResolution,
  fzfQueryCoverage,
  fzfSearchSynthesis,
} from "./fzf-query-synthesis.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchEdge,
  SemanticSearchOwner,
  SemanticSearchPacket,
} from "./types.js";
import { findOwner, resolveOwnerPath, stripNodePrefix } from "./utils.js";

import { fuzzyFzfHits, fuzzyFzfQueryHitsByTerm } from "./hit-search.js";

export function buildFzfPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const queryTerms = normalizedQuerySet(options.querySet);
  if (queryTerms.length > 0) {
    return buildTextQuerySetPacket(report, options, queryTerms);
  }
  const query = options.query ?? "";
  const hits = fuzzyFzfHits(report, query);
  const pipes = options.pipes ?? [];
  const fzfOwners = ownersForHits(report, hits);
  const testEdgesForFzf = pipes.includes("tests") ? testEdgesForOwners(report, fzfOwners) : [];
  const testHitsForFzf = testEdgesForFzf.length > 0 ? testHits(report, testEdgesForFzf, query) : [];
  const owners = uniqueOwners([
    ...fzfOwners,
    ...ownersForPaths(
      report,
      testEdgesForFzf.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
    ),
    ...ownersForHits(report, testHitsForFzf),
  ]);
  const notes =
    query.trim() === ""
      ? [{ kind: "empty-query" as const, message: "fzf search requires a non-empty query" }]
      : hits.length === 0
        ? [
            {
              kind: "not-found" as const,
              message:
                "fzf search covers parser-visible source text, owner paths, and exports; pipe rg output to search ingest for docs, schema files, and other non-parser text",
            },
          ]
        : [];
  return basePacket(report, options, {
    header: {
      kind: "search-fzf",
      fields: {
        q: query,
        mode: "fuzzy",
        backend: "provider",
        own: owners.length,
        hit: hits.length + testHitsForFzf.length,
        view: testEdgesForFzf.length > 0 ? "both" : "hits",
        pipes,
        ...(testEdgesForFzf.length > 0 ? { test: testHitsForFzf.length } : {}),
      },
    },
    nodes: owners.map((owner) =>
      owner.role.includes("test") || isTestOwnerPath(owner.path)
        ? testNode(owner)
        : ownerNode(owner),
    ),
    edges: testEdgesForFzf,
    owners,
    hits: [...hits, ...testHitsForFzf],
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
  const hitsByTerm = fuzzyFzfQueryHitsByTerm(report, queryTerms, ownerScope);
  const hits = fzfQuerySetHitsFromHitsByTerm(report, hitsByTerm);
  const fzfOwners = ownersForHits(report, hits);
  const testEdgesForFzf = pipes.includes("tests") ? testEdgesForOwners(report, fzfOwners) : [];
  const testHitsForFzf = testEdgesForFzf.length > 0 ? testHits(report, testEdgesForFzf, query) : [];
  const owners = uniqueOwners([
    ...fzfOwners,
    ...ownersForPaths(
      report,
      testEdgesForFzf.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
    ),
    ...ownersForHits(report, testHitsForFzf),
  ]);
  const ownerPaths = owners.map((owner) => owner.path);
  const ownerResolution = fzfOwnerResolution(report, owners, hits);
  const searchSynthesis = fzfSearchSynthesis(report, queryTerms, hits, ownerPaths, ownerResolution);
  const notes =
    hits.length === 0
      ? [
          {
            kind: "not-found" as const,
            message:
              "fzf query-set covers parser-visible source text, owner paths, and exports; pipe external candidates to search ingest",
          },
        ]
      : [];
  return basePacket(report, scopedOptions, {
    header: {
      kind: "search-fzf",
      fields: {
        q: query,
        querySet: queryTerms.length,
        selector: "fuzzy-set",
        mode: "fuzzy",
        backend: "provider",
        ...(ownerScope === undefined ? {} : { scopeOwner: ownerScope }),
        own: owners.length,
        hit: hits.length + testHitsForFzf.length,
        view: testEdgesForFzf.length > 0 ? "both" : "hits",
        pipes,
        ...(testEdgesForFzf.length > 0 ? { test: testHitsForFzf.length } : {}),
      },
    },
    nodes: owners.map((owner) =>
      owner.role.includes("test") || isTestOwnerPath(owner.path)
        ? testNode(owner)
        : ownerNode(owner),
    ),
    edges: testEdgesForFzf,
    owners,
    hits: [...hits, ...testHitsForFzf],
    queryCoverage: fzfQueryCoverage(queryTerms, hitsByTerm, hits),
    ownerResolution,
    ...(searchSynthesis === undefined ? {} : { searchSynthesis }),
    avoidNextActions: fzfAvoidNextActions(queryTerms, ownerResolution),
    findings: [],
    nextActions:
      owners.length > 0
        ? owners.slice(0, 5).map((owner) => ({ kind: "owner" as const, target: owner.path }))
        : [{ kind: "ingest" as const, target: query }],
    notes,
  });
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
