import ts from "typescript";
import type { TsEffectFact } from "../model.js";

export function collectEffectFacts(sourceFile: ts.SourceFile): TsEffectFact[] {
  const facts: TsEffectFact[] = [];

  ts.forEachChild(sourceFile, (node) => {
    walkForEffectCalls(node, sourceFile, facts);

    const exported = hasExportModifier(node);
    const candidates = effectLayerCandidates(node, sourceFile, exported);
    for (const candidate of candidates) {
      facts.push(candidate);
    }
  });

  return facts;
}

function walkForEffectCalls(node: ts.Node, sourceFile: ts.SourceFile, facts: TsEffectFact[]): void {
  if (ts.isCallExpression(node)) {
    const callee = effectRuntimeCallee(node);
    if (callee !== undefined) {
      facts.push({
        factKind: "runtime",
        callee,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }
  }
  ts.forEachChild(node, (child) => walkForEffectCalls(child, sourceFile, facts));
}

function effectRuntimeCallee(node: ts.CallExpression): string | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return undefined;
  }
  const methodName = node.expression.name.text;
  const receiver = node.expression.expression;

  const EFFECT_RUN_METHODS = new Set([
    "runPromise",
    "runSync",
    "runSyncExit",
    "runFork",
    "runPromiseExit",
  ]);

  if (!EFFECT_RUN_METHODS.has(methodName)) {
    return undefined;
  }

  const receiverName = expressionName(receiver);
  if (
    receiverName === "Effect" ||
    receiverName === "Runtime" ||
    receiverName?.toLowerCase().endsWith("runtime")
  ) {
    return `${receiverName}.${methodName}`;
  }
  return undefined;
}

function effectLayerCandidates(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  exported: boolean,
): TsEffectFact[] {
  const results: TsEffectFact[] = [];

  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) {
        continue;
      }
      const name = decl.name.text;
      const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;

      const init = decl.initializer;
      if (init === undefined) {
        continue;
      }

      const callee = topLevelPropertyAccess(init);
      if (callee === undefined) {
        continue;
      }

      const receiver = callee[0];
      if (receiver === "Layer") {
        results.push({ factKind: "layer", name, exported, line });
      } else if (receiver === "Context") {
        results.push({ factKind: "context", name, exported, line });
      } else if (receiver === "Tag" || receiver === "GenericTag") {
        results.push({ factKind: "tag", name, exported, line });
      } else if (receiver === "Schema") {
        const fields = inferSchemaFields(init);
        results.push({ factKind: "schema", name, exported, line, fields });
      }
    }
  }

  return results;
}

function topLevelPropertyAccess(node: ts.Expression): [string, string] | undefined {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const receiver = expressionName(node.expression.expression);
    const method = node.expression.name.text;
    if (receiver !== undefined) {
      return [receiver, method];
    }
  }
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = expressionName(node.expression);
    const method = node.name.text;
    if (receiver !== undefined) {
      return [receiver, method];
    }
  }
  return undefined;
}

function inferSchemaFields(node: ts.Expression): string[] {
  if (!ts.isCallExpression(node)) {
    return [];
  }
  const arg = node.arguments[0];
  if (arg === undefined || !ts.isObjectLiteralExpression(arg)) {
    return [];
  }
  return arg.properties
    .filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
    .map((p) => {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
        return p.name.text;
      }
      if (ts.isShorthandPropertyAssignment(p)) {
        return p.name.text;
      }
      return "";
    })
    .filter((n) => n.length > 0);
}

function expressionName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expressionName(expr.expression);
  }
  return undefined;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
