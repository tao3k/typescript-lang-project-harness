/**
 * Semantic-search owner, package, node, edge, and finding facts.
 */

import type {
  TypeScriptHarnessFinding,
  TypeScriptHarnessReport,
  TypeScriptPackageImportOwnerFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningOwnerBranchFact,
  TypeScriptReasoningOwnerDependencyFact,
  TypeScriptWorkspacePackageFact,
} from "../../model.js";
import type {
  SemanticSearchEdge,
  SemanticSearchFact,
  SemanticSearchFinding,
  SemanticSearchHit,
  SemanticSearchNextAction,
  SemanticSearchNode,
  SemanticSearchOwner,
} from "./types.js";
import { locationFromSource, locationPath, ownerId, relPath, testId } from "./utils.js";

export function rankedOwners(
  report: TypeScriptHarnessReport,
): readonly TypeScriptReasoningOwnerBranchFact[] {
  const findingPaths = new Set(
    report.findings.map((finding) => locationPath(report, finding.location)),
  );
  const dependencyCounts = new Map<string, number>();
  for (const dependency of report.reasoningTree.ownerDependencies) {
    const fromPath = relPath(report, dependency.fromPath);
    dependencyCounts.set(fromPath, (dependencyCounts.get(fromPath) ?? 0) + 1);
  }
  return [...report.reasoningTree.ownerBranches].sort((left, right) => {
    const scoreDiff =
      ownerRank(report, right, findingPaths, dependencyCounts) -
      ownerRank(report, left, findingPaths, dependencyCounts);
    return scoreDiff !== 0
      ? scoreDiff
      : relPath(report, left.path).localeCompare(relPath(report, right.path));
  });
}

export function ownerRank(
  report: TypeScriptHarnessReport,
  branch: TypeScriptReasoningOwnerBranchFact,
  findingPaths: ReadonlySet<string>,
  dependencyCounts: ReadonlyMap<string, number>,
): number {
  const rel = relPath(report, branch.path);
  let score = 0;
  if (branch.roles.includes("root") || branch.roles.includes("facade")) score += 100;
  if (branch.roles.includes("entrypoint")) score += 80;
  if (branch.exportNames.length > 0) score += 40;
  if (findingPaths.has(rel)) score += 30;
  score += Math.min(dependencyCounts.get(rel) ?? 0, 10);
  return score;
}

export function ownerFact(
  report: TypeScriptHarnessReport,
  branch: TypeScriptReasoningOwnerBranchFact,
): SemanticSearchOwner {
  const rel = relPath(report, branch.path);
  const nextActions = ownerNextActions(branch, rel);
  return {
    path: rel,
    namespace: branch.ownerNamespace,
    role: branch.roles.join(",") || "source",
    public: isPublicOwner(branch),
    exports: branch.exportNames,
    ...(nextActions.length > 0 ? { nextActions } : {}),
    fields: {
      imports: branch.importSummary.totalImports,
      external: branch.importSummary.externalImports,
      unresolved: branch.importSummary.unresolvedImports,
    },
  };
}

export function moduleOwnerFact(
  report: TypeScriptHarnessReport,
  moduleReport: TypeScriptReasoningModule,
): SemanticSearchOwner {
  const ownerPath = relPath(report, moduleReport.path);
  const nextActions: SemanticSearchNextAction[] = [
    { kind: "owner", target: ownerPath },
    { kind: "text", target: ownerPath, ownerPath },
  ];
  if (moduleReport.role === "test") {
    nextActions.push({ kind: "tests", target: ownerPath });
  }
  return {
    path: ownerPath,
    role: moduleReport.role,
    public: isPublicModule(moduleReport),
    exports: moduleReport.exportNames,
    nextActions,
    fields: {
      source: "parser-visible-module",
      parserOwner: false,
      layer: moduleReport.layer,
      lines: moduleReport.lineCount,
      valid: moduleReport.isValid,
      syntaxDiagnostics: moduleReport.syntaxDiagnosticCount,
      semanticDiagnostics: moduleReport.semanticDiagnosticCount,
      imports: moduleReport.importSpecifiers.length,
    },
  };
}

export function ownerNextActions(
  branch: TypeScriptReasoningOwnerBranchFact,
  ownerPath: string,
): readonly SemanticSearchNextAction[] {
  const actions: SemanticSearchNextAction[] = [{ kind: "owner", target: ownerPath }];
  const firstExport = branch.exportNames[0];
  if (firstExport !== undefined) {
    actions.push({ kind: "text", target: firstExport, ownerPath });
  }
  return actions;
}

export function isPublicOwner(branch: TypeScriptReasoningOwnerBranchFact): boolean {
  return (
    branch.roles.includes("root") ||
    branch.roles.includes("facade") ||
    branch.roles.includes("entrypoint") ||
    branch.exportNames.length > 0
  );
}

function isPublicModule(moduleReport: TypeScriptReasoningModule): boolean {
  return (
    moduleReport.role !== "test" &&
    (moduleReport.role === "facade" ||
      moduleReport.role === "entrypoint" ||
      moduleReport.exportNames.length > 0)
  );
}

export function edgeFact(
  report: TypeScriptHarnessReport,
  dependency: TypeScriptReasoningOwnerDependencyFact,
): SemanticSearchEdge {
  const fromPath = relPath(report, dependency.fromPath);
  const toPath = dependency.toPath
    ? relPath(report, dependency.toPath)
    : dependency.moduleSpecifier;
  return {
    from: ownerId(fromPath),
    kind: dependency.resolution === "unresolved" ? "unresolved-import" : "import",
    to: dependency.toPath ? ownerId(toPath) : `C:${dependency.moduleSpecifier}`,
    label: dependency.moduleSpecifier,
    location: locationFromSource(report, dependency.location),
    fields: {
      importKind: dependency.kind,
      typeOnly: dependency.isTypeOnly,
      test: dependency.isTestContext,
      resolution: dependency.resolution,
    },
  };
}

export function packageFact(report: TypeScriptHarnessReport): SemanticSearchFact {
  const tree = report.reasoningTree;
  return {
    id: tree.packageName ?? ".",
    fields: {
      root: ".",
      scripts: tree.packageScripts.map((script) => script.name).slice(0, 8),
      dependencies: tree.packageDependencies.length,
      exports: tree.packageExports.length,
      imports: tree.packageImports.length,
      workspaces: tree.workspacePackages.length,
    },
  };
}

export function packageNode(report: TypeScriptHarnessReport): SemanticSearchNode {
  const pkg = packageFact(report);
  return { id: `P:${pkg.id}`, kind: "package", path: ".", fields: pkg.fields };
}

export function workspaceRootPackageFact(report: TypeScriptHarnessReport): SemanticSearchFact {
  const tree = report.reasoningTree;
  return {
    id: ".",
    fields: {
      name: tree.packageName ?? ".",
      role: "workspace-root",
      packages: tree.workspacePackages.length,
      patterns: tree.workspacePatterns,
      dependencies: tree.packageDependencies.length,
      next: ["prime:."],
    },
  };
}

export function workspacePackageFact(
  report: TypeScriptHarnessReport,
  workspacePackage: TypeScriptWorkspacePackageFact,
): SemanticSearchFact {
  const packagePath = relPath(report, workspacePackage.path);
  return {
    id: packagePath,
    fields: {
      ...(workspacePackage.name === undefined ? {} : { name: workspacePackage.name }),
      role: "workspace-package",
      pattern: workspacePackage.pattern,
      ...(workspacePackage.packageType === undefined ? {} : { type: workspacePackage.packageType }),
      ...(workspacePackage.configPath === undefined
        ? {}
        : { config: relPath(report, workspacePackage.configPath) }),
      diagnostics: workspacePackage.diagnostics.length,
      next: [`prime:${packagePath}`],
    },
  };
}

export function workspacePackageNode(pkg: SemanticSearchFact): SemanticSearchNode {
  return {
    id: `P:${pkg.id}`,
    kind: "package",
    path: pkg.id,
    fields: pkg.fields,
  };
}

export function workspacePackageEdge(
  report: TypeScriptHarnessReport,
  owner: TypeScriptPackageImportOwnerFact,
): SemanticSearchEdge {
  const packagePath = relPath(report, owner.packagePath);
  return {
    from: "P:.",
    kind: "workspace",
    to: `P:${packagePath}`,
    label: owner.moduleSpecifier,
    location: locationFromSource(report, owner.location),
    fields: {
      importKind: owner.kind,
      typeOnly: owner.isTypeOnly,
      via: owner.via,
      package: owner.packageName,
      from: relPath(report, owner.fromPath),
    },
  };
}

export function ownerNode(owner: SemanticSearchOwner): SemanticSearchNode {
  return {
    id: ownerId(owner.path),
    kind: "owner",
    path: owner.path,
    fields: {
      role: owner.role,
      public: owner.public,
      exports: owner.exports ?? [],
      ...owner.fields,
    },
  };
}

export function testNode(owner: SemanticSearchOwner): SemanticSearchNode {
  return {
    id: testId(owner.path),
    kind: "test",
    path: owner.path,
    fields: {
      role: owner.role,
      exports: owner.exports ?? [],
      ...owner.fields,
    },
  };
}

export function symbolNode(hit: SemanticSearchHit): SemanticSearchNode {
  const symbol = hit.symbol ?? hit.location.path;
  return {
    id: `S:${symbol}@${hit.location.path}`,
    kind: "symbol",
    path: hit.location.path,
    fields: {
      symbol,
      owner: hit.ownerPath,
      ...(hit.fields ?? {}),
    },
  };
}

export function dependencyNodesForEdge(edge: SemanticSearchEdge): readonly SemanticSearchNode[] {
  const nodes: SemanticSearchNode[] = [];
  if (edge.from.startsWith("C:")) {
    nodes.push(dependencyNode(edge.from, edge.label));
  }
  if (edge.to.startsWith("C:")) {
    nodes.push(dependencyNode(edge.to, edge.label));
  }
  return nodes;
}

export function dependencyNode(id: string, label: string | undefined): SemanticSearchNode {
  return {
    id,
    kind: "dependency",
    fields: {
      import: label ?? id.slice(2),
    },
  };
}

export function findingNode(finding: SemanticSearchFinding): SemanticSearchNode {
  return {
    id: `F:${finding.ruleId}`,
    kind: "finding",
    path: finding.location.path,
    fields: { severity: finding.severity, count: finding.count },
  };
}

export function findingGroups(report: TypeScriptHarnessReport): readonly SemanticSearchFinding[] {
  const groups = new Map<string, { first: TypeScriptHarnessFinding; count: number }>();
  for (const finding of report.findings) {
    const key = `${finding.ruleId}:${locationPath(report, finding.location)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { first: finding, count: 1 });
    }
  }
  return [...groups.values()].map(({ first, count }) => ({
    ruleId: first.ruleId,
    severity: first.severity,
    count,
    title: first.title,
    location: locationFromSource(report, first.location),
    fields: { pack: first.packId },
  }));
}

export function primeNextActions(
  owners: readonly SemanticSearchOwner[],
): readonly SemanticSearchNextAction[] {
  const actions: SemanticSearchNextAction[] = [];
  for (const owner of owners.slice(0, 5)) {
    actions.push({ kind: "owner", target: owner.path });
    const firstExport = owner.exports?.[0];
    if (firstExport !== undefined) {
      actions.push({ kind: "text", target: firstExport, ownerPath: owner.path });
    }
  }
  return actions.slice(0, 8);
}
