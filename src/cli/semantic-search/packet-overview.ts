/**
 * Semantic-search packet builders for workspace, prime, and owner views.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
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
  workspacePackageEdge,
  workspacePackageFact,
  workspacePackageNode,
  workspaceRootPackageFact,
} from "./facts.js";
import { ownerFallback } from "./owner-fallback.js";
import { basePacket } from "./packet-base.js";
import { primeTypeScriptAxisNodes } from "./prime-axes.js";
import type {
  SemanticSearchBuildOptions,
  SemanticSearchEdge,
  SemanticSearchPacket,
} from "./types.js";
import {
  MAX_FINDINGS,
  MAX_PRIME_EDGES,
  MAX_PRIME_OWNERS,
  MAX_WORKSPACE_EDGES,
  MAX_WORKSPACE_PACKAGES,
} from "./types.js";
import { findOwner, relPath, stripNodePrefix } from "./utils.js";
import { rankedWorkspacePackages } from "./workspace-ranking.js";

export function buildWorkspacePacket(
  report: TypeScriptHarnessReport,
  options: SemanticSearchBuildOptions,
): SemanticSearchPacket {
  const tree = report.reasoningTree;
  const workspacePackages = rankedWorkspacePackages(report).slice(0, MAX_WORKSPACE_PACKAGES);
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

export function buildPrimePacket(
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

export function buildOwnerPacket(
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
