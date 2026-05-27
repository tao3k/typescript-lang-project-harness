import ts from "typescript";

import type { SourceLocation, TypeScriptPackageExtensionDependencySource } from "../model.js";
import { locationForNode } from "./diagnostics.js";
import { jsonObjectProperty, packageJsonProperty } from "./package_document.js";
import type { ParsedPackageJsonDocument } from "./types.js";

export const PACKAGE_DEPENDENCY_SOURCE_NAMES: readonly TypeScriptPackageExtensionDependencySource[] =
  ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

export function packageDependencyProperty(
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
