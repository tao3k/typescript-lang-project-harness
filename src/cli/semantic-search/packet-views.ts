/**
 * Semantic-search packet builders for symbol, graph, tests, and ingest views.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import { detectInput, ingestHits } from "./ingest.js";
import { dependencyNodesForEdge, ownerNode, symbolNode, testNode } from "./facts.js";
import {
  callsiteHits,
  importEdges,
  importHits,
  ownersForHits,
  ownersForPaths,
  symbolHits,
  testEdges,
  testHits,
  uniqueOwners,
} from "./hits.js";
import { basePacket } from "./packet-base.js";
import { isTestOwnerPath } from "./test-path.js";
import type { SemanticSearchBuildOptions, SemanticSearchPacket } from "./types.js";
import { findOwner, relPath, stripNodePrefix } from "./utils.js";

export function buildSymbolPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const query = options.query ?? "";
  const hits = symbolHits(report, query);
  const owners = ownersForHits(report, hits);
  return basePacket(report, options, {
    header: {
      kind: "search-symbol",
      fields: { q: query, own: owners.length, hit: hits.length, view: "hits" },
    },
    nodes: [...owners.map((owner) => ownerNode(owner)), ...hits.map((hit) => symbolNode(hit))],
    edges: [],
    owners,
    hits,
    findings: [],
    nextActions: hits
      .slice(0, 5)
      .flatMap((hit) => [
        { kind: "owner" as const, target: hit.ownerPath },
        ...(hit.symbol === undefined ? [] : [{ kind: "callsite" as const, target: hit.symbol }]),
      ]),
    notes:
      query.trim() === ""
        ? [{ kind: "empty-query" as const, message: "symbol search requires a non-empty query" }]
        : [],
  });
}

export function buildCallsitePacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const query = options.query ?? "";
  const definitionHits = symbolHits(report, query);
  const hits = callsiteHits(report, query, definitionHits);
  const owners = ownersForHits(report, hits);
  return basePacket(report, options, {
    header: {
      kind: "search-callsite",
      fields: {
        q: query,
        def: definitionHits.length,
        own: owners.length,
        hit: hits.length,
        view: "hits",
      },
    },
    nodes: owners.map((owner) => ownerNode(owner)),
    edges: [],
    owners,
    hits,
    findings: [],
    nextActions: owners
      .slice(0, 5)
      .map((owner) => ({ kind: "owner" as const, target: owner.path })),
    notes: [
      ...(query.trim() === ""
        ? [{ kind: "empty-query" as const, message: "callsite search requires a non-empty query" }]
        : []),
      {
        kind: "owner-level" as const,
        message:
          "callsite view uses parser-owned import/reexport edges; precise identifier references are a future TypeScript language-service layer",
      },
    ],
  });
}

export function buildImportPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const query = options.query ?? "";
  const hits = importHits(report, query);
  const edges = importEdges(report, query);
  const owners = ownersForPaths(report, [
    ...hits.map((hit) => hit.ownerPath),
    ...edges.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
  ]);
  return basePacket(report, options, {
    header: {
      kind: "search-import",
      fields: { q: query, own: owners.length, edge: edges.length, hit: hits.length, view: "graph" },
    },
    nodes: [
      ...owners.map((owner) => ownerNode(owner)),
      ...edges.flatMap((edge) => dependencyNodesForEdge(edge)),
    ],
    edges,
    owners,
    hits,
    findings: [],
    nextActions: owners
      .slice(0, 5)
      .map((owner) => ({ kind: "owner" as const, target: owner.path })),
    notes:
      query.trim() === ""
        ? [{ kind: "empty-query" as const, message: "import search requires a non-empty query" }]
        : [],
  });
}

export function buildTestsPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const query = options.query ?? "";
  const owner = findOwner(report, query);
  const edges = testEdges(report, owner, query);
  const hits = testHits(report, edges, query);
  const owners = uniqueOwners([
    ...ownersForPaths(report, [
      ...(owner ? [relPath(report, owner.path)] : []),
      ...edges.flatMap((edge) => [stripNodePrefix(edge.from), stripNodePrefix(edge.to)]),
    ]),
    ...ownersForHits(report, hits),
  ]);
  return basePacket(report, options, {
    header: {
      kind: "search-tests",
      fields: {
        q: query,
        own: owners.length,
        test: hits.length,
        edge: edges.length,
        view: "graph",
      },
    },
    nodes: owners.map((candidate) =>
      candidate.role.includes("test") || isTestOwnerPath(candidate.path)
        ? testNode(candidate)
        : ownerNode(candidate),
    ),
    edges,
    owners,
    hits,
    findings: [],
    nextActions: [
      ...hits.slice(0, 5).map((hit) => ({ kind: "owner" as const, target: hit.ownerPath })),
      ...(query.trim() === "" ? [] : [{ kind: "fzf" as const, target: query, scope: "tests" }]),
    ],
    notes: [
      ...(query.trim() === ""
        ? [
            {
              kind: "empty-query" as const,
              message: "tests search requires an owner, path, or symbol query",
            },
          ]
        : []),
      ...(owner === undefined && query.trim() !== ""
        ? [
            {
              kind: "owner-not-found" as const,
              message: `owner not found: ${query}; matching test paths only`,
            },
          ]
        : []),
    ],
  });
}

export function buildIngestPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const stdin = options.stdin ?? "";
  const detection = detectInput(stdin, report.reasoningTree.projectRoot);
  const hits = ingestHits(report, stdin, detection.source);
  const owners = ownersForHits(report, hits);
  const notes =
    detection.source === "unknown"
      ? [
          {
            kind: "unrecognized-input" as const,
            message: "pipe paths, rg -n, rg --json, git diff, or fd output",
          },
        ]
      : [];
  return basePacket(report, options, {
    header: {
      kind: "search-ingest",
      fields: {
        src: detection.source,
        in: detection.lineCount,
        own: owners.length,
        hit: hits.length,
      },
    },
    inputDetection: detection,
    nodes: owners.map((owner) => ownerNode(owner)),
    edges: [],
    owners,
    hits,
    findings: [],
    nextActions: owners
      .slice(0, 5)
      .map((owner) => ({ kind: "owner" as const, target: owner.path })),
    notes,
  });
}
