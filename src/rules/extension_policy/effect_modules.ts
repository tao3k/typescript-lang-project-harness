import path from "node:path";

import type {
  TypeScriptPackageExtensionFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningTree,
} from "../../model.js";

export function activeEffectExtension(
  extensions: readonly TypeScriptPackageExtensionFact[],
): TypeScriptPackageExtensionFact | undefined {
  return extensions.find(
    (extension) =>
      extension.name === "effect" && extension.activation !== "config-enabled-missing-dependency",
  );
}

export function effectPolicyIsActive(
  extensions: readonly TypeScriptPackageExtensionFact[],
): boolean {
  return activeEffectExtension(extensions) !== undefined;
}

export function sourceModules(tree: TypeScriptReasoningTree): readonly TypeScriptReasoningModule[] {
  return effectPolicySourceModules(tree).filter(
    (moduleReport) =>
      moduleReport.role !== "entrypoint" && !isEffectAdapterModule(tree, moduleReport),
  );
}

export function effectPolicySourceModules(
  tree: TypeScriptReasoningTree,
): readonly TypeScriptReasoningModule[] {
  return tree.modules.filter(
    (moduleReport) =>
      moduleReport.isValid &&
      moduleReport.role !== "test" &&
      moduleReport.role !== "declaration" &&
      moduleReport.role !== "config",
  );
}

export function isEffectAdapterModule(
  tree: TypeScriptReasoningTree,
  moduleReport: TypeScriptReasoningModule,
): boolean {
  const effectExtension = activeEffectExtension(tree.packageExtensions);
  if (effectExtension === undefined || effectExtension.adapterModulePatterns.length === 0) {
    return false;
  }
  const relativePath = normalizeProjectPath(path.relative(tree.projectRoot, moduleReport.path));
  return effectExtension.adapterModulePatterns.some((pattern) =>
    projectPathPatternMatches(normalizeProjectPath(pattern), relativePath),
  );
}

function normalizeProjectPath(projectPath: string): string {
  return projectPath.replace(/\\/g, "/").replace(/^\.\//u, "");
}

function projectPathPatternMatches(pattern: string, projectPath: string): boolean {
  return pathPatternSegmentsMatch(pathSegments(pattern), pathSegments(projectPath));
}

function pathSegments(projectPath: string): readonly string[] {
  return projectPath.split("/").filter(Boolean);
}

function pathPatternSegmentsMatch(
  patternSegments: readonly string[],
  candidateSegments: readonly string[],
): boolean {
  if (patternSegments.length === 0) {
    return candidateSegments.length === 0;
  }
  const [patternHead, ...patternTail] = patternSegments;
  if (patternHead === undefined) {
    return candidateSegments.length === 0;
  }
  if (patternHead === "**") {
    return (
      pathPatternSegmentsMatch(patternTail, candidateSegments) ||
      (candidateSegments.length > 0 &&
        pathPatternSegmentsMatch(patternSegments, candidateSegments.slice(1)))
    );
  }
  const [candidateHead, ...candidateTail] = candidateSegments;
  return (
    candidateHead !== undefined &&
    pathSegmentMatches(patternHead, candidateHead) &&
    pathPatternSegmentsMatch(patternTail, candidateTail)
  );
}

function pathSegmentMatches(pattern: string, candidate: string): boolean {
  if (!pattern.includes("*")) {
    return pattern === candidate;
  }
  return wildcardTextMatches(pattern, candidate, 0, 0);
}

function wildcardTextMatches(
  pattern: string,
  candidate: string,
  patternIndex: number,
  candidateIndex: number,
): boolean {
  if (patternIndex === pattern.length) {
    return candidateIndex === candidate.length;
  }
  if (pattern[patternIndex] === "*") {
    return (
      wildcardTextMatches(pattern, candidate, patternIndex + 1, candidateIndex) ||
      (candidateIndex < candidate.length &&
        wildcardTextMatches(pattern, candidate, patternIndex, candidateIndex + 1))
    );
  }
  return (
    candidateIndex < candidate.length &&
    pattern[patternIndex] === candidate[candidateIndex] &&
    wildcardTextMatches(pattern, candidate, patternIndex + 1, candidateIndex + 1)
  );
}
