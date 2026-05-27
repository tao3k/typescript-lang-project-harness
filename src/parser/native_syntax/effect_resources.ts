import ts from "typescript";

import type { TypeScriptEffectResourceScopeRiskFact } from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import {
  bindingNameText,
  isExported,
  publicFunctionLikeDeclarations,
  sourceLineField,
} from "./helpers.js";

export function collectEffectResourceScopeRisks(
  sourceFile: ts.SourceFile,
): TypeScriptEffectResourceScopeRiskFact[] {
  return [
    ...publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) =>
      resourceScopeRisksForOwner(name, node, sourceFile),
    ),
    ...exportedValueOwners(sourceFile).flatMap(({ node, name }) =>
      resourceScopeRisksForOwner(name, node, sourceFile),
    ),
  ];
}

function resourceScopeRisksForOwner(
  ownerName: string,
  ownerNode: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectResourceScopeRiskFact[] {
  if (containsEffectScoped(ownerNode)) {
    return [];
  }
  const ownerLine = locationForNode(sourceFile, ownerNode).line;
  const risks: TypeScriptEffectResourceScopeRiskFact[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && effectMethodCall(node, "acquireRelease")) {
      risks.push({
        ownerName,
        ownerLine,
        constructorName: "Effect.acquireRelease",
        location: locationForNode(sourceFile, node.expression),
        ...sourceLineField(sourceFile, node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ownerNode);
  return risks;
}

function containsEffectScoped(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isPropertyAccessExpression(child) && effectPropertyAccess(child, "scoped")) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function exportedValueOwners(
  sourceFile: ts.SourceFile,
): Array<{ readonly node: ts.Expression; readonly name: string }> {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      return [];
    }
    return statement.declarationList.declarations.flatMap((declaration) => {
      const initializer = declaration.initializer;
      if (
        initializer === undefined ||
        ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer)
      ) {
        return [];
      }
      return [{ node: initializer, name: bindingNameText(declaration.name, sourceFile) }];
    });
  });
}

function effectMethodCall(node: ts.CallExpression, methodName: string): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    effectPropertyAccess(node.expression, methodName)
  );
}

function effectPropertyAccess(node: ts.PropertyAccessExpression, methodName: string): boolean {
  return (
    node.name.text === methodName &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "Effect"
  );
}
