/**
 * Ranking helpers for workspace router packets.
 */

import type { TypeScriptHarnessReport, TypeScriptWorkspacePackageFact } from "../../model.js";
import { isTestOwnerPath } from "./test-path.js";
import { relPath } from "./utils.js";

export type WorkspacePackageSurface = "source" | "docs" | "demo" | "test";

export function rankedWorkspacePackages(
  report: TypeScriptHarnessReport,
): readonly TypeScriptWorkspacePackageFact[] {
  return [...report.reasoningTree.workspacePackages].sort((left, right) => {
    const leftPath = relPath(report, left.path);
    const rightPath = relPath(report, right.path);
    return (
      workspacePackageRank(report, left, leftPath) -
        workspacePackageRank(report, right, rightPath) ||
      pathDepth(leftPath) - pathDepth(rightPath) ||
      leftPath.localeCompare(rightPath)
    );
  });
}

export function workspacePackageSurface(packagePath: string): WorkspacePackageSurface {
  if (isTestOwnerPath(packagePath) || packagePath.includes("/fixtures/")) {
    return "test";
  }
  if (packagePath === "docs" || packagePath.startsWith("docs/")) {
    return "docs";
  }
  if (packagePath === "playground" || packagePath.startsWith("playground/")) {
    return "demo";
  }
  return "source";
}

function workspacePackageRank(
  report: TypeScriptHarnessReport,
  workspacePackage: TypeScriptWorkspacePackageFact,
  packagePath: string,
): number {
  const surface = workspacePackageSurface(packagePath);
  const surfaceRank =
    surface === "source" ? 0 : surface === "docs" ? 10 : surface === "demo" ? 20 : 40;
  const patternRank =
    workspacePackage.pattern.includes("__tests__") || workspacePackage.pattern.includes("**")
      ? 10
      : 0;
  const edgeRank = workspaceImportCount(report, workspacePackage.path) > 0 ? -5 : 0;
  return surfaceRank + patternRank + edgeRank;
}

function workspaceImportCount(report: TypeScriptHarnessReport, packagePath: string): number {
  return report.reasoningTree.packageImportOwners.filter(
    (owner) => owner.ownerKind === "workspace" && owner.packagePath === packagePath,
  ).length;
}

function pathDepth(value: string): number {
  return value === "." ? 0 : value.split("/").length;
}
