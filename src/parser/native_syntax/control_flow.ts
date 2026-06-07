import ts from "typescript";

import type { TypeScriptPublicFunctionControlFlowFact } from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import { publicFunctionLikeDeclarations, sourceLineField } from "./helpers.js";

export function collectPublicFunctionControlFlows(
  sourceFile: ts.SourceFile,
): TypeScriptPublicFunctionControlFlowFact[] {
  return publicFunctionLikeDeclarations(sourceFile).flatMap(({ node, name }) => {
    const body = node.body;
    if (body === undefined) {
      return [];
    }
    const metrics = controlFlowMetrics(body);
    return [
      {
        functionName: name,
        functionLine: locationForNode(sourceFile, node).line,
        lineSpan: lineSpan(sourceFile, body),
        statementCount: metrics.statementCount,
        branchCount: metrics.branchCount,
        loopCount: metrics.loopCount,
        maxNestingDepth: metrics.maxNestingDepth,
        maxLiteralDispatchChain: metrics.maxLiteralDispatchChain,
        manualTransformLoopCount: metrics.manualTransformLoopCount,
        maxBlockStatementCount: metrics.maxBlockStatementCount,
        location: locationForNode(sourceFile, node.name ?? node),
        ...sourceLineField(sourceFile, node),
      },
    ];
  });
}

function controlFlowMetrics(body: ts.ConciseBody): {
  readonly statementCount: number;
  readonly branchCount: number;
  readonly loopCount: number;
  readonly maxNestingDepth: number;
  readonly maxLiteralDispatchChain: number;
  readonly manualTransformLoopCount: number;
  readonly maxBlockStatementCount: number;
} {
  let statementCount = 0;
  let branchCount = 0;
  let loopCount = 0;
  let maxNestingDepth = 0;
  let maxLiteralDispatchChain = 0;
  let manualTransformLoopCount = 0;
  let maxBlockStatementCount = ts.isBlock(body) ? body.statements.length : 1;
  const visit = (node: ts.Node, depth: number): void => {
    if (isStatementNode(node)) {
      statementCount += 1;
    }
    if (ts.isBlock(node)) {
      maxBlockStatementCount = Math.max(maxBlockStatementCount, node.statements.length);
    }
    const nextDepth = isNestingNode(node) ? depth + 1 : depth;
    if (nextDepth > depth) {
      maxNestingDepth = Math.max(maxNestingDepth, nextDepth);
    }
    if (isBranchNode(node)) {
      branchCount += 1;
    }
    if (ts.isIfStatement(node)) {
      maxLiteralDispatchChain = Math.max(maxLiteralDispatchChain, literalDispatchChainLength(node));
    }
    if (isLoopNode(node)) {
      loopCount += 1;
      if (isManualTransformLoop(node)) {
        manualTransformLoopCount += 1;
      }
    }
    ts.forEachChild(node, (child) => visit(child, nextDepth));
  };
  visit(body, 0);
  return {
    statementCount,
    branchCount,
    loopCount,
    maxNestingDepth,
    maxLiteralDispatchChain,
    manualTransformLoopCount,
    maxBlockStatementCount,
  };
}

function isStatementNode(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isExpressionStatement(node) ||
    ts.isVariableStatement(node) ||
    ts.isTryStatement(node)
  );
}

function isBranchNode(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCatchClause(node)
  );
}

function isLoopNode(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

function isManualTransformLoop(node: ts.Node): boolean {
  const body = loopBody(node);
  if (body === undefined) {
    return false;
  }
  const loopVariables = loopVariableNames(node);
  if (loopVariables.size === 0) {
    return false;
  }
  const transformTargets = new Set<string>();
  const visit = (current: ts.Node): void => {
    const target = collectionTransformTarget(current, loopVariables);
    if (target !== undefined) {
      transformTargets.add(target);
    }
    ts.forEachChild(current, visit);
  };
  visit(body);
  if (transformTargets.size === 0) {
    return false;
  }
  const functionBody = enclosingFunctionBody(node);
  return (
    functionBody !== undefined &&
    [...transformTargets].some((target) => directlyReturnsIdentifier(functionBody, target))
  );
}

function loopBody(node: ts.Node): ts.Statement | undefined {
  if (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  ) {
    return node.statement;
  }
  return undefined;
}

function loopVariableNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    addBindingNames(node.initializer, names);
  } else if (ts.isForStatement(node) && node.initializer !== undefined) {
    addBindingNames(node.initializer, names);
  }
  return names;
}

function addBindingNames(node: ts.Node, names: Set<string>): void {
  if (ts.isIdentifier(node)) {
    names.add(node.text);
  } else if (ts.isVariableDeclarationList(node)) {
    for (const declaration of node.declarations) {
      addBindingNames(declaration.name, names);
    }
  } else if (ts.isBindingElement(node)) {
    addBindingNames(node.name, names);
  } else if (ts.isArrayBindingPattern(node) || ts.isObjectBindingPattern(node)) {
    for (const element of node.elements) {
      if (ts.isBindingElement(element)) {
        addBindingNames(element, names);
      }
    }
  }
}

function collectionTransformTarget(node: ts.Node, loopVariables: Set<string>): string | undefined {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }
  if (node.expression.name.text !== "push" || !ts.isIdentifier(node.expression.expression)) {
    return undefined;
  }
  return node.arguments.some((argument) => referencesAnyIdentifier(argument, loopVariables))
    ? node.expression.expression.text
    : undefined;
}

function referencesAnyIdentifier(node: ts.Node, names: Set<string>): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isIdentifier(current) && names.has(current.text)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function enclosingFunctionBody(node: ts.Node): ts.Block | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isConstructorDeclaration(current) ||
        ts.isGetAccessor(current) ||
        ts.isSetAccessor(current)) &&
      current.body !== undefined
    ) {
      return current.body;
    }
    if (ts.isArrowFunction(current) && current.body !== undefined && ts.isBlock(current.body)) {
      return current.body;
    }
    current = current.parent;
  }
  return undefined;
}

function directlyReturnsIdentifier(body: ts.Block, name: string): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) {
      return;
    }
    if (current !== body && isFunctionBoundary(current)) {
      return;
    }
    if (ts.isReturnStatement(current) && current.expression !== undefined) {
      const expression = stripParentheses(current.expression);
      if (ts.isIdentifier(expression) && expression.text === name) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(body);
  return found;
}

function isFunctionBoundary(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

function isNestingNode(node: ts.Node): boolean {
  return isBranchNode(node) || isLoopNode(node) || ts.isTryStatement(node);
}

function literalDispatchChainLength(statement: ts.IfStatement): number {
  const subject = literalComparisonSubject(statement.expression);
  if (subject === undefined) {
    return 0;
  }
  let count = 1;
  let next = statement.elseStatement;
  while (next !== undefined && ts.isIfStatement(next)) {
    if (literalComparisonSubject(next.expression) !== subject) {
      break;
    }
    count += 1;
    next = next.elseStatement;
  }
  return count;
}

function literalComparisonSubject(expression: ts.Expression): string | undefined {
  const candidate = stripParentheses(expression);
  if (!ts.isBinaryExpression(candidate) || !isEqualityOperator(candidate.operatorToken.kind)) {
    return undefined;
  }
  const left = stripParentheses(candidate.left);
  const right = stripParentheses(candidate.right);
  if (isLiteralDispatchValue(left) && !isLiteralDispatchValue(right)) {
    return right.getText();
  }
  if (isLiteralDispatchValue(right) && !isLiteralDispatchValue(left)) {
    return left.getText();
  }
  return undefined;
}

function isEqualityOperator(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsEqualsEqualsToken || kind === ts.SyntaxKind.EqualsEqualsToken;
}

function stripParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isLiteralDispatchValue(expression: ts.Expression): boolean {
  return (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword
  );
}

function lineSpan(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
  return end - start + 1;
}
