import ts from "typescript";

import type { TypeScriptSourceTextFixtureFact } from "../model.js";
import { forEachDescendant } from "./native_syntax/helpers.js";

export function collectSourceTextFixtureFacts(
  sourceFile: ts.SourceFile,
): TypeScriptSourceTextFixtureFact[] {
  const facts: TypeScriptSourceTextFixtureFact[] = [];
  forEachDescendant(sourceFile, (node) => {
    if (!isStringLike(node)) return;
    const call = writeFileSyncCallForContentNode(node);
    const fixturePath =
      call === undefined ? undefined : fixturePathFromExpression(call.arguments[0]);
    if (fixturePath === undefined) return;
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    facts.push({
      fixturePath,
      location: {
        path: sourceFile.fileName,
        line: start.line + 1,
        column: start.character + 1,
      },
      lineEnd: end.line + 1,
    });
  });
  return facts;
}

function writeFileSyncCallForContentNode(node: ts.Node): ts.CallExpression | undefined {
  let current: ts.Node = node;
  while (current.parent !== undefined) {
    const parent = current.parent;
    if (ts.isCallExpression(parent) && isWriteFileSyncExpression(parent.expression)) {
      const contentArg = parent.arguments[1];
      if (contentArg !== undefined && node.pos >= contentArg.pos && node.end <= contentArg.end) {
        return parent;
      }
    }
    current = parent;
  }
  return undefined;
}

function isWriteFileSyncExpression(expression: ts.Expression): boolean {
  return (
    (ts.isPropertyAccessExpression(expression) && expression.name.text === "writeFileSync") ||
    (ts.isIdentifier(expression) && expression.text === "writeFileSync")
  );
}

function fixturePathFromExpression(expression: ts.Expression | undefined): string | undefined {
  if (expression === undefined) return undefined;
  if (isStringLike(expression)) return normalizeProjectPath(expression.text);
  if (!ts.isCallExpression(expression)) return undefined;
  if (!ts.isPropertyAccessExpression(expression.expression)) return undefined;
  if (expression.expression.name.text !== "join") return undefined;
  const parts = expression.arguments.flatMap((argument) =>
    isStringLike(argument) ? [argument.text] : [],
  );
  return normalizeProjectPath(parts.join("/"));
}

function normalizeProjectPath(rawPath: string): string | undefined {
  const normalized = rawPath.replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (normalized === "" || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)) {
    return undefined;
  }
  if (
    normalized.includes("//") ||
    normalized.includes(":") ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return undefined;
  }
  return normalized;
}

function isStringLike(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}
