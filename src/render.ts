import path from "node:path";

import {
  blockingFindings,
  fileCount,
  isTypeScriptHarnessClean,
  parsedCount,
  type TypeScriptHarnessFinding,
  type TypeScriptHarnessReport,
  type TypeScriptImportEdgeFact,
  type TypeScriptProjectHarnessAgentSnapshot,
  type TypeScriptReasoningImportSummaryFact,
  type TypeScriptReasoningOwnerBranchFact,
  type TypeScriptReasoningOwnerDependencyFact,
  type TypeScriptReasoningTree,
} from "./model.js";

export interface TypeScriptRenderOptions {
  readonly includeAdvice?: boolean;
}

export function renderTypeScriptProjectHarness(
  report: TypeScriptHarnessReport,
  options: TypeScriptRenderOptions = {},
): string {
  const includeAdvice = options.includeAdvice ?? true;
  const findings = includeAdvice
    ? report.findings
    : report.findings.filter((finding) => finding.severity !== "info");
  if (findings.length === 0) {
    return `[ok] typescript files=${fileCount(report)} parsed=${parsedCount(report)}`;
  }
  return findings.map((finding) => renderFinding(report, finding)).join("\n\n");
}

export function renderTypeScriptProjectHarnessJson(report: TypeScriptHarnessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderTypeScriptReasoningTree(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const sourceModules = tree.modules.filter(isAgentSourceModule);
  if (sourceModules.length === 0 && report.findings.length === 0) {
    return "";
  }
  const branchLines = tree.ownerBranches.map((branch) => renderOwnerBranch(tree, branch));
  const ownerDependencyLines = renderOwnerDependencyLines(tree);
  const findingGroupLines = renderFindingGroups(tree, report.findings);
  const lines = [
    renderModuleSummary(
      tree,
      sourceModules.length,
      branchLines.length,
      ownerDependencyLines.length,
      findingGroupLines.length,
    ),
  ];
  if (branchLines.length > 0) {
    lines.push("OwnerBranches:", ...branchLines);
  }
  if (ownerDependencyLines.length > 0) {
    lines.push("OwnerDependencies:", ...ownerDependencyLines);
  }
  if (findingGroupLines.length > 0) {
    lines.push("FindingGroups:", ...findingGroupLines);
  }
  return lines.join("\n");
}

export function renderTypeScriptProjectHarnessAgentSnapshot(
  snapshot: TypeScriptProjectHarnessAgentSnapshot,
): string {
  const packageSnapshots = snapshot.packages.flatMap((packageSnapshot) => {
    const rendered = renderTypeScriptReasoningTree(packageSnapshot.report);
    if (rendered.length === 0) {
      return [];
    }
    return [{ packagePath: packageSnapshot.packagePath, rendered }];
  });
  const includePackageHeading =
    packageSnapshots.length > 1 || (packageSnapshots[0]?.packagePath ?? ".") !== ".";
  return packageSnapshots
    .map(({ packagePath, rendered }) =>
      includePackageHeading ? `pkg ${packagePath}\n${rendered}` : rendered,
    )
    .join("\n");
}

export function renderTypeScriptProjectHarnessAdvice(report: TypeScriptHarnessReport): string {
  const advice = report.findings.filter((finding) => finding.severity === "info");
  if (advice.length === 0) {
    return "";
  }
  return advice.map((finding) => renderFinding(report, finding)).join("\n\n");
}

function renderModuleSummary(
  tree: TypeScriptReasoningTree,
  sourceModuleCount: number,
  branchCount: number,
  dependencyCount: number,
  findingGroupCount: number,
): string {
  const parts = [`source=${sourceModuleCount}`];
  pushMetricIf(parts, "roots", agentRootCount(tree), agentRootCount(tree) > 1);
  pushMetricIf(parts, "branches", branchCount, branchCount > 0);
  pushMetricIf(parts, "deps", dependencyCount, dependencyCount > 0);
  pushMetricIf(
    parts,
    "shadowed",
    tree.shadowedSourceOwners.length,
    tree.shadowedSourceOwners.length > 0,
  );
  pushMetricIf(
    parts,
    "orphaned",
    tree.orphanedSourceFiles.length,
    tree.orphanedSourceFiles.length > 0,
  );
  pushMetricIf(parts, "paths", tree.pathAliases.length, tree.pathAliases.length > 0);
  pushMetricIf(
    parts,
    "refs",
    tree.projectReferencePackages.length,
    tree.projectReferencePackages.length > 0,
  );
  pushMetricIf(
    parts,
    "workspaces",
    tree.workspacePackages.length,
    tree.workspacePackages.length > 0,
  );
  pushMetricIf(
    parts,
    "package-owners",
    tree.packageEntryResolutions.length,
    tree.packageEntryResolutions.length > 0,
  );
  pushMetricIf(parts, "findings", findingGroupCount, findingGroupCount > 0);
  return `Modules: ${parts.join(" ")}`;
}

function pushMetricIf(parts: string[], label: string, count: number, shouldRender: boolean): void {
  if (shouldRender) {
    parts.push(`${label}=${count}`);
  }
}

function renderNameList(names: readonly string[]): string {
  const visibleNames = names.slice(0, 8);
  const suffix =
    names.length > visibleNames.length ? `,+${names.length - visibleNames.length}` : "";
  return `${visibleNames.join(",")}${suffix}`;
}

function renderExportNameList(exportFacts: {
  readonly exportNames: readonly string[];
  readonly typeOnlyExportNames: readonly string[];
}): string {
  const typeOnlyNames = new Set(exportFacts.typeOnlyExportNames);
  return renderNameList(
    exportFacts.exportNames.map((name) => (typeOnlyNames.has(name) ? `type:${name}` : name)),
  );
}

function renderImportKind(importFact: {
  readonly kind: TypeScriptImportEdgeFact["kind"];
  readonly isTypeOnly: boolean;
}): string {
  return importFact.isTypeOnly ? `type-${importFact.kind}` : importFact.kind;
}

function isAgentSourceModule(moduleReport: TypeScriptReasoningTree["modules"][number]): boolean {
  return moduleReport.role !== "test";
}

function agentRootCount(tree: TypeScriptReasoningTree): number {
  return tree.modules.filter(
    (moduleReport) => moduleReport.role === "entrypoint" || moduleReport.role === "facade",
  ).length;
}

function renderOwnerBranch(
  tree: TypeScriptReasoningTree,
  branch: TypeScriptReasoningOwnerBranchFact,
): string {
  const exportsLabel =
    branch.exportNames.length === 0 ? "" : ` exports=${renderExportNameList(branch)}`;
  return ` - ${relativeToTree(tree, branch.path)} [${branch.roles.join(
    ", ",
  )}] owner=${branch.ownerNamespace}${displayImportSummary(branch.importSummary)}${exportsLabel} -> ${displayChildEdges(
    tree,
    branch.childEdges,
  )}`;
}

function displayImportSummary(summary: TypeScriptReasoningImportSummaryFact): string {
  if (summary.totalImports === 0) {
    return "";
  }
  const parts = [
    importCountLabel("relative", summary.relativeImports),
    importCountLabel("path-alias", summary.pathAliasImports),
    importCountLabel("package-import", summary.packageImportImports),
    importCountLabel("external", summary.externalImports),
    importCountLabel("unresolved", summary.unresolvedImports),
  ].filter((part): part is string => part !== undefined);
  return ` imports=${parts.join(",")}`;
}

function importCountLabel(label: string, count: number): string | undefined {
  return count === 0 ? undefined : `${label}:${count}`;
}

function displayChildEdges(
  tree: TypeScriptReasoningTree,
  edges: readonly TypeScriptImportEdgeFact[],
): string {
  if (edges.length === 0) {
    return "-";
  }
  const labels = edges.map((edge) => `${renderImportKind(edge)}:${edgeTarget(tree, edge)}`);
  return [...new Set(labels)].join(", ");
}

function edgeTarget(
  tree: TypeScriptReasoningTree,
  edge: TypeScriptImportEdgeFact | TypeScriptReasoningOwnerDependencyFact,
): string {
  return edge.toPath === undefined ? edge.moduleSpecifier : relativeToTree(tree, edge.toPath);
}

function renderOwnerDependencyLines(tree: TypeScriptReasoningTree): string[] {
  const edgeLines = tree.ownerDependencies
    .filter((edge) => !edge.isTestContext)
    .map(
      (edge) =>
        ` - ${relativeToTree(tree, edge.fromPath)} --${edge.resolution}/${renderImportKind(
          edge,
        )}--> ${edgeTarget(tree, edge)}`,
    );
  const packageImportOwnerLines = tree.packageImportOwners.map(
    (owner) =>
      ` - ${relativeToTree(tree, owner.fromPath)} --${owner.via}/${renderImportKind(
        owner,
      )}--> ${relativeToTree(tree, owner.packagePath)} owner=${owner.ownerKind}`,
  );
  const packageEntryLines = tree.packageEntryResolutions.map((entry) => {
    const source = `package ${entry.kind}:${entry.subpath}${packageConditionsLabel(entry.conditions)}`;
    const target = entry.toPath === undefined ? entry.target : relativeToTree(tree, entry.toPath);
    const edgeLabel = entry.resolution === "parser-visible" ? "owner" : entry.resolution;
    return ` - ${source} --${edgeLabel}--> ${target}`;
  });
  return [...new Set([...edgeLines, ...packageImportOwnerLines, ...packageEntryLines])].sort();
}

function renderFindingGroups(
  tree: TypeScriptReasoningTree,
  findings: readonly TypeScriptHarnessFinding[],
): string[] {
  const groups = new Map<string, { count: number; finding: TypeScriptHarnessFinding }>();
  for (const finding of findings) {
    const key = `${finding.severity}\0${finding.ruleId}\0${finding.title}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { count: 1, finding });
      continue;
    }
    group.count += 1;
  }
  return [...groups.values()]
    .sort((left, right) =>
      `${left.finding.severity}:${left.finding.ruleId}:${left.finding.title}`.localeCompare(
        `${right.finding.severity}:${right.finding.ruleId}:${right.finding.title}`,
      ),
    )
    .map(({ count, finding }) => {
      const firstPath =
        finding.location.path === undefined
          ? "<memory>"
          : relativeToTree(tree, finding.location.path);
      return ` - ${finding.severity} ${finding.ruleId} x${count} first=${firstPath} ${finding.title}`;
    });
}

function relativeToTree(tree: TypeScriptReasoningTree, pathValue: string): string {
  return path.relative(tree.projectRoot, pathValue) || ".";
}

function packageConditionsLabel(conditions: readonly string[]): string {
  return conditions.length === 0 ? "" : ` [${conditions.join("/")}]`;
}

export function renderAssertionMessage(report: TypeScriptHarnessReport): string {
  if (isTypeScriptHarnessClean(report)) {
    return renderTypeScriptProjectHarness(report);
  }
  return blockingFindings(report)
    .map((finding) => renderFinding(report, finding))
    .join("\n\n");
}

function renderFinding(report: TypeScriptHarnessReport, finding: TypeScriptHarnessFinding): string {
  const location = renderLocation(report, finding);
  const lines = [`[${finding.ruleId}] ${finding.severity}: ${finding.title}`, location];
  if (finding.sourceLine !== undefined) {
    lines.push(`> ${finding.sourceLine.trimEnd()}`);
  }
  lines.push(
    finding.label,
    `Help: ${compactProjectRootMentions(report.reasoningTree, finding.summary)}`,
    `Contract: ${finding.requirement}`,
  );
  return lines.join("\n");
}

function renderLocation(
  report: TypeScriptHarnessReport,
  finding: TypeScriptHarnessFinding,
): string {
  const rawPath = finding.location.path ?? "<project>";
  const displayPath =
    rawPath === "<project>"
      ? rawPath
      : path.relative(report.reasoningTree.projectRoot, rawPath) || ".";
  return `${displayPath}:${finding.location.line}:${finding.location.column + 1}`;
}

function compactProjectRootMentions(tree: TypeScriptReasoningTree, text: string): string {
  const projectRoot = path.resolve(tree.projectRoot);
  return text.split(`${projectRoot}${path.sep}`).join("").split(projectRoot).join(".");
}
