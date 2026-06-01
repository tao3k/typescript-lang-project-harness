/**
 * Semantic-search packet builders for text views and query-set composition.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import { ownerNode, testNode } from "./facts.js";
import {
  ownersForHits,
  ownersForPaths,
  testEdges,
  testHits,
  textHits,
  textQuerySetHits,
  uniqueOwners,
} from "./hits.js";
import { basePacket, normalizedQuerySet } from "./packet-base.js";
import { isTestOwnerPath } from "./test-path.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchEdge,
  SemanticSearchOwner,
  SemanticSearchPacket,
} from "./types.js";
import { findOwner, resolveOwnerPath, stripNodePrefix } from "./utils.js";

export function buildTextPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const queryTerms = normalizedQuerySet(options.querySet);
  if (queryTerms.length > 0) {
    return buildTextQuerySetPacket(report, options, queryTerms);
  }
  const query = options.query ?? "";
  const hits = textHits(report, query);
  const pipes = options.pipes ?? [];
  const textOwners = ownersForHits(report, hits);
  const testEdgesForText = pipes.includes("tests") ? testEdgesForOwners(report, textOwners) : [];
  const testHitsForText =
    testEdgesForText.length > 0 ? testHits(report, testEdgesForText, query) : [];
  const owners = uniqueOwners([
    ...textOwners,
    ...ownersForPaths(
      report,
      testEdgesForText.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
    ),
    ...ownersForHits(report, testHitsForText),
  ]);
  const notes =
    query.trim() === ""
      ? [{ kind: "empty-query" as const, message: "text search requires a non-empty query" }]
      : hits.length === 0
        ? [
            {
              kind: "not-found" as const,
              message:
                "text search covers parser-visible source text, owner paths, and exports; pipe rg output to search ingest for docs, schema files, and other non-parser text",
            },
          ]
        : [];
  return basePacket(report, options, {
    header: {
      kind: "search-text",
      fields: {
        q: query,
        own: owners.length,
        hit: hits.length + testHitsForText.length,
        view: testEdgesForText.length > 0 ? "both" : "hits",
        pipes,
        ...(testEdgesForText.length > 0 ? { test: testHitsForText.length } : {}),
      },
    },
    nodes: owners.map((owner) =>
      owner.role.includes("test") || isTestOwnerPath(owner.path)
        ? testNode(owner)
        : ownerNode(owner),
    ),
    edges: testEdgesForText,
    owners,
    hits: [...hits, ...testHitsForText],
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
  const hits = textQuerySetHits(report, queryTerms, ownerScope);
  const textOwners = ownersForHits(report, hits);
  const testEdgesForText = pipes.includes("tests") ? testEdgesForOwners(report, textOwners) : [];
  const testHitsForText =
    testEdgesForText.length > 0 ? testHits(report, testEdgesForText, query) : [];
  const owners = uniqueOwners([
    ...textOwners,
    ...ownersForPaths(
      report,
      testEdgesForText.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
    ),
    ...ownersForHits(report, testHitsForText),
  ]);
  const notes =
    hits.length === 0
      ? [
          {
            kind: "not-found" as const,
            message:
              "text query-set covers parser-visible source text, owner paths, and exports; pipe external candidates to search ingest",
          },
        ]
      : [];
  return basePacket(report, scopedOptions, {
    header: {
      kind: "search-text",
      fields: {
        q: query,
        querySet: queryTerms.length,
        selector: "exact-set",
        ...(ownerScope === undefined ? {} : { scopeOwner: ownerScope }),
        own: owners.length,
        hit: hits.length + testHitsForText.length,
        view: testEdgesForText.length > 0 ? "both" : "hits",
        pipes,
        ...(testEdgesForText.length > 0 ? { test: testHitsForText.length } : {}),
      },
    },
    nodes: owners.map((owner) =>
      owner.role.includes("test") || isTestOwnerPath(owner.path)
        ? testNode(owner)
        : ownerNode(owner),
    ),
    edges: testEdgesForText,
    owners,
    hits: [...hits, ...testHitsForText],
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
