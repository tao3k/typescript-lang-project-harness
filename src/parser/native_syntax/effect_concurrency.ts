import ts from "typescript";

import type { TypeScriptEffectConcurrencySignalFact } from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import {
  bindingNameText,
  isExported,
  publicFunctionLikeDeclarations,
  sourceLineField,
} from "./helpers.js";

const EFFECT_CONCURRENCY_METHODS = new Set([
  "all",
  "allSuccesses",
  "allWith",
  "forEach",
  "mergeAll",
  "replicateEffect",
  "validateAll",
]);

const PROMISE_CONCURRENCY_METHODS = new Set(["all", "allSettled", "any", "race"]);

export function collectEffectConcurrencySignals(
  sourceFile: ts.SourceFile,
): TypeScriptEffectConcurrencySignalFact[] {
  return [
    ...publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) =>
      effectConcurrencySignalsForOwner(name, node, sourceFile),
    ),
    ...exportedValueOwners(sourceFile).flatMap(({ node, name }) =>
      effectConcurrencySignalsForOwner(name, node, sourceFile),
    ),
  ];
}

function effectConcurrencySignalsForOwner(
  ownerName: string,
  ownerNode: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectConcurrencySignalFact[] {
  const ownerLine = locationForNode(sourceFile, ownerNode).line;
  const signals: TypeScriptEffectConcurrencySignalFact[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLikeBoundary(ownerNode, node)) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const promiseSignal = promiseConcurrencySignal(ownerName, ownerLine, node, sourceFile);
      if (promiseSignal !== undefined) {
        signals.push(promiseSignal);
      }
      const effectSignal = effectConcurrencySignal(ownerName, ownerLine, node, sourceFile);
      if (effectSignal !== undefined) {
        signals.push(effectSignal);
      }
    }
    const loopSignal = sequentialAwaitLoopSignal(ownerName, ownerLine, node, sourceFile);
    if (loopSignal !== undefined) {
      signals.push(loopSignal);
    }
    ts.forEachChild(node, visit);
  };
  visit(ownerNode);
  return signals;
}

function promiseConcurrencySignal(
  ownerName: string,
  ownerLine: number,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): TypeScriptEffectConcurrencySignalFact | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }
  if (
    !ts.isIdentifier(node.expression.expression) ||
    node.expression.expression.text !== "Promise" ||
    !PROMISE_CONCURRENCY_METHODS.has(node.expression.name.text)
  ) {
    return undefined;
  }
  return {
    ownerName,
    ownerLine,
    signalKind: "promise-combinator",
    callee: `Promise.${node.expression.name.text}`,
    location: locationForNode(sourceFile, node.expression.name),
    ...sourceLineField(sourceFile, node),
  };
}

function effectConcurrencySignal(
  ownerName: string,
  ownerLine: number,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): TypeScriptEffectConcurrencySignalFact | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }
  if (
    !ts.isIdentifier(node.expression.expression) ||
    node.expression.expression.text !== "Effect" ||
    !EFFECT_CONCURRENCY_METHODS.has(node.expression.name.text) ||
    hasExplicitConcurrencyOption(node)
  ) {
    return undefined;
  }
  return {
    ownerName,
    ownerLine,
    signalKind: "effect-combinator-missing-concurrency",
    callee: `Effect.${node.expression.name.text}`,
    location: locationForNode(sourceFile, node.expression.name),
    ...sourceLineField(sourceFile, node),
  };
}

function sequentialAwaitLoopSignal(
  ownerName: string,
  ownerLine: number,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectConcurrencySignalFact | undefined {
  if (
    !ts.isForOfStatement(node) &&
    !ts.isForInStatement(node) &&
    !ts.isForStatement(node) &&
    !ts.isWhileStatement(node) &&
    !ts.isDoStatement(node)
  ) {
    return undefined;
  }
  if (!containsAwaitExpression(node.statement)) {
    return undefined;
  }
  return {
    ownerName,
    ownerLine,
    signalKind: "sequential-await-loop",
    callee: loopCalleeName(node),
    location: locationForNode(sourceFile, node),
    ...sourceLineField(sourceFile, node),
  };
}

function hasExplicitConcurrencyOption(node: ts.CallExpression): boolean {
  return node.arguments.some(
    (argument) =>
      ts.isObjectLiteralExpression(argument) && objectLiteralHasProperty(argument, "concurrency"),
  );
}

function objectLiteralHasProperty(node: ts.ObjectLiteralExpression, propertyName: string): boolean {
  return node.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    const name = property.name;
    if (ts.isIdentifier(name)) {
      return name.text === propertyName;
    }
    return ts.isStringLiteral(name) && name.text === propertyName;
  });
}

function containsAwaitExpression(root: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (isFunctionLikeBoundary(root, node)) {
      return;
    }
    if (ts.isAwaitExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function isFunctionLikeBoundary(root: ts.Node, node: ts.Node): boolean {
  return (
    node !== root &&
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node))
  );
}

function loopCalleeName(node: ts.Node): string {
  if (ts.isForOfStatement(node)) {
    return node.awaitModifier === undefined ? "for-of-await" : "for-await-of";
  }
  if (ts.isForInStatement(node)) {
    return "for-in-await";
  }
  if (ts.isForStatement(node)) {
    return "for-await";
  }
  if (ts.isWhileStatement(node)) {
    return "while-await";
  }
  return "do-while-await";
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
