import ts from "typescript";

import type { TypeScriptEffectRuntimeBoundaryKind } from "../../model.js";
import { propertyNameText } from "./helpers.js";

export function effectRuntimeBoundaryKind(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): TypeScriptEffectRuntimeBoundaryKind | undefined {
  return isInsideReactQueryCallback(node, sourceFile) ? "react-query-callback" : undefined;
}

function isInsideReactQueryCallback(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (isReactQueryCallbackProperty(current, sourceFile)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isReactQueryCallbackProperty(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (ts.isPropertyAssignment(node)) {
    const propertyName = normalizedPropertyName(node.name, sourceFile);
    return (
      isReactQueryEffectRuntimeProperty(propertyName) && isReactQueryOptionsObject(node.parent)
    );
  }
  if (ts.isMethodDeclaration(node)) {
    const propertyName = normalizedPropertyName(node.name, sourceFile);
    return (
      isReactQueryEffectRuntimeProperty(propertyName) &&
      ts.isObjectLiteralExpression(node.parent) &&
      isReactQueryOptionsObject(node.parent)
    );
  }
  return false;
}

function normalizedPropertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return propertyNameText(name, sourceFile);
}

function isReactQueryEffectRuntimeProperty(propertyName: string): boolean {
  return propertyName === "queryFn" || propertyName === "mutationFn";
}

function isReactQueryOptionsObject(node: ts.ObjectLiteralExpression): boolean {
  const callExpression = node.parent;
  if (!ts.isCallExpression(callExpression)) {
    return false;
  }
  return isReactQueryHookOrOptionsCall(callExpression.expression);
}

function isReactQueryHookOrOptionsCall(expression: ts.Expression): boolean {
  const terminal = expressionNameParts(expression).at(-1);
  return (
    terminal === "useQuery" ||
    terminal === "useSuspenseQuery" ||
    terminal === "useInfiniteQuery" ||
    terminal === "useSuspenseInfiniteQuery" ||
    terminal === "useMutation" ||
    terminal === "queryOptions" ||
    terminal === "infiniteQueryOptions" ||
    terminal === "mutationOptions"
  );
}

function expressionNameParts(expression: ts.Expression): readonly string[] {
  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return [...expressionNameParts(expression.expression), expression.name.text];
  }
  return [];
}
