import ts from "typescript";
import type { TsFunctionShapeFact } from "../model.js";

export function collectFunctionShapes(sourceFile: ts.SourceFile): TsFunctionShapeFact[] {
  const facts: TsFunctionShapeFact[] = [];
  const exportedNames = exportedFunctionNames(sourceFile);

  ts.forEachChild(sourceFile, (node) => {
    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      facts.push(
        functionShape(node.name.text, exportedNames.has(node.name.text), node, sourceFile),
      );
    }
  });

  // Also visit nodes recursively for arrow functions and function expressions
  // that may be assigned to exported variables
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isVariableStatement(node)) {
      const exported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer !== undefined) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            facts.push(functionShape(decl.name.text, exported, decl.initializer, sourceFile));
          }
        }
      }
    }
  });

  return facts;
}

function functionShape(
  name: string,
  exported: boolean,
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
): TsFunctionShapeFact {
  const body = node.body;
  const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

  const metrics = body !== undefined ? walkBody(body) : emptyMetrics();
  const params = node.parameters;

  return {
    name,
    exported,
    async: hasAsyncModifier(node),
    line: startLine,
    lineSpan: endLine - startLine + 1,
    statementCount: metrics.statementCount,
    maxNestingDepth: metrics.maxNestingDepth,
    branchCount: metrics.branchCount,
    loopCount: metrics.loopCount,
    awaitCount: metrics.awaitCount,
    tryCatchCount: metrics.tryCatchCount,
    booleanParamCount: countBooleanParams(params),
    positionalParamCount: countPositionalParams(params),
    usesAny: metrics.usesAny,
    usesUnknown: metrics.usesUnknown,
    returnsAnonymousTuple: hasAnonymousTupleReturn(node),
  };
}

interface WalkMetrics {
  statementCount: number;
  maxNestingDepth: number;
  branchCount: number;
  loopCount: number;
  awaitCount: number;
  tryCatchCount: number;
  usesAny: boolean;
  usesUnknown: boolean;
}

function emptyMetrics(): WalkMetrics {
  return {
    statementCount: 0,
    maxNestingDepth: 0,
    branchCount: 0,
    loopCount: 0,
    awaitCount: 0,
    tryCatchCount: 0,
    usesAny: false,
    usesUnknown: false,
  };
}

function walkBody(body: ts.Node): WalkMetrics {
  const metrics = emptyMetrics();
  walk(body, 0, metrics);
  return metrics;
}

function walk(node: ts.Node, depth: number, metrics: WalkMetrics): void {
  const nextDepth = depth + 1;
  if (nextDepth > metrics.maxNestingDepth) {
    metrics.maxNestingDepth = nextDepth;
  }

  if (ts.isStatement(node)) {
    metrics.statementCount++;
  }

  if (ts.isIfStatement(node)) {
    metrics.branchCount++;
  }
  if (ts.isSwitchStatement(node)) {
    metrics.branchCount += node.caseBlock.clauses.length;
  }
  if (ts.isConditionalExpression(node)) {
    metrics.branchCount++;
  }

  if (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  ) {
    metrics.loopCount++;
  }

  if (ts.isAwaitExpression(node)) {
    metrics.awaitCount++;
  }

  if (ts.isTryStatement(node)) {
    metrics.tryCatchCount++;
  }

  // Check for `any` and `unknown` in type annotations
  if (ts.isTypeReferenceNode(node)) {
    const name = typeReferenceName(node);
    if (name === "any") {
      metrics.usesAny = true;
    } else if (name === "unknown") {
      metrics.usesUnknown = true;
    }
  }

  // Don't descend into nested function-like declarations (use metrics passed from caller)
  if (isFunctionLike(node)) {
    return;
  }

  ts.forEachChild(node, (child) => walk(child, isBlock(node) ? nextDepth : depth, metrics));
}

function isBlock(node: ts.Node): boolean {
  return ts.isBlock(node) || ts.isCaseBlock(node) || ts.isModuleBlock(node);
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function typeReferenceName(node: ts.TypeReferenceNode): string | undefined {
  if (ts.isIdentifier(node.typeName)) {
    return node.typeName.text;
  }
  return undefined;
}

function hasAsyncModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function exportedFunctionNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  ts.forEachChild(sourceFile, (node) => {
    if (!hasExportModifier(node)) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      names.add(node.name.text);
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer !== undefined &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          names.add(decl.name.text);
        }
      }
    }
  });
  return names;
}

function countBooleanParams(params: ts.NodeArray<ts.ParameterDeclaration>): number {
  let count = 0;
  for (const param of params) {
    if (param.type === undefined) continue;
    // boolean keyword type: e.g. `flag: boolean`
    if (param.type.kind === ts.SyntaxKind.BooleanKeyword) {
      count++;
      continue;
    }
    // type reference to boolean alias: e.g. `flag: Boolean`
    if (ts.isTypeReferenceNode(param.type)) {
      const name = typeReferenceName(param.type);
      if (name === "boolean" || name === "Boolean") {
        count++;
      }
    }
  }
  return count;
}

function countPositionalParams(params: ts.NodeArray<ts.ParameterDeclaration>): number {
  let count = 0;
  for (const param of params) {
    if (ts.isIdentifier(param.name) && param.dotDotDotToken === undefined) {
      count++;
    }
  }
  return count;
}

function hasAnonymousTupleReturn(node: ts.FunctionLikeDeclaration): boolean {
  const returnType = node.type;
  if (returnType === undefined) {
    return false;
  }
  // Check if return type is a tuple literal: [A, B, C]
  return ts.isTupleTypeNode(returnType);
}
