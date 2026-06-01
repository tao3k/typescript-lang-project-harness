/**
 * Test association hit and edge builders.
 */

import type {
  TypeScriptHarnessReport,
  TypeScriptReasoningOwnerBranchFact,
  TypeScriptReasoningOwnerDependencyFact,
} from "../../model.js";
import { compareProjectPathsByRecency } from "./recency.js";
import type { SemanticSearchEdge, SemanticSearchHit } from "./types.js";
import { MAX_IMPORT_HITS } from "./types.js";
import {
  locationFromSource,
  ownerId,
  relPath,
  slashPath,
  stripNodePrefix,
  testId,
} from "./utils.js";

export function testEdges(
  report: TypeScriptHarnessReport,
  owner: TypeScriptReasoningOwnerBranchFact | undefined,
  query: string,
): readonly SemanticSearchEdge[] {
  const targetPath = owner ? relPath(report, owner.path) : slashPath(query.trim());
  if (targetPath === "") return [];
  return rankedTestEdgeMatches(report, targetPath, query)
    .map((dependency) => {
      const sourcePath = dependency.sourcePath;
      const testPath = dependency.testPath;
      return {
        from: ownerId(sourcePath),
        kind: "test" as const,
        to: testId(testPath),
        label: dependency.dependency.moduleSpecifier,
        location: locationFromSource(report, dependency.dependency.location),
        fields: {
          importKind: dependency.dependency.kind,
          typeOnly: dependency.dependency.isTypeOnly,
          resolution: dependency.dependency.resolution,
          match: dependency.reason,
          ...(dependency.viaOwner === undefined ? {} : { viaOwner: dependency.viaOwner }),
          ...(dependency.depth === undefined ? {} : { depth: dependency.depth }),
        },
      };
    })
    .slice(0, MAX_IMPORT_HITS);
}

interface TestEdgeMatch {
  readonly dependency: TypeScriptReasoningOwnerDependencyFact;
  readonly testPath: string;
  readonly sourcePath: string;
  readonly reason: "direct-import" | "transitive-import" | "test-path" | "specifier";
  readonly score: number;
  readonly viaOwner?: string;
  readonly depth?: number;
}

function rankedTestEdgeMatches(
  report: TypeScriptHarnessReport,
  targetPath: string,
  query: string,
): readonly TestEdgeMatch[] {
  const graph = ownerDependencyGraph(report);
  const byKey = new Map<string, TestEdgeMatch>();
  for (const dependency of report.reasoningTree.ownerDependencies) {
    if (!dependency.isTestContext || dependency.toPath === undefined) continue;
    const match = testEdgeMatch(report, dependency, targetPath, query, graph);
    if (match === undefined) continue;
    const key = `${match.sourcePath}:${match.testPath}`;
    const current = byKey.get(key);
    if (current === undefined || match.score > current.score) {
      byKey.set(key, match);
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      right.score - left.score ||
      compareProjectPathsByRecency(report.reasoningTree.projectRoot, left.testPath, right.testPath),
  );
}

function testEdgeMatch(
  report: TypeScriptHarnessReport,
  dependency: TypeScriptReasoningOwnerDependencyFact,
  targetPath: string,
  query: string,
  graph: ReadonlyMap<string, readonly string[]>,
): TestEdgeMatch | undefined {
  const testPath = relPath(report, dependency.fromPath);
  const toPath = relPath(report, dependency.toPath ?? "");
  if (toPath === targetPath || toPath.endsWith(`/${targetPath}`)) {
    return { dependency, testPath, sourcePath: toPath, reason: "direct-import", score: 8 };
  }
  if (testPath.includes(targetPath)) {
    return {
      dependency,
      testPath,
      sourcePath: targetPath,
      reason: "test-path",
      score: 4,
    };
  }
  if (dependency.moduleSpecifier.includes(query)) {
    return {
      dependency,
      testPath,
      sourcePath: toPath,
      reason: "specifier",
      score: 3,
    };
  }
  if (dependency.fromRole !== "test") return undefined;
  const depth = reachableDepth(graph, toPath, targetPath);
  if (depth === undefined) return undefined;
  return {
    dependency,
    testPath,
    sourcePath: targetPath,
    reason: "transitive-import",
    score: 6,
    viaOwner: toPath,
    depth,
  };
}

function ownerDependencyGraph(
  report: TypeScriptHarnessReport,
): ReadonlyMap<string, readonly string[]> {
  const graph = new Map<string, string[]>();
  for (const dependency of report.reasoningTree.ownerDependencies) {
    if (dependency.toPath === undefined || dependency.fromRole === "test") continue;
    const fromPath = relPath(report, dependency.fromPath);
    const toPath = relPath(report, dependency.toPath);
    const targets = graph.get(fromPath) ?? [];
    targets.push(toPath);
    graph.set(fromPath, targets);
  }
  return graph;
}

function reachableDepth(
  graph: ReadonlyMap<string, readonly string[]>,
  startPath: string,
  targetPath: string,
): number | undefined {
  const queue: { readonly path: string; readonly depth: number }[] = [
    { path: startPath, depth: 1 },
  ];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.path)) continue;
    seen.add(current.path);
    if (current.path === targetPath) return current.depth;
    if (current.depth >= 8) continue;
    for (const nextPath of graph.get(current.path) ?? []) {
      queue.push({ path: nextPath, depth: current.depth + 1 });
    }
  }
  return undefined;
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
