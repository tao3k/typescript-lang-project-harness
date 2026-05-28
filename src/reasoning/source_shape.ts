import type {
  TypeScriptPackageEntryResolutionFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningOwnerDependencyFact,
  TypeScriptReasoningSourceShadowFact,
} from "../model.js";
import { reasoningOwnerNamespace } from "./owner_facts.js";

export function shadowedSourceOwners(
  projectRoot: string,
  modules: readonly TypeScriptReasoningModule[],
  ownerDependencies: readonly TypeScriptReasoningOwnerDependencyFact[],
): TypeScriptReasoningSourceShadowFact[] {
  const pathsByOwner = new Map<string, string[]>();
  for (const moduleReport of modules.filter(isSourceShapeModule)) {
    const ownerNamespace = reasoningOwnerNamespace(projectRoot, moduleReport.path);
    pathsByOwner.set(ownerNamespace, [
      ...(pathsByOwner.get(ownerNamespace) ?? []),
      moduleReport.path,
    ]);
  }
  return [...pathsByOwner.entries()]
    .flatMap(([ownerNamespace, paths]) =>
      paths.length > 1 && !hasIntraOwnerExport(paths, ownerDependencies)
        ? [{ ownerNamespace, paths: [...paths].sort() }]
        : [],
    )
    .sort((left, right) => left.ownerNamespace.localeCompare(right.ownerNamespace));
}

export function orphanedSourceFiles(
  modules: readonly TypeScriptReasoningModule[],
  ownerDependencies: readonly TypeScriptReasoningOwnerDependencyFact[],
  packageEntryResolutions: readonly TypeScriptPackageEntryResolutionFact[],
): string[] {
  const sourceModules = modules.filter(isReachabilitySourceModule);
  const sourcePaths = new Set(sourceModules.map((moduleReport) => moduleReport.path));
  const rootPaths = sourceModules
    .filter((moduleReport) => isReachabilityRootModule(moduleReport, packageEntryResolutions))
    .map((moduleReport) => moduleReport.path);
  if (rootPaths.length === 0) {
    return [];
  }
  const outgoing = new Map<string, string[]>();
  for (const dependency of ownerDependencies) {
    if (
      dependency.isTestContext ||
      dependency.toPath === undefined ||
      !sourcePaths.has(dependency.fromPath) ||
      !sourcePaths.has(dependency.toPath)
    ) {
      continue;
    }
    outgoing.set(dependency.fromPath, [
      ...(outgoing.get(dependency.fromPath) ?? []),
      dependency.toPath,
    ]);
  }
  const reachable = reachableSourcePaths(rootPaths, outgoing);

  // Also reachable: files directly imported by any facade/entrypoint (package barrel pattern)
  for (const rootPath of rootPaths) {
    const children = outgoing.get(rootPath) ?? [];
    for (const child of children) {
      reachable.add(child);
    }
  }

  return sourceModules
    .filter((moduleReport) => moduleReport.role === "source" && !reachable.has(moduleReport.path))
    .map((moduleReport) => moduleReport.path)
    .sort();
}

function isSourceShapeModule(moduleReport: TypeScriptReasoningModule): boolean {
  return (
    moduleReport.role === "source" ||
    moduleReport.role === "facade" ||
    moduleReport.role === "entrypoint"
  );
}

function isReachabilitySourceModule(moduleReport: TypeScriptReasoningModule): boolean {
  return isSourceShapeModule(moduleReport);
}

function isReachabilityRootModule(
  moduleReport: TypeScriptReasoningModule,
  packageEntryResolutions: readonly TypeScriptPackageEntryResolutionFact[],
): boolean {
  return (
    moduleReport.role === "entrypoint" ||
    moduleReport.role === "facade" ||
    packageEntryResolutions.some(
      (entry) => entry.resolution === "parser-visible" && entry.toPath === moduleReport.path,
    )
  );
}

function hasIntraOwnerExport(
  paths: readonly string[],
  ownerDependencies: readonly TypeScriptReasoningOwnerDependencyFact[],
): boolean {
  const pathSet = new Set(paths);
  return ownerDependencies.some(
    (dependency) =>
      dependency.kind === "export" &&
      dependency.toPath !== undefined &&
      pathSet.has(dependency.fromPath) &&
      pathSet.has(dependency.toPath),
  );
}

function reachableSourcePaths(
  rootPaths: readonly string[],
  outgoing: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const reachable = new Set<string>();
  const stack = [...rootPaths].sort();
  while (stack.length > 0) {
    const nextPath = stack.pop();
    if (nextPath === undefined || reachable.has(nextPath)) {
      continue;
    }
    reachable.add(nextPath);
    for (const childPath of outgoing.get(nextPath) ?? []) {
      if (!reachable.has(childPath)) {
        stack.push(childPath);
      }
    }
  }
  return reachable;
}
