import ts from "typescript";

import type {
  TypeScriptEffectProductionBoundaryMissingCapability,
  TypeScriptEffectProductionBoundarySignalFact,
  TypeScriptEffectProductionBoundarySignalKind,
} from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import {
  bindingNameText,
  isExported,
  publicFunctionLikeDeclarations,
  sourceLineField,
} from "./helpers.js";

const OBSERVABILITY_EFFECT_METHODS = new Set([
  "annotateCurrentSpan",
  "annotateLogs",
  "annotateLogsScoped",
  "log",
  "logDebug",
  "logError",
  "logFatal",
  "logInfo",
  "logTrace",
  "logWarning",
  "withSpan",
]);

const RESILIENCE_EFFECT_METHODS = new Set([
  "retry",
  "retryOrElse",
  "timeout",
  "timeoutFail",
  "timeoutFailCause",
  "timeoutOption",
  "timeoutTo",
]);

export function collectEffectProductionBoundarySignals(
  sourceFile: ts.SourceFile,
): TypeScriptEffectProductionBoundarySignalFact[] {
  return [
    ...publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) =>
      productionBoundarySignalsForOwner(name, node, sourceFile),
    ),
    ...exportedValueOwners(sourceFile).flatMap(({ node, name }) =>
      productionBoundarySignalsForOwner(name, node, sourceFile),
    ),
  ];
}

function productionBoundarySignalsForOwner(
  ownerName: string,
  ownerNode: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptEffectProductionBoundarySignalFact[] {
  const capabilities = productionCapabilities(ownerNode, sourceFile);
  if (capabilities.hasObservability && capabilities.hasResilience) {
    return [];
  }
  const missingCapabilities: TypeScriptEffectProductionBoundaryMissingCapability[] = [];
  if (!capabilities.hasObservability) {
    missingCapabilities.push("observability");
  }
  if (!capabilities.hasResilience) {
    missingCapabilities.push("resilience");
  }
  const ownerLine = locationForNode(sourceFile, ownerNode).line;
  const signals: TypeScriptEffectProductionBoundarySignalFact[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLikeBoundary(ownerNode, node)) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const signal = productionBoundarySignal(
        ownerName,
        ownerLine,
        missingCapabilities,
        node,
        sourceFile,
      );
      if (signal !== undefined) {
        signals.push(signal);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ownerNode);
  return signals;
}

function productionCapabilities(
  ownerNode: ts.Node,
  sourceFile: ts.SourceFile,
): {
  readonly hasObservability: boolean;
  readonly hasResilience: boolean;
} {
  let hasObservability = false;
  let hasResilience = false;
  const visit = (node: ts.Node): void => {
    if (isFunctionLikeBoundary(ownerNode, node)) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = callExpressionName(node, sourceFile);
      if (isObservabilityCall(callee)) {
        hasObservability = true;
      }
      if (isResilienceCall(callee)) {
        hasResilience = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ownerNode);
  return { hasObservability, hasResilience };
}

function productionBoundarySignal(
  ownerName: string,
  ownerLine: number,
  missingCapabilities: readonly TypeScriptEffectProductionBoundaryMissingCapability[],
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
): TypeScriptEffectProductionBoundarySignalFact | undefined {
  const callee = callExpressionName(node, sourceFile);
  const signalKind = productionBoundarySignalKind(callee);
  if (signalKind === undefined) {
    return undefined;
  }
  return {
    ownerName,
    ownerLine,
    signalKind,
    callee,
    missingCapabilities,
    location: locationForNode(sourceFile, node.expression),
    ...sourceLineField(sourceFile, node),
  };
}

function productionBoundarySignalKind(
  callee: string,
): TypeScriptEffectProductionBoundarySignalKind | undefined {
  switch (callee) {
    case "Effect.async":
      return "effect-async-interop";
    case "Effect.promise":
      return "effect-promise-interop";
    case "Effect.tryPromise":
      return "effect-try-promise-interop";
    case "fetch":
      return "fetch-call";
    default:
      return undefined;
  }
}

function isObservabilityCall(callee: string): boolean {
  if (callee.startsWith("Metric.")) {
    return true;
  }
  const method = effectMethodName(callee);
  return method !== undefined && OBSERVABILITY_EFFECT_METHODS.has(method);
}

function isResilienceCall(callee: string): boolean {
  const method = effectMethodName(callee);
  return method !== undefined && RESILIENCE_EFFECT_METHODS.has(method);
}

function effectMethodName(callee: string): string | undefined {
  return callee.startsWith("Effect.") ? callee.slice("Effect.".length) : undefined;
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
