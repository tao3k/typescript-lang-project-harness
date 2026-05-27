import ts from "typescript";

import type {
  SourceLocation,
  TypeScriptPackageExtensionConfigSource,
  TypeScriptPackageExtensionFact,
} from "../model.js";
import { locationForNode } from "./diagnostics.js";
import { packageDependencyProperty } from "./package_dependencies.js";
import {
  jsonObjectProperty,
  packageJsonProperty,
  packageJsonPropertyLocation,
} from "./package_document.js";
import type { ParsedPackageJsonDocument } from "./types.js";

const EFFECT_EXTENSION_CAPABILITIES = ["typed-async", "domain-effects", "policy"] as const;

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
      coverage: "project",
      capabilities: EFFECT_EXTENSION_CAPABILITIES,
      location,
      ...(effectDependency === undefined ? {} : { dependencySource: effectDependency.source }),
      ...(effectConfig === undefined ? {} : { configSource: effectConfig.source }),
    },
  ];
}

function packageExtensionConfigProperty(
  document: ParsedPackageJsonDocument,
  extensionName: string,
):
  | {
      readonly source: TypeScriptPackageExtensionConfigSource;
      readonly location: SourceLocation;
    }
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
    if (extensionProperty === undefined) {
      continue;
    }
    const config = extensionConfigInfo(extensionProperty.initializer);
    if (!config.enabled) {
      continue;
    }
    return {
      source,
      location: locationForNode(document.sourceFile, extensionProperty),
    };
  }
  return undefined;
}

function extensionConfigInfo(value: ts.Expression): {
  readonly enabled: boolean;
} {
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return { enabled: true };
  }
  if (ts.isStringLiteral(value)) {
    return {
      enabled: value.text.toLowerCase() === "enable",
    };
  }
  if (!ts.isObjectLiteralExpression(value)) {
    return { enabled: false };
  }
  const enabledProperty = jsonObjectProperty(value, "enabled");
  return {
    enabled:
      enabledProperty === undefined ? true : extensionConfigEnables(enabledProperty.initializer),
  };
}

function extensionConfigEnables(value: ts.Expression): boolean {
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  return ts.isStringLiteral(value) && value.text.toLowerCase() === "enable";
}
