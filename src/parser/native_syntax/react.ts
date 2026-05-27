import ts from "typescript";

import type {
  TypeScriptReactRenderOwnerKind,
  TypeScriptReactRenderPuritySignalFact,
  TypeScriptReactRenderPuritySignalKind,
} from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import { publicFunctionLikeDeclarations, sourceLineField } from "./helpers.js";

interface ReactRenderOwner {
  readonly node: ts.Node;
  readonly name: string;
  readonly ownerKind: TypeScriptReactRenderOwnerKind;
}

export function collectReactRenderPuritySignals(
  sourceFile: ts.SourceFile,
): TypeScriptReactRenderPuritySignalFact[] {
  return reactRenderOwners(sourceFile).flatMap((owner) =>
    reactRenderPuritySignalsForOwner(owner, sourceFile),
  );
}

function reactRenderOwners(sourceFile: ts.SourceFile): readonly ReactRenderOwner[] {
  return publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) => {
    const ownerKind = reactRenderOwnerKind(name);
    return ownerKind === undefined ? [] : [{ node, name, ownerKind }];
  });
}

function reactRenderPuritySignalsForOwner(
  owner: ReactRenderOwner,
  sourceFile: ts.SourceFile,
): TypeScriptReactRenderPuritySignalFact[] {
  const ownerLine = locationForNode(sourceFile, owner.node).line;
  const signals: TypeScriptReactRenderPuritySignalFact[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLikeBoundary(owner.node, node)) {
      return;
    }
    const signal = reactRenderPuritySignal(owner, ownerLine, node, sourceFile);
    if (signal !== undefined) {
      signals.push(signal);
    }
    ts.forEachChild(node, visit);
  };
  visit(owner.node);
  return signals;
}

function reactRenderPuritySignal(
  owner: ReactRenderOwner,
  ownerLine: number,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptReactRenderPuritySignalFact | undefined {
  if (ts.isNewExpression(node) && expressionName(node.expression, sourceFile) === "Date") {
    return reactSignal(owner, ownerLine, "new-date", "new Date", node, sourceFile);
  }
  if (ts.isCallExpression(node)) {
    const callee = callExpressionName(node, sourceFile);
    if (callee === "Date.now") {
      return reactSignal(owner, ownerLine, "date-now", callee, node, sourceFile);
    }
    if (callee === "Math.random") {
      return reactSignal(owner, ownerLine, "math-random", callee, node, sourceFile);
    }
  }
  if (ts.isBinaryExpression(node) && assignmentMutatesBrowserGlobal(node)) {
    return reactSignal(
      owner,
      ownerLine,
      "browser-global-write",
      expressionName(node.left, sourceFile),
      node,
      sourceFile,
    );
  }
  return undefined;
}

function reactSignal(
  owner: ReactRenderOwner,
  ownerLine: number,
  signalKind: TypeScriptReactRenderPuritySignalKind,
  expression: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptReactRenderPuritySignalFact {
  return {
    ownerName: owner.name,
    ownerLine,
    ownerKind: owner.ownerKind,
    signalKind,
    expression,
    location: locationForNode(sourceFile, node),
    ...sourceLineField(sourceFile, node),
  };
}

function reactRenderOwnerKind(name: string): TypeScriptReactRenderOwnerKind | undefined {
  const terminalName = name.split(".").at(-1) ?? name;
  if (startsWithUppercaseAscii(terminalName)) {
    return "component";
  }
  if (isReactHookName(terminalName)) {
    return "hook";
  }
  return undefined;
}

function startsWithUppercaseAscii(name: string): boolean {
  const first = name.codePointAt(0);
  return first !== undefined && isUppercaseAsciiCodePoint(first);
}

function isReactHookName(name: string): boolean {
  if (!name.startsWith("use")) {
    return false;
  }
  const next = name.codePointAt(3);
  return next !== undefined && (isUppercaseAsciiCodePoint(next) || isDigit(next));
}

function isUppercaseAsciiCodePoint(codePoint: number): boolean {
  return codePoint >= 65 && codePoint <= 90;
}

function isDigit(codePoint: number): boolean {
  return codePoint >= 48 && codePoint <= 57;
}

function assignmentMutatesBrowserGlobal(node: ts.BinaryExpression): boolean {
  if (
    node.operatorToken.kind !== ts.SyntaxKind.EqualsToken &&
    node.operatorToken.kind !== ts.SyntaxKind.PlusEqualsToken &&
    node.operatorToken.kind !== ts.SyntaxKind.MinusEqualsToken &&
    node.operatorToken.kind !== ts.SyntaxKind.AsteriskEqualsToken &&
    node.operatorToken.kind !== ts.SyntaxKind.SlashEqualsToken
  ) {
    return false;
  }
  const root = expressionRootName(node.left);
  return root === "document" || root === "window";
}

function expressionRootName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return expressionRootName(expression.expression);
  }
  return undefined;
}

function callExpressionName(node: ts.CallExpression, sourceFile: ts.SourceFile): string {
  return expressionName(node.expression, sourceFile);
}

function expressionName(expression: ts.Expression, sourceFile: ts.SourceFile): string {
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
