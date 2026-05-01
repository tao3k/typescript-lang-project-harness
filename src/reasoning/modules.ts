import path from "node:path";

import type {
  TypeScriptModuleLayer,
  TypeScriptModuleReport,
  TypeScriptModuleRole,
  TypeScriptPackageEntryResolutionFact,
  TypeScriptProjectHarnessScope,
  TypeScriptReasoningModule,
} from "../model.js";
import { CONFIG_FILE_STEMS, MODULE_FILE_EXTENSIONS } from "./constants.js";
import { isInsideAny } from "./path_utils.js";

export function reasoningModules(
  scope: TypeScriptProjectHarnessScope,
  modules: readonly TypeScriptModuleReport[],
  entrypointOwnerPaths: ReadonlySet<string>,
): TypeScriptReasoningModule[] {
  return modules
    .map((moduleReport) =>
      reasoningModuleFromRole(
        scope.projectRoot,
        moduleReport,
        moduleRole(scope, moduleReport, entrypointOwnerPaths),
      ),
    )
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function explicitReasoningModules(
  projectRoot: string,
  modules: readonly TypeScriptModuleReport[],
): TypeScriptReasoningModule[] {
  return modules
    .map((moduleReport) =>
      reasoningModuleFromRole(projectRoot, moduleReport, explicitModuleRole(moduleReport)),
    )
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function packageBinOwnerPaths(
  packageEntryResolutions: readonly TypeScriptPackageEntryResolutionFact[],
): ReadonlySet<string> {
  return new Set(
    packageEntryResolutions.flatMap((entry) =>
      entry.kind === "bin" && entry.toPath !== undefined ? [entry.toPath] : [],
    ),
  );
}

function reasoningModuleFromRole(
  projectRoot: string,
  moduleReport: TypeScriptModuleReport,
  role: TypeScriptModuleRole,
): TypeScriptReasoningModule {
  return {
    path: moduleReport.path,
    role,
    layer: moduleLayer(projectRoot, moduleReport.path, role),
    isValid: moduleReport.isValid,
    hasIntentDoc: moduleReport.hasIntentDoc,
    lineCount: moduleReport.lineCount,
    syntaxDiagnosticCount: moduleReport.diagnostics.length,
    semanticDiagnosticCount: moduleReport.semanticDiagnostics.length,
    exportNames: moduleReport.exports.map((exportFact) => exportFact.name).sort(),
    typeOnlyExportNames: moduleReport.exports
      .filter((exportFact) => exportFact.isTypeOnly)
      .map((exportFact) => exportFact.name)
      .sort(),
    importSpecifiers: moduleReport.imports.map((importFact) => importFact.moduleSpecifier).sort(),
  };
}

function moduleLayer(
  projectRoot: string,
  modulePath: string,
  role: TypeScriptModuleRole,
): TypeScriptModuleLayer {
  const relativePath = path.relative(projectRoot, modulePath);
  if (role === "test") {
    return "test";
  }
  if (role === "config") {
    return "config";
  }
  if (
    relativePath === "src/parser.ts" ||
    relativePath.startsWith(`src${path.sep}parser${path.sep}`)
  ) {
    return "parser";
  }
  if (
    relativePath === "src/reasoning.ts" ||
    relativePath.startsWith(`src${path.sep}reasoning${path.sep}`)
  ) {
    return "reasoning";
  }
  if (
    relativePath === "src/rules.ts" ||
    relativePath.startsWith(`src${path.sep}rules${path.sep}`)
  ) {
    return "policy";
  }
  if (relativePath === "src/render.ts") {
    return "render";
  }
  if (relativePath === "src/model.ts") {
    return "model";
  }
  if (relativePath.startsWith(`src${path.sep}`)) {
    return "harness";
  }
  return "unknown";
}

function moduleRole(
  scope: TypeScriptProjectHarnessScope,
  moduleReport: TypeScriptModuleReport,
  entrypointOwnerPaths: ReadonlySet<string>,
): TypeScriptModuleRole {
  if (moduleReport.isDeclarationFile) {
    return "declaration";
  }
  const filePath = moduleReport.path;
  const fileName = path.basename(filePath);
  if (isInsideAny(filePath, scope.testPaths) || isTestFileName(fileName)) {
    return "test";
  }
  if (isConfigFileName(fileName)) {
    return "config";
  }
  if (isEntryPointPath(filePath) || entrypointOwnerPaths.has(filePath)) {
    return "entrypoint";
  }
  if (isFacadePath(scope, filePath)) {
    return "facade";
  }
  if (isInsideAny(filePath, scope.sourcePaths)) {
    return "source";
  }
  return "unknown";
}

function explicitModuleRole(moduleReport: TypeScriptModuleReport): TypeScriptModuleRole {
  if (moduleReport.isDeclarationFile) {
    return "declaration";
  }
  const filePath = moduleReport.path;
  const fileName = path.basename(filePath);
  if (isTestFileName(fileName)) {
    return "test";
  }
  if (isConfigFileName(fileName)) {
    return "config";
  }
  if (isEntryPointPath(filePath)) {
    return "entrypoint";
  }
  if (moduleFileNames("index").includes(fileName)) {
    return "facade";
  }
  return moduleReport.scriptKind === "unknown" ? "unknown" : "source";
}

function isEntryPointPath(filePath: string): boolean {
  const fileName = path.basename(filePath);
  if (moduleFileNames("main").includes(fileName)) {
    return true;
  }
  return path.basename(path.dirname(filePath)) === "bin";
}

function isFacadePath(scope: TypeScriptProjectHarnessScope, filePath: string): boolean {
  const fileName = path.basename(filePath);
  return moduleFileNames("index").includes(fileName) && isInsideAny(filePath, scope.sourcePaths);
}

function isTestFileName(fileName: string): boolean {
  return MODULE_FILE_EXTENSIONS.some(
    (extension) => fileName.endsWith(`.test${extension}`) || fileName.endsWith(`.spec${extension}`),
  );
}

function isConfigFileName(fileName: string): boolean {
  return CONFIG_FILE_STEMS.some((stem) => moduleFileNames(stem).includes(fileName));
}

function moduleFileNames(stem: string): readonly string[] {
  return MODULE_FILE_EXTENSIONS.map((extension) => `${stem}${extension}`);
}
