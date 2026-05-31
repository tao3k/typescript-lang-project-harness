import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import type {
  PackageJsonEntryTargetFact,
  PackageJsonFacts,
  PackageJsonScriptFact,
  PackageJsonWorkspaceFact,
  SourceLocation,
  TypeScriptCompilerOptionFacts,
  TypeScriptProjectReferencePackageFact,
} from "../model.js";
import { compilerOptionFacts } from "./compiler_options.js";
import { locationForNode } from "./diagnostics.js";
import { packageBuildToolFacts } from "./package_build_tools.js";
import { packageDependencyFacts } from "./package_dependencies.js";
import { packageExtensionFacts } from "./package_extensions.js";
import {
  jsonObjectProperty,
  jsonPropertyNameText,
  packageJsonProperty,
  packageJsonPropertyLocation,
  parsePackageJsonDocument,
} from "./package_document.js";
import type { ParsedPackageJsonDocument } from "./types.js";
import { workspacePackageFacts } from "./workspace_packages.js";

export function readPackageJsonFacts(projectRoot: string): PackageJsonFacts {
  const packagePath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packagePath)) {
    return {
      hasExports: false,
      hasImports: false,
      entrypoints: [],
      exports: [],
      imports: [],
      bins: [],
      dependencies: [],
      scripts: [],
      workspaces: [],
      workspacePackages: [],
      packageExtensions: [],
      packageBuildTools: [],
      scriptNames: [],
      workspacePatterns: [],
      diagnostics: [],
    };
  }
  const rawJson = fs.readFileSync(packagePath, "utf8");
  const document = parsePackageJsonDocument(packagePath, rawJson);
  const parsed = document.packageJson;
  const scripts = packageScriptFacts(document);
  const workspaces = packageWorkspaceFacts(document);
  const workspacePackages = workspacePackageFacts(projectRoot, workspaces);
  const facts: PackageJsonFacts = {
    path: packagePath,
    hasExports: parsed.exports !== undefined,
    hasImports: parsed.imports !== undefined,
    entrypoints: packageEntrypointFacts(document),
    exports: packageEntryFacts(document, parsed.exports, "exports"),
    imports: packageEntryFacts(document, parsed.imports, "imports"),
    bins: packageBinFacts(
      document,
      parsed.bin,
      typeof parsed.name === "string" ? parsed.name : undefined,
    ),
    dependencies: packageDependencyFacts(document),
    scripts,
    workspaces,
    workspacePackages,
    packageExtensions: packageExtensionFacts(document),
    packageBuildTools: packageBuildToolFacts(projectRoot, document, scripts),
    scriptNames: scripts.map((script) => script.name),
    workspacePatterns: workspaces.map((workspace) => workspace.pattern),
    diagnostics: document.diagnostics,
  };
  if (typeof parsed.name === "string") {
    return typeof parsed.type === "string"
      ? { ...facts, name: parsed.name, packageType: parsed.type }
      : { ...facts, name: parsed.name };
  }
  if (typeof parsed.type === "string") {
    return { ...facts, packageType: parsed.type };
  }
  return facts;
}

export function projectReferencePackageFacts(
  projectReferences: readonly string[],
): TypeScriptProjectReferencePackageFact[] {
  return projectReferences
    .map((referencePath) => projectReferencePackageFact(referencePath))
    .filter((fact): fact is TypeScriptProjectReferencePackageFact => fact !== undefined)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function packageEntryFacts(
  document: ParsedPackageJsonDocument,
  value: unknown,
  kind: "exports" | "imports",
): PackageJsonFacts["exports"] {
  if (value === undefined) {
    return [];
  }
  const property = packageJsonProperty(document, kind);
  const fallbackLocation = packageJsonPropertyLocation(document, kind);
  const initializer = property?.initializer;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [
      packageEntryFact(
        ".",
        packageTargetDetails(document, initializer, value, [], fallbackLocation),
        fallbackLocation,
      ),
    ];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const explicitEntries = entries.filter(([key]) =>
    kind === "exports" ? key.startsWith(".") : key.startsWith("#"),
  );
  if (explicitEntries.length === 0) {
    return [
      packageEntryFact(
        ".",
        packageTargetDetails(document, initializer, value, [], fallbackLocation),
        fallbackLocation,
      ),
    ];
  }
  const valueObject =
    property !== undefined && ts.isObjectLiteralExpression(property.initializer)
      ? property.initializer
      : undefined;
  return explicitEntries
    .map(([subpath, entryValue]) => {
      const entryProperty =
        valueObject === undefined ? undefined : jsonObjectProperty(valueObject, subpath);
      const entryLocation =
        entryProperty === undefined
          ? fallbackLocation
          : locationForNode(document.sourceFile, entryProperty);
      return packageEntryFact(
        subpath,
        packageTargetDetails(document, entryProperty?.initializer, entryValue, [], entryLocation),
        entryLocation,
      );
    })
    .sort((left, right) => left.subpath.localeCompare(right.subpath));
}

function packageEntrypointFacts(
  document: ParsedPackageJsonDocument,
): PackageJsonFacts["entrypoints"] {
  const packageJson = document.packageJson;
  return [
    packageEntrypointFact(document, "main", packageJson.main),
    packageEntrypointFact(document, "module", packageJson.module),
    packageEntrypointFact(document, "types", packageJson.types),
    packageEntrypointFact(document, "typings", packageJson.typings),
    packageEntrypointFact(document, "browser", packageJson.browser),
  ]
    .filter((entry): entry is PackageJsonFacts["entrypoints"][number] => entry !== undefined)
    .sort((left, right) => left.subpath.localeCompare(right.subpath));
}

function packageEntrypointFact(
  document: ParsedPackageJsonDocument,
  fieldName: string,
  value: unknown,
): PackageJsonFacts["entrypoints"][number] | undefined {
  const property = packageJsonProperty(document, fieldName);
  const location = packageJsonPropertyLocation(document, fieldName);
  const targetDetails = packageTargetDetails(
    document,
    property?.initializer,
    value,
    [],
    location,
    false,
  );
  return targetDetails.length === 0
    ? undefined
    : packageEntryFact(fieldName, targetDetails, location);
}

function packageEntryFact(
  subpath: string,
  targetDetails: readonly PackageJsonEntryTargetFact[],
  location: SourceLocation,
): PackageJsonFacts["entrypoints"][number] {
  return {
    subpath,
    targets: targetDetails.map((targetDetail) => targetDetail.target),
    targetDetails,
    location,
  };
}

function packageTargetDetails(
  document: ParsedPackageJsonDocument,
  node: ts.Expression | undefined,
  value: unknown,
  conditions: readonly string[],
  fallbackLocation: SourceLocation,
  trackObjectKeys = true,
): PackageJsonEntryTargetFact[] {
  const nativeTargets =
    node === undefined
      ? []
      : packageTargetDetailsFromNode(document, node, conditions, trackObjectKeys);
  return nativeTargets.length > 0
    ? nativeTargets
    : packageTargetDetailsFromValue(value, conditions, fallbackLocation, trackObjectKeys);
}

function packageTargetDetailsFromNode(
  document: ParsedPackageJsonDocument,
  node: ts.Expression,
  conditions: readonly string[],
  trackObjectKeys: boolean,
): PackageJsonEntryTargetFact[] {
  if (ts.isStringLiteral(node)) {
    return [
      { target: node.text, conditions, location: locationForNode(document.sourceFile, node) },
    ];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) =>
      packageTargetDetailsFromNode(document, element, conditions, trackObjectKeys),
    );
  }
  if (!ts.isObjectLiteralExpression(node)) {
    return [];
  }
  return node.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return [];
    }
    const condition = jsonPropertyNameText(property.name);
    const nextConditions =
      condition === undefined || !trackObjectKeys ? conditions : [...conditions, condition];
    return condition === undefined
      ? []
      : packageTargetDetailsFromNode(
          document,
          property.initializer,
          nextConditions,
          trackObjectKeys,
        );
  });
}

function packageTargetDetailsFromValue(
  value: unknown,
  conditions: readonly string[],
  fallbackLocation: SourceLocation,
  trackObjectKeys: boolean,
): PackageJsonEntryTargetFact[] {
  if (typeof value === "string") {
    return [{ target: value, conditions, location: fallbackLocation }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((element) =>
      packageTargetDetailsFromValue(element, conditions, fallbackLocation, trackObjectKeys),
    );
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([condition, nestedValue]) => {
    const nextConditions = trackObjectKeys ? [...conditions, condition] : conditions;
    return packageTargetDetailsFromValue(
      nestedValue,
      nextConditions,
      fallbackLocation,
      trackObjectKeys,
    );
  });
}

function packageBinFacts(
  document: ParsedPackageJsonDocument,
  value: unknown,
  packageName: string | undefined,
): PackageJsonFacts["bins"] {
  if (value === undefined) {
    return [];
  }
  const property = packageJsonProperty(document, "bin");
  const fallbackLocation = packageJsonPropertyLocation(document, "bin");
  if (typeof value === "string") {
    return [
      packageEntryFact(
        packageName ?? ".",
        packageTargetDetails(document, property?.initializer, value, [], fallbackLocation, false),
        fallbackLocation,
      ),
    ];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  const valueObject =
    property !== undefined && ts.isObjectLiteralExpression(property.initializer)
      ? property.initializer
      : undefined;
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([subpath, target]) =>
      packageBinFact(document, valueObject, fallbackLocation, subpath, target),
    )
    .sort((left, right) => left.subpath.localeCompare(right.subpath));
}

function packageBinFact(
  document: ParsedPackageJsonDocument,
  valueObject: ts.ObjectLiteralExpression | undefined,
  fallbackLocation: SourceLocation,
  subpath: string,
  target: unknown,
): PackageJsonFacts["bins"] {
  if (typeof target !== "string") {
    return [];
  }
  const entryProperty =
    valueObject === undefined ? undefined : jsonObjectProperty(valueObject, subpath);
  const entryLocation =
    entryProperty === undefined
      ? fallbackLocation
      : locationForNode(document.sourceFile, entryProperty);
  return [
    packageEntryFact(
      subpath,
      packageTargetDetails(document, entryProperty?.initializer, target, [], entryLocation, false),
      entryLocation,
    ),
  ];
}

function packageScriptFacts(document: ParsedPackageJsonDocument): PackageJsonScriptFact[] {
  const property = packageJsonProperty(document, "scripts");
  if (property === undefined || !ts.isObjectLiteralExpression(property.initializer)) {
    return [];
  }
  return property.initializer.properties
    .flatMap((scriptProperty) => {
      if (
        !ts.isPropertyAssignment(scriptProperty) ||
        !ts.isStringLiteral(scriptProperty.initializer)
      ) {
        return [];
      }
      const name = jsonPropertyNameText(scriptProperty.name);
      return name === undefined
        ? []
        : [
            {
              name,
              command: scriptProperty.initializer.text,
              location: locationForNode(document.sourceFile, scriptProperty),
            },
          ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function packageWorkspaceFacts(document: ParsedPackageJsonDocument): PackageJsonWorkspaceFact[] {
  const property = packageJsonProperty(document, "workspaces");
  if (property === undefined) {
    return [];
  }
  if (ts.isArrayLiteralExpression(property.initializer)) {
    return packageWorkspaceFactsFromArray(document, property.initializer);
  }
  if (!ts.isObjectLiteralExpression(property.initializer)) {
    return [];
  }
  const packagesProperty = jsonObjectProperty(property.initializer, "packages");
  if (
    packagesProperty === undefined ||
    !ts.isArrayLiteralExpression(packagesProperty.initializer)
  ) {
    return [];
  }
  return packageWorkspaceFactsFromArray(document, packagesProperty.initializer);
}

function packageWorkspaceFactsFromArray(
  document: ParsedPackageJsonDocument,
  arrayExpression: ts.ArrayLiteralExpression,
): PackageJsonWorkspaceFact[] {
  return arrayExpression.elements
    .flatMap((element) =>
      ts.isStringLiteral(element)
        ? [{ pattern: element.text, location: locationForNode(document.sourceFile, element) }]
        : [],
    )
    .sort((left, right) => left.pattern.localeCompare(right.pattern));
}

function projectReferencePackageFact(
  referencePath: string,
): TypeScriptProjectReferencePackageFact | undefined {
  const packageRoot = projectReferencePackageRoot(referencePath);
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }
  const configCandidate = path.join(packageRoot, "tsconfig.json");
  const configPath = fs.existsSync(configCandidate) ? configCandidate : undefined;
  const fact: TypeScriptProjectReferencePackageFact = {
    path: packageRoot,
    packageJsonPath,
    diagnostics: [],
  };
  const compilerOptions =
    configPath === undefined ? undefined : referencedProjectCompilerOptions(configPath);
  const withConfig =
    configPath === undefined
      ? fact
      : {
          ...fact,
          configPath,
          ...(compilerOptions === undefined ? {} : { compilerOptions }),
        };
  const rawJson = fs.readFileSync(packageJsonPath, "utf8");
  const document = parsePackageJsonDocument(packageJsonPath, rawJson);
  const parsed = document.packageJson;
  const withName =
    typeof parsed.name === "string" ? { ...withConfig, name: parsed.name } : withConfig;
  const withType =
    typeof parsed.type === "string" ? { ...withName, packageType: parsed.type } : withName;
  return document.diagnostics.length === 0
    ? withType
    : { ...withType, diagnostics: document.diagnostics };
}

function projectReferencePackageRoot(referencePath: string): string {
  const resolvedReference = path.resolve(referencePath);
  if (path.basename(resolvedReference) === "tsconfig.json") {
    return path.dirname(resolvedReference);
  }
  if (!fs.existsSync(resolvedReference)) {
    return resolvedReference;
  }
  const stat = fs.statSync(resolvedReference);
  return stat.isFile() ? path.dirname(resolvedReference) : resolvedReference;
}

function referencedProjectCompilerOptions(
  configPath: string,
): TypeScriptCompilerOptionFacts | undefined {
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error !== undefined) {
    return undefined;
  }
  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  return parsed.errors.length > 0 ? undefined : compilerOptionFacts(parsed.options);
}
