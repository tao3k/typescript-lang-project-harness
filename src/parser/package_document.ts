import ts from "typescript";

import type { SourceLocation } from "../model.js";
import {
  locationForNode,
  nativeDiagnosticFromTsDiagnostic,
  parseDiagnosticsForSourceFile,
} from "./diagnostics.js";
import type { ParsedPackageJsonDocument } from "./types.js";

export function parsePackageJsonDocument(
  packagePath: string,
  sourceText: string,
): ParsedPackageJsonDocument {
  const sourceFile = ts.parseJsonText(packagePath, sourceText);
  const converted = ts.convertToObject(sourceFile, []) as unknown;
  const packageJson =
    converted !== null && typeof converted === "object" && !Array.isArray(converted)
      ? converted
      : {};
  const diagnostics = parseDiagnosticsForSourceFile(sourceFile).map((diagnostic) =>
    nativeDiagnosticFromTsDiagnostic(diagnostic, packagePath, sourceText),
  );
  const rootObject = rootPackageJsonObject(sourceFile);
  const document = {
    packageJson,
    sourceFile,
    diagnostics,
  };
  return rootObject === undefined ? document : { ...document, rootObject };
}

export function packageJsonProperty(
  document: ParsedPackageJsonDocument,
  propertyName: string,
): ts.PropertyAssignment | undefined {
  const rootObject = document.rootObject;
  return rootObject === undefined ? undefined : jsonObjectProperty(rootObject, propertyName);
}

export function packageJsonPropertyLocation(
  document: ParsedPackageJsonDocument,
  propertyName: string,
): SourceLocation {
  const property = packageJsonProperty(document, propertyName);
  return property === undefined
    ? packageJsonDocumentLocation(document)
    : locationForNode(document.sourceFile, property);
}

export function jsonObjectProperty(
  objectExpression: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | undefined {
  return objectExpression.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && jsonPropertyNameText(property.name) === propertyName,
  );
}

export function jsonPropertyNameText(propertyName: ts.PropertyName): string | undefined {
  if (
    ts.isStringLiteral(propertyName) ||
    ts.isNumericLiteral(propertyName) ||
    ts.isIdentifier(propertyName)
  ) {
    return propertyName.text;
  }
  return undefined;
}

function rootPackageJsonObject(
  sourceFile: ts.JsonSourceFile,
): ts.ObjectLiteralExpression | undefined {
  const statement = sourceFile.statements[0];
  if (statement === undefined || !ts.isObjectLiteralExpression(statement.expression)) {
    return undefined;
  }
  return statement.expression;
}

function packageJsonDocumentLocation(document: ParsedPackageJsonDocument): SourceLocation {
  return { path: document.sourceFile.fileName, line: 1, column: 0 };
}
