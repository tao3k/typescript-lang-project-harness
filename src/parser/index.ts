import path from "node:path";

import ts from "typescript";

import type {
  TypeScriptHarnessConfig,
  TypeScriptModuleReport,
  TypeScriptProjectHarnessScope,
} from "../model.js";
import { readTypeScriptConfigFacts, readTypeScriptProgramInputs } from "./config.js";
import {
  DEFAULT_IGNORED_DIR_NAMES,
  discoverTypeScriptFiles,
  existingChildPaths,
  isTypeScriptSourcePath,
  packageProjectRoot,
  pathFromInput,
} from "./files.js";
import { readPackageJsonFacts } from "./package_json.js";
import { resolveNativeImportFact } from "./resolution.js";
import {
  collectImportFacts,
  moduleReportFromSourceFile,
  parseTypeScriptSourceFile,
} from "./source_file.js";
import { nativeDiagnosticFromTsDiagnostic } from "./diagnostics.js";

export {
  DEFAULT_IGNORED_DIR_NAMES,
  discoverTypeScriptFiles,
  isTypeScriptSourcePath,
  parseTypeScriptSourceFile,
  pathFromInput,
};

export function readProjectScope(
  projectRootInput: string | URL,
  config: Pick<
    TypeScriptHarnessConfig,
    "ignoredDirNames" | "includeTests" | "sourceDirNames" | "testDirNames"
  >,
): TypeScriptProjectHarnessScope {
  const projectRoot = packageProjectRoot(pathFromInput(projectRootInput));
  const configFacts = readTypeScriptConfigFacts(projectRoot);
  const packageJson = readPackageJsonFacts(projectRoot);
  return {
    projectRoot,
    sourcePaths: existingChildPaths(projectRoot, config.sourceDirNames),
    testPaths: config.includeTests ? existingChildPaths(projectRoot, config.testDirNames) : [],
    config: configFacts,
    packageJson,
  };
}

export function projectFileNames(
  scope: TypeScriptProjectHarnessScope,
  config: Pick<TypeScriptHarnessConfig, "ignoredDirNames">,
): string[] {
  if (scope.config.fileNames.length > 0) {
    return [...scope.config.fileNames].sort();
  }
  const fallbackRoots =
    scope.sourcePaths.length > 0 || scope.testPaths.length > 0
      ? [...scope.sourcePaths, ...scope.testPaths]
      : [scope.projectRoot];
  return discoverTypeScriptFiles(fallbackRoots, config.ignoredDirNames);
}

export function parseTypeScriptProjectFiles(
  scope: TypeScriptProjectHarnessScope,
  fileNames: readonly string[],
): TypeScriptModuleReport[] {
  const programInputs = readTypeScriptProgramInputs(scope);
  const rootNames = [...fileNames].map((fileName) => path.resolve(fileName)).sort();
  const host = ts.createCompilerHost(programInputs.options, true);
  const createProgramOptions: ts.CreateProgramOptions = {
    rootNames,
    options: programInputs.options,
    host,
  };
  const program = ts.createProgram(
    programInputs.projectReferences === undefined
      ? createProgramOptions
      : { ...createProgramOptions, projectReferences: programInputs.projectReferences },
  );
  const resolutionCache = ts.createModuleResolutionCache(
    scope.projectRoot,
    (fileName) => fileName,
    programInputs.options,
  );
  return rootNames.map((fileName) => {
    const sourceFile = program.getSourceFile(fileName);
    if (sourceFile === undefined) {
      return parseTypeScriptSourceFile(fileName);
    }
    return moduleReportFromSourceFile(
      sourceFile,
      program
        .getSyntacticDiagnostics(sourceFile)
        .map((diagnostic) =>
          nativeDiagnosticFromTsDiagnostic(diagnostic, fileName, sourceFile.text),
        ),
      program
        .getSemanticDiagnostics(sourceFile)
        .map((diagnostic) =>
          nativeDiagnosticFromTsDiagnostic(diagnostic, fileName, sourceFile.text),
        ),
      collectImportFacts(sourceFile).map((importFact) =>
        resolveNativeImportFact(
          scope,
          sourceFile.fileName,
          importFact,
          programInputs.options,
          resolutionCache,
        ),
      ),
    );
  });
}
