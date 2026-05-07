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
  readonly maxBlockStatementCount: number;
} {
  let statementCount = 0;
  let branchCount = 0;
  let loopCount = 0;
  let maxNestingDepth = 0;
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
    if (isLoopNode(node)) {
      loopCount += 1;
    }
    ts.forEachChild(node, (child) => visit(child, nextDepth));
  };
  visit(body, 0);
  return { statementCount, branchCount, loopCount, maxNestingDepth, maxBlockStatementCount };
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

function isNestingNode(node: ts.Node): boolean {
  return isBranchNode(node) || isLoopNode(node) || ts.isTryStatement(node);
}

function lineSpan(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
  return end - start + 1;
}
