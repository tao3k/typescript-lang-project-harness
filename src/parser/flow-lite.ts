import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

import { discoverTypeScriptFiles } from "./files.js";

export interface FlowLiteWhere {
  readonly sourceCall: string;
  readonly sinkConstructs: string;
  readonly scopeFn: string;
}

export interface FlowLiteOccurrence {
  readonly handle: string;
  readonly kind: "call" | "constructs";
  readonly value: string;
  readonly path: string;
  readonly line: number;
}

export interface FlowLiteResult {
  readonly ownerPath: string;
  readonly functionStart: number;
  readonly functionEnd: number;
  readonly source: FlowLiteOccurrence | undefined;
  readonly sink: FlowLiteOccurrence | undefined;
  readonly scannedFiles: number;
}

export function evaluateTypeScriptFlowLiteQuery(
  projectRoot: string,
  where: FlowLiteWhere,
): FlowLiteResult {
  const sourceFiles = discoverTypeScriptFiles([projectRoot]);
  const fallback: FlowLiteResult = {
    ownerPath: ".",
    functionStart: 1,
    functionEnd: 1,
    source: undefined,
    sink: undefined,
    scannedFiles: sourceFiles.length,
  };
  for (const filePath of sourceFiles) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/gu, "/");
    const sourceFile = ts.createSourceFile(
      relativePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(relativePath),
    );
    const result = findFlowLiteInSourceFile(sourceFile, where, relativePath);
    if (result !== undefined) {
      return { ...result, scannedFiles: sourceFiles.length };
    }
  }
  return fallback;
}

function findFlowLiteInSourceFile(
  sourceFile: ts.SourceFile,
  where: FlowLiteWhere,
  relativePath: string,
): FlowLiteResult | undefined {
  let result: FlowLiteResult | undefined;
  const visit = (node: ts.Node): void => {
    if (result !== undefined) return;
    if (isNamedFunctionLike(node, where.scopeFn) && node.body !== undefined) {
      result = collectFlowLiteInFunction(sourceFile, node, where, relativePath);
      return;
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return result;
}

function collectFlowLiteInFunction(
  sourceFile: ts.SourceFile,
  node: ts.FunctionLikeDeclaration,
  where: FlowLiteWhere,
  relativePath: string,
): FlowLiteResult {
  let source: FlowLiteOccurrence | undefined;
  let sink: FlowLiteOccurrence | undefined;
  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child)) {
      if (source === undefined && expressionTerminalName(child.expression) === where.sourceCall) {
        source = flowLiteOccurrence(sourceFile, relativePath, "call", where.sourceCall, child);
      }
      if (sink === undefined && expressionContainsName(child.expression, where.sinkConstructs)) {
        sink = flowLiteOccurrence(
          sourceFile,
          relativePath,
          "constructs",
          where.sinkConstructs,
          child,
        );
      }
    } else if (
      ts.isNewExpression(child) &&
      sink === undefined &&
      expressionContainsName(child.expression, where.sinkConstructs)
    ) {
      sink = flowLiteOccurrence(
        sourceFile,
        relativePath,
        "constructs",
        where.sinkConstructs,
        child,
      );
    }
    child.forEachChild(visit);
  };
  node.body?.forEachChild(visit);
  const functionStart =
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const functionEnd = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return {
    ownerPath: relativePath,
    functionStart,
    functionEnd,
    source,
    sink,
    scannedFiles: 0,
  };
}

function isNamedFunctionLike(node: ts.Node, name: string): node is ts.FunctionLikeDeclaration {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text === name;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text === name;
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text === name;
    }
  }
  return false;
}

function flowLiteOccurrence(
  sourceFile: ts.SourceFile,
  relativePath: string,
  kind: FlowLiteOccurrence["kind"],
  value: string,
  node: ts.Node,
): FlowLiteOccurrence {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  return {
    handle: `${kind}:${value}@${relativePath}:${line}`,
    kind,
    value,
    path: relativePath,
    line,
  };
}

function expressionTerminalName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return expression.getText();
}

function expressionContainsName(expression: ts.Expression, name: string): boolean {
  if (expressionTerminalName(expression) === name) return true;
  return expression.getText().split(".").includes(name);
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
