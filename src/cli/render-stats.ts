import type { TypeScriptHarnessReport } from "../model.js";

/** Render project statistics in one compact line. */
export function renderStats(report: TypeScriptHarnessReport): string {
  const tree = report.reasoningTree;
  const findings = report.findings;
  const blocking = findings.filter((f) => f.severity === "error");
  const advisory = findings.filter((f) => f.severity === "warning" || f.severity === "info");
  const modules = tree.modules.length;
  const branches = tree.ownerBranches.length;
  const deps = tree.ownerDependencies.filter((d) => !d.isTestContext).length;

  const parts = [
    `files=${modules}`,
    `branches=${branches}`,
    `deps=${deps}`,
    `errors=${blocking.length}`,
    `advice=${advisory.length}`,
  ];

  if (tree.orphanedSourceFiles.length > 0) {
    parts.push(`orphaned=${tree.orphanedSourceFiles.length}`);
  }
  if (tree.pathAliases.length > 0) {
    parts.push(`paths=${tree.pathAliases.length}`);
  }
  if (tree.workspacePackages.length > 0) {
    parts.push(`workspaces=${tree.workspacePackages.length}`);
  }
  if (tree.packageExtensions.length > 0) {
    parts.push(`ext=${tree.packageExtensions.length}`);
  }
  if (tree.packageBuildTools.length > 0) {
    parts.push(`tools=${tree.packageBuildTools.length}`);
  }

  return `[stats] ${parts.join(", ")}\n`;
}
