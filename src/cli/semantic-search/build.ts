/**
 * Semantic-search packet builders for all TypeScript CLI search views.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import {
  SEMANTIC_LANGUAGE_PROTOCOL_ID,
  SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
  TYPE_SCRIPT_BINARY,
  TYPE_SCRIPT_LANGUAGE_ID,
  TYPE_SCRIPT_PROVIDER_NAMESPACE,
  TYPE_SCRIPT_PROVIDER_ID,
  semanticSearchMethod,
} from "../semantic-language.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchEdge,
  SemanticSearchOwner,
  SemanticSearchPacket,
  SemanticSearchPacketPayload,
} from "./types.js";
import {
  MAX_FINDINGS,
  MAX_PRIME_EDGES,
  MAX_PRIME_OWNERS,
  MAX_WORKSPACE_EDGES,
  MAX_WORKSPACE_PACKAGES,
} from "./types.js";
import { detectInput, ingestHits } from "./ingest.js";
import { buildApiPacketPayload } from "./api.js";
import { buildDependencyPacketPayload, buildDepsPacketPayload } from "./dependency.js";
import { buildPublicExternalTypesPacketPayload } from "./public-external-types.js";
import { primeTypeScriptAxisNodes } from "./prime-axes.js";
import {
  edgeFact,
  findingGroups,
  findingNode,
  ownerFact,
  ownerNode,
  packageFact,
  packageNode,
  primeNextActions,
  rankedOwners,
  testNode,
  symbolNode,
  dependencyNodesForEdge,
  workspacePackageEdge,
  workspacePackageFact,
  workspacePackageNode,
  workspaceRootPackageFact,
} from "./facts.js";
import {
  callsiteHits,
  importEdges,
  importHits,
  ownersForHits,
  ownersForPaths,
  symbolHits,
  testEdges,
  testHits,
  textHits,
  uniqueOwners,
} from "./hits.js";
import { ownerFallback } from "./owner-fallback.js";
import { isTestOwnerPath } from "./test-path.js";
import { findOwner, relPath, stripNodePrefix } from "./utils.js";

export function buildSemanticSearchPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  switch (options.view) {
    case "workspace":
      return buildWorkspacePacket(report, options);
    case "prime":
      return buildPrimePacket(report, options);
    case "owner":
      return buildOwnerPacket(report, options);
    case "dependency":
      return basePacket(report, options, buildDependencyPacketPayload(report, options));
    case "deps":
      return basePacket(report, options, buildDepsPacketPayload(report, options));
    case "api":
      return basePacket(report, options, buildApiPacketPayload(report, options));
    case "public-external-types":
      return basePacket(report, options, buildPublicExternalTypesPacketPayload(report, options));
    case "symbol":
      return buildSymbolPacket(report, options);
    case "callsite":
      return buildCallsitePacket(report, options);
    case "import":
      return buildImportPacket(report, options);
    case "tests":
      return buildTestsPacket(report, options);
    case "text":
      return buildTextPacket(report, options);
    case "ingest":
      return buildIngestPacket(report, options);
  }
}

function buildWorkspacePacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const tree = report.reasoningTree;
  const workspacePackages = tree.workspacePackages.slice(0, MAX_WORKSPACE_PACKAGES);
  const packageFacts = [
    workspaceRootPackageFact(report),
    ...workspacePackages.map((workspacePackage) => workspacePackageFact(report, workspacePackage)),
  ];
  const packagePaths = new Set(
    workspacePackages.map((workspacePackage) => relPath(report, workspacePackage.path)),
  );
  const workspaceOwnerCount = tree.packageImportOwners.filter(
    (owner) => owner.ownerKind === "workspace",
  ).length;
  const edges = uniqueWorkspaceEdges(
    tree.packageImportOwners
      .filter((owner) => owner.ownerKind === "workspace")
      .filter((owner) => packagePaths.has(relPath(report, owner.packagePath)))
      .map((owner) => workspacePackageEdge(report, owner)),
  ).slice(0, MAX_WORKSPACE_EDGES);
  const findings = findingGroups(report).slice(0, MAX_FINDINGS);
  const nextActions = [
    ...workspacePackages.slice(0, 8).map((workspacePackage) => ({
      kind: "prime" as const,
      target: relPath(report, workspacePackage.path),
    })),
    ...(workspacePackages.length === 0 ? [{ kind: "prime" as const, target: "." }] : []),
  ];
  return basePacket(report, options, {
    header: {
      kind: "search-workspace",
      fields: {
        mode: workspacePackages.length > 0 ? "workspace-index" : "single-package",
        package: tree.packageName ?? ".",
        packages: tree.workspacePackages.length,
        shown: workspacePackages.length,
        edge: workspaceOwnerCount,
        external: tree.packageDependencies.length,
        find: report.findings.length,
      },
    },
    packages: packageFacts,
    nodes: [...packageFacts.map((pkg) => workspacePackageNode(pkg)), ...findings.map(findingNode)],
    edges,
    owners: [],
    hits: [],
    findings,
    nextActions,
    notes: [
      ...(workspacePackages.length === 0
        ? [
            {
              kind: "not-found" as const,
              message: "workspace packages not found; use search prime for the package map",
            },
          ]
        : []),
      ...(tree.workspacePackages.length > workspacePackages.length
        ? [
            {
              kind: "fact-scope" as const,
              message: `workspace package list capped at ${MAX_WORKSPACE_PACKAGES}`,
            },
          ]
        : []),
    ],
  });
}

function buildPrimePacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const tree = report.reasoningTree;
  const owners = rankedOwners(report)
    .slice(0, MAX_PRIME_OWNERS)
    .map((branch) => ownerFact(report, branch));
  const edgeSet = new Set(owners.map((owner) => owner.path));
  const edges = tree.ownerDependencies
    .filter((dependency) => dependency.toPath !== undefined)
    .map((dependency) => edgeFact(report, dependency))
    .filter(
      (edge) => edgeSet.has(stripNodePrefix(edge.from)) || edgeSet.has(stripNodePrefix(edge.to)),
    )
    .slice(0, MAX_PRIME_EDGES);
  const findings = findingGroups(report).slice(0, MAX_FINDINGS);
  const nextActions = primeNextActions(owners);
  const primeAxisNodes = primeTypeScriptAxisNodes(report);
  return basePacket(report, options, {
    header: {
      kind: "search-prime",
      fields: {
        mode: "package",
        package: tree.packageName ?? ".",
        sourceFiles: tree.modules.length,
        owners: tree.ownerBranches.length,
        edges: tree.ownerDependencies.length,
        findings: report.findings.length,
        extensions: tree.packageExtensions.length,
        buildTools: tree.packageBuildTools.length,
        workspaces: tree.workspacePackages.length,
        projectReferences: tree.projectReferences.length,
      },
    },
    packages: [packageFact(report)],
    nodes: [
      packageNode(report),
      ...primeAxisNodes,
      ...owners.map((owner) => ownerNode(owner)),
      ...findings.map((finding) => findingNode(finding)),
    ],
    edges,
    owners,
    hits: [],
    findings,
    nextActions,
    notes: [],
  });
}

function buildOwnerPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const query = options.query ?? "";
  const branch = findOwner(report, query);
  if (branch === undefined) {
    const fallback = ownerFallback(report, query);
    if (fallback !== undefined) {
      const owner = fallback.owner;
      return basePacket(report, options, {
        header: {
          kind: "search-owner",
          fields: {
            q: query,
            role: owner.role,
            public: owner.public,
            edge: 0,
            find: 0,
          },
        },
        nodes: [ownerNode(owner)],
        edges: [],
        owners: [owner],
        hits: [],
        findings: [],
        nextActions: owner.nextActions ?? [],
        notes: [
          {
            kind: "owner-not-found" as const,
            message: fallback.message,
          },
        ],
      });
    }

    return basePacket(report, options, {
      header: {
        kind: "search-owner",
        fields: { q: query, own: 0, edge: 0, find: 0 },
      },
      nodes: [],
      edges: [],
      owners: [],
      hits: [],
      findings: [],
      nextActions: [{ kind: "prime" as const, target: "search-prime" }],
      notes: [{ kind: "not-found" as const, message: `owner not found: ${query}` }],
    });
  }

  const owner = ownerFact(report, branch);
  const ownerPath = owner.path;
  const edges = report.reasoningTree.ownerDependencies
    .filter((dependency) => {
      const fromPath = relPath(report, dependency.fromPath);
      const toPath = dependency.toPath ? relPath(report, dependency.toPath) : undefined;
      return fromPath === ownerPath || toPath === ownerPath;
    })
    .map((dependency) => edgeFact(report, dependency))
    .slice(0, MAX_PRIME_EDGES);
  const findings = findingGroups(report).filter((finding) => finding.location.path === ownerPath);
  return basePacket(report, options, {
    header: {
      kind: "search-owner",
      fields: {
        q: query,
        role: owner.role,
        public: owner.public,
        edge: edges.length,
        find: findings.length,
      },
    },
    nodes: [ownerNode(owner), ...findings.map((finding) => findingNode(finding))],
    edges,
    owners: [owner],
    hits: [],
    findings,
    nextActions: owner.nextActions ?? [],
    notes: [],
  });
}

function buildTextPacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
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

function buildSymbolPacket(
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

function buildCallsitePacket(
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

function buildImportPacket(
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

function buildTestsPacket(
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
      ...(query.trim() === "" ? [] : [{ kind: "text" as const, target: query, scope: "tests" }]),
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

function buildIngestPacket(
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

function uniqueWorkspaceEdges(edges: readonly SemanticSearchEdge[]): readonly SemanticSearchEdge[] {
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

function basePacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
  packet: SemanticSearchPacketPayload,
): SemanticSearchPacket {
  return {
    schemaId: "agent.semantic-protocols.semantic-search-packet",
    schemaVersion: "1",
    protocolId: SEMANTIC_LANGUAGE_PROTOCOL_ID,
    protocolVersion: SEMANTIC_LANGUAGE_PROTOCOL_VERSION,
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    providerId: TYPE_SCRIPT_PROVIDER_ID,
    binary: TYPE_SCRIPT_BINARY,
    namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
    method: semanticSearchMethod(options.view),
    projectRoot: report.reasoningTree.projectRoot,
    ...(report.reasoningTree.packageName ? { packageName: report.reasoningTree.packageName } : {}),
    view: options.view,
    renderMode: options.renderMode ?? (options.view === "text" ? "hits" : "graph"),
    ...(options.query ? { query: options.query } : {}),
    header: packet.header,
    ...(packet.inputDetection ? { inputDetection: packet.inputDetection } : {}),
    ...(packet.packages ? { packages: packet.packages } : {}),
    nodes: packet.nodes,
    edges: packet.edges,
    owners: packet.owners,
    hits: packet.hits,
    findings: packet.findings,
    nextActions: packet.nextActions,
    notes: packet.notes,
  };
}
