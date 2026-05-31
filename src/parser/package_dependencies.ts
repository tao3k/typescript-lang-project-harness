import ts from "typescript";

import type {
  SourceLocation,
  TypeScriptPackageDependencyFact,
  TypeScriptPackageDependencySource,
} from "../model.js";
import { locationForNode } from "./diagnostics.js";
import {
  jsonObjectProperty,
  jsonPropertyNameText,
  packageJsonProperty,
} from "./package_document.js";
import type { ParsedPackageJsonDocument } from "./types.js";

export const PACKAGE_DEPENDENCY_SOURCE_NAMES: readonly TypeScriptPackageDependencySource[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

export function packageDependencyFacts(
  document: ParsedPackageJsonDocument,
): TypeScriptPackageDependencyFact[] {
  return PACKAGE_DEPENDENCY_SOURCE_NAMES.flatMap((source) => {
    const property = packageJsonProperty(document, source);
    if (property === undefined || !ts.isObjectLiteralExpression(property.initializer)) {
      return [];
    }
    return property.initializer.properties.flatMap((dependencyProperty) => {
      if (!ts.isPropertyAssignment(dependencyProperty)) {
        return [];
      }
      const name = jsonPropertyNameText(dependencyProperty.name);
      if (name === undefined || !ts.isStringLiteral(dependencyProperty.initializer)) {
        return [];
      }
      return [
        {
          name,
          versionRange: dependencyProperty.initializer.text,
          source,
          location: locationForNode(document.sourceFile, dependencyProperty),
        },
      ];
    });
  }).sort((left, right) =>
    `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`),
  );
}

export function packageDependencyProperty(
  document: ParsedPackageJsonDocument,
  packageName: string,
):
  | {
      readonly source: TypeScriptPackageDependencySource;
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
