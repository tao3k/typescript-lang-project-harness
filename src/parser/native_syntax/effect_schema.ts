import ts from "typescript";

import type { TypeScriptEffectSchemaBoundarySignalFact } from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import {
  bindingNameText,
  isExported,
  publicFunctionLikeDeclarations,
  sourceLineField,
} from "./helpers.js";

export function collectEffectSchemaBoundarySignals(
  sourceFile: ts.SourceFile,
): TypeScriptEffectSchemaBoundarySignalFact[] {
  return [
    ...publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) =>
      schemaBoundarySignalsForOwner(name, node, sourceFile),
    ),
    ...exportedValueOwners(sourceFile).flatMap(({ node, name }) =>
      schemaBoundarySignalsForOwner(name, node, sourceFile),
    ),
  ];
}

function schemaBoundarySignalsForOwner(
  ownerName: string,
  ownerNode: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectSchemaBoundarySignalFact[] {
  if (containsSchemaBoundaryDecode(ownerNode, sourceFile)) {
    return [];
  }
  const ownerLine = locationForNode(sourceFile, ownerNode).line;
  const signals: TypeScriptEffectSchemaBoundarySignalFact[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const signal = schemaBoundarySignal(ownerName, ownerLine, node, sourceFile);
      if (signal !== undefined) {
        signals.push(signal);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ownerNode);
  return signals;
}

function schemaBoundarySignal(
  ownerName: string,
  ownerLine: number,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): TypeScriptEffectSchemaBoundarySignalFact | undefined {
  const callee = callExpressionName(node, sourceFile);
  if (callee === "JSON.parse") {
    return {
      ownerName,
      ownerLine,
      signalKind: "json-parse-without-schema",
      callee,
      location: locationForNode(sourceFile, node.expression),
      ...sourceLineField(sourceFile, node),
    };
  }
  if (callee.endsWith(".json")) {
    return {
      ownerName,
      ownerLine,
      signalKind: "response-json-without-schema",
      callee,
      location: locationForNode(sourceFile, node.expression),
      ...sourceLineField(sourceFile, node),
    };
  }
  return undefined;
}

function containsSchemaBoundaryDecode(ownerNode: ts.Node, sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node) && isSchemaBoundaryDecodeCall(node, sourceFile)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(ownerNode);
  return found;
}

function isSchemaBoundaryDecodeCall(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  const callee = callExpressionName(node, sourceFile);
  return (
    callee.startsWith("Schema.decode") ||
    callee.startsWith("Schema.validate") ||
    callee === "Schema.parseJson" ||
    callee === "Schema.is" ||
    callee === "Schema.asserts"
  );
}

function callExpressionName(node: ts.CallExpression, sourceFile: ts.SourceFile): string {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expressionNameParts(expression).join(".");
  }
  return expression.getText(sourceFile);
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
