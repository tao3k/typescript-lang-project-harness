import ts from "typescript";

import type {
  SourceLocation,
  TypeScriptPackageExtensionConfigSource,
  TypeScriptPackageExtensionDependencySource,
  TypeScriptPackageExtensionFact,
} from "../model.js";
import { locationForNode } from "./diagnostics.js";
import {
  jsonObjectProperty,
  packageJsonProperty,
  packageJsonPropertyLocation,
} from "./package_document.js";
import type { ParsedPackageJsonDocument } from "./types.js";

const EFFECT_EXTENSION_CAPABILITIES = ["typed-async", "domain-effects", "policy"] as const;

const PACKAGE_DEPENDENCY_SOURCE_NAMES: readonly TypeScriptPackageExtensionDependencySource[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const HARNESS_CONFIG_SOURCE_NAMES: readonly TypeScriptPackageExtensionConfigSource[] = [
  "typescriptProjectHarness",
  "typescriptLangProjectHarness",
  "typescript-lang-project-harness",
];

export function packageExtensionFacts(
  document: ParsedPackageJsonDocument,
): TypeScriptPackageExtensionFact[] {
  const effectDependency = packageDependencyProperty(document, "effect");
  const effectConfig = packageExtensionConfigProperty(document, "effect");
  if (effectDependency === undefined && effectConfig === undefined) {
    return [];
  }
  const activation =
    effectConfig === undefined
      ? "dependency"
      : effectDependency === undefined
        ? "config-enabled-missing-dependency"
        : "config-enabled";
  const location =
    effectConfig === undefined
      ? (effectDependency?.location ?? packageJsonPropertyLocation(document, "name"))
      : effectConfig.location;
  return [
    {
      name: "effect",
      displayName: "Effect",
      packageName: "effect",
      activation,
      capabilities: EFFECT_EXTENSION_CAPABILITIES,
      location,
      ...(effectDependency === undefined ? {} : { dependencySource: effectDependency.source }),
      ...(effectConfig === undefined ? {} : { configSource: effectConfig.source }),
    },
  ];
}

function packageDependencyProperty(
  document: ParsedPackageJsonDocument,
  packageName: string,
):
  | {
      readonly source: TypeScriptPackageExtensionDependencySource;
      readonly location: SourceLocation;
    }
  | undefined {
  for (const source of PACKAGE_DEPENDENCY_SOURCE_NAMES) {
    const property = packageJsonProperty(document, source);
    if (property === undefined || !ts.isObjectLiteralExpression(property.initializer)) {
      continue;
    }
    const dependencyProperty = jsonObjectProperty(property.initializer, packageName);
    if (dependencyProperty === undefined) {
      continue;
    }
    return { source, location: locationForNode(document.sourceFile, dependencyProperty) };
  }
  return undefined;
}

function packageExtensionConfigProperty(
  document: ParsedPackageJsonDocument,
  extensionName: string,
):
  | { readonly source: TypeScriptPackageExtensionConfigSource; readonly location: SourceLocation }
  | undefined {
  for (const source of HARNESS_CONFIG_SOURCE_NAMES) {
    const configProperty = packageJsonProperty(document, source);
    if (configProperty === undefined || !ts.isObjectLiteralExpression(configProperty.initializer)) {
      continue;
    }
    const extensionsProperty = jsonObjectProperty(configProperty.initializer, "extensions");
    if (
      extensionsProperty === undefined ||
      !ts.isObjectLiteralExpression(extensionsProperty.initializer)
    ) {
      continue;
    }
    const extensionProperty =
      jsonObjectProperty(extensionsProperty.initializer, extensionName) ??
      jsonObjectProperty(extensionsProperty.initializer, "Effect");
    if (extensionProperty === undefined || !extensionConfigEnables(extensionProperty.initializer)) {
      continue;
    }
    return { source, location: locationForNode(document.sourceFile, extensionProperty) };
  }
  return undefined;
}

function extensionConfigEnables(value: ts.Expression): boolean {
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  return ts.isStringLiteral(value) && value.text.toLowerCase() === "enable";
}
