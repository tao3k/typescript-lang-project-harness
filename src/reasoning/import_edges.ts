import type {
  TypeScriptImportEdgeFact,
  TypeScriptModuleReport,
  TypeScriptNativeImportResolutionFact,
} from "../model.js";
import { resolveCandidatePath } from "./candidate_paths.js";

export function importEdges(
  moduleReport: TypeScriptModuleReport,
  modulePaths: ReadonlySet<string>,
): TypeScriptImportEdgeFact[] {
  return moduleReport.importResolutions.map((resolutionFact) =>
    importEdgeFromNativeResolution(moduleReport.path, resolutionFact, modulePaths),
  );
}

function importEdgeFromNativeResolution(
  fromPath: string,
  resolutionFact: TypeScriptNativeImportResolutionFact,
  modulePaths: ReadonlySet<string>,
): TypeScriptImportEdgeFact {
  const resolvedPath =
    resolutionFact.resolvedPath === undefined
      ? undefined
      : resolveCandidatePath(resolutionFact.resolvedPath, modulePaths);
  const edge: TypeScriptImportEdgeFact = {
    fromPath,
    moduleSpecifier: resolutionFact.moduleSpecifier,
    kind: resolutionFact.kind,
    isTypeOnly: resolutionFact.isTypeOnly,
    location: resolutionFact.location,
    resolution: resolutionFact.resolution,
  };
  return resolvedPath === undefined ? edge : { ...edge, toPath: resolvedPath };
}
