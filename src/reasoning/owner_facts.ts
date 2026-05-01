import path from "node:path";

import type {
  TypeScriptImportEdgeFact,
  TypeScriptReasoningImportSummaryFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningOwnerBranchFact,
  TypeScriptReasoningOwnerBranchRole,
  TypeScriptReasoningOwnerDependencyFact,
} from "../model.js";

export function ownerBranches(
  projectRoot: string,
  modules: readonly TypeScriptReasoningModule[],
  edges: readonly TypeScriptImportEdgeFact[],
): TypeScriptReasoningOwnerBranchFact[] {
  return modules
    .filter((moduleReport) => moduleReport.role !== "test")
    .filter((moduleReport) =>
      shouldIncludeOwnerBranch(moduleReport, ownerBranchEdges(edges, moduleReport.path)),
    )
    .map((moduleReport) => ({
      path: moduleReport.path,
      ownerNamespace: ownerNamespace(projectRoot, moduleReport.path),
      roles: ownerBranchRoleLabels(moduleReport),
      hasIntentDoc: moduleReport.hasIntentDoc,
      importSummary: importSummary(moduleEdges(edges, moduleReport.path)),
      exportNames: moduleReport.exportNames,
      typeOnlyExportNames: moduleReport.typeOnlyExportNames,
      childEdges: ownerBranchEdges(edges, moduleReport.path),
    }))
    .sort(
      (left, right) =>
        Number(!left.roles.includes("root")) - Number(!right.roles.includes("root")) ||
        left.path.localeCompare(right.path),
    );
}

export function ownerDependencies(
  modules: readonly TypeScriptReasoningModule[],
  edges: readonly TypeScriptImportEdgeFact[],
): TypeScriptReasoningOwnerDependencyFact[] {
  const moduleByPath = new Map(modules.map((moduleReport) => [moduleReport.path, moduleReport]));
  const dependencies = edges.flatMap((edge) => {
    const fromModule = moduleByPath.get(edge.fromPath);
    const toModule = edge.toPath === undefined ? undefined : moduleByPath.get(edge.toPath);
    if (fromModule === undefined || edge.resolution === "external") {
      return [];
    }
    const dependency: TypeScriptReasoningOwnerDependencyFact = {
      fromPath: edge.fromPath,
      fromRole: fromModule.role,
      moduleSpecifier: edge.moduleSpecifier,
      kind: edge.kind,
      isTypeOnly: edge.isTypeOnly,
      isTestContext: fromModule.role === "test" || toModule?.role === "test",
      location: edge.location,
      resolution: edge.resolution,
    };
    if (edge.toPath === undefined) {
      return [dependency];
    }
    return [
      {
        ...dependency,
        toPath: edge.toPath,
        ...(toModule === undefined ? {} : { toRole: toModule.role }),
      },
    ];
  });
  return [
    ...new Map(dependencies.map((dependency) => [dependencyKey(dependency), dependency])).values(),
  ].sort((left, right) => dependencyKey(left).localeCompare(dependencyKey(right)));
}

function shouldIncludeOwnerBranch(
  moduleReport: TypeScriptReasoningModule,
  childEdges: readonly TypeScriptImportEdgeFact[],
): boolean {
  return (
    moduleReport.role === "entrypoint" ||
    moduleReport.role === "facade" ||
    moduleReport.role === "config" ||
    childEdges.length > 0
  );
}

function ownerBranchRoleLabels(
  moduleReport: TypeScriptReasoningModule,
): readonly TypeScriptReasoningOwnerBranchRole[] {
  const rootLabels =
    moduleReport.role === "entrypoint" || moduleReport.role === "facade" ? (["root"] as const) : [];
  return [...rootLabels, moduleReport.role];
}

function moduleEdges(
  edges: readonly TypeScriptImportEdgeFact[],
  modulePath: string,
): TypeScriptImportEdgeFact[] {
  return edges.filter((edge) => edge.fromPath === modulePath);
}

function ownerBranchEdges(
  edges: readonly TypeScriptImportEdgeFact[],
  modulePath: string,
): TypeScriptImportEdgeFact[] {
  return moduleEdges(edges, modulePath).filter(
    (edge) => edge.resolution !== "external" && edge.kind === "export",
  );
}

function importSummary(
  edges: readonly TypeScriptImportEdgeFact[],
): TypeScriptReasoningImportSummaryFact {
  return {
    totalImports: edges.length,
    relativeImports: countResolution(edges, "relative"),
    pathAliasImports: countResolution(edges, "path-alias"),
    packageImportImports: countResolution(edges, "package-import"),
    externalImports: countResolution(edges, "external"),
    unresolvedImports: countResolution(edges, "unresolved"),
  };
}

function countResolution(
  edges: readonly TypeScriptImportEdgeFact[],
  resolution: TypeScriptImportEdgeFact["resolution"],
): number {
  return edges.filter((edge) => edge.resolution === resolution).length;
}

function ownerNamespace(projectRoot: string, modulePath: string): string {
  const relativePath = path.relative(projectRoot, modulePath);
  const parsed = path.parse(relativePath);
  const withoutExtension = path.join(parsed.dir, parsed.name).replaceAll("\\", "/");
  if (parsed.name === "index") {
    return parsed.dir === "" ? "." : parsed.dir.replaceAll("\\", "/");
  }
  return withoutExtension;
}

function dependencyKey(dependency: TypeScriptReasoningOwnerDependencyFact): string {
  return [
    dependency.fromPath,
    dependency.resolution,
    dependency.kind,
    dependency.isTypeOnly ? "type" : "value",
    dependency.toPath ?? dependency.moduleSpecifier,
  ].join("\0");
}
