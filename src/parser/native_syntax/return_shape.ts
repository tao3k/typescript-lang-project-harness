import ts from "typescript";

import type { TypeScriptPublicReturnObjectShapeFact } from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import { isExported, propertyNameText, sourceLineField } from "./helpers.js";

export function collectPublicReturnObjectShapes(
  sourceFile: ts.SourceFile,
): TypeScriptPublicReturnObjectShapeFact[] {
  return sourceFile.statements.flatMap((node) => {
    if (!ts.isFunctionDeclaration(node) || node.name === undefined || !isExported(node)) {
      return [];
    }
    const shape = returnObjectShape(sourceFile, node.name.text, node.body);
    return shape === undefined ? [] : [shape];
  });
}

function returnObjectShape(
  sourceFile: ts.SourceFile,
  functionName: string,
  body: ts.Block | undefined,
): TypeScriptPublicReturnObjectShapeFact | undefined {
  if (body === undefined) return undefined;
  let shape: TypeScriptPublicReturnObjectShapeFact | undefined;

  const visit = (node: ts.Node): void => {
    if (shape !== undefined) return;
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      const expression = unwrapParentheses(node.expression);
      if (ts.isObjectLiteralExpression(expression)) {
        const objectShape = objectLiteralShape(expression, sourceFile);
        shape = {
          functionName,
          functionLine: locationForNode(sourceFile, expression).line,
          fields: objectShape.fields,
          spreads: objectShape.spreads,
          location: locationForNode(sourceFile, expression),
          ...sourceLineField(sourceFile, expression),
        };
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(body);
  return shape;
}

function objectLiteralShape(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): { readonly fields: readonly string[]; readonly spreads: readonly string[] } {
  const fields: string[] = [];
  const spreads: string[] = [];

  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadFields = objectLiteralFieldNamesFromExpression(property.expression);
      if (spreadFields.length === 0) {
        addUnique(spreads, property.expression.getText(sourceFile));
      } else {
        for (const field of spreadFields) {
          addUnique(fields, field);
          addUnique(spreads, field);
        }
      }
      continue;
    }

    const name = propertyName(property.name, sourceFile);
    if (name !== undefined) addUnique(fields, name);
  }

  return { fields, spreads };
}

function objectLiteralFieldNamesFromExpression(expression: ts.Expression): readonly string[] {
  const unwrapped = unwrapParentheses(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) return objectLiteralFieldNames(unwrapped);
  if (ts.isConditionalExpression(unwrapped)) {
    return [
      ...objectLiteralFieldNamesFromExpression(unwrapped.whenTrue),
      ...objectLiteralFieldNamesFromExpression(unwrapped.whenFalse),
    ];
  }
  return [];
}

function objectLiteralFieldNames(objectLiteral: ts.ObjectLiteralExpression): readonly string[] {
  const fields: string[] = [];
  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      for (const nestedField of objectLiteralFieldNamesFromExpression(property.expression)) {
        addUnique(fields, nestedField);
      }
      continue;
    }
    const name = propertyName(property.name, objectLiteral.getSourceFile());
    if (name !== undefined) addUnique(fields, name);
  }
  return fields;
}

function propertyName(
  name: ts.PropertyName | undefined,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return propertyNameText(name, sourceFile);
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function addUnique(values: string[], value: string): void {
  if (value !== "" && !values.includes(value)) values.push(value);
}
