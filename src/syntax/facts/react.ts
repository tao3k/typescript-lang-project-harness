import ts from "typescript";
import type { TsReactFact } from "../model.js";

export function collectReactFacts(sourceFile: ts.SourceFile): TsReactFact[] {
  const facts: TsReactFact[] = [];

  ts.forEachChild(sourceFile, (node) => {
    const exported = hasExportModifier(node);

    for (const candidate of functionCandidates(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const isComponent = startsWithUppercase(candidate.name) && bodyContainsJsx(candidate.body);
      const isHook =
        candidate.name.startsWith("use") &&
        !candidate.name.startsWith("useEffect") &&
        !candidate.name.startsWith("useLayoutEffect") &&
        !candidate.name.startsWith("useInsertionEffect");

      if (isComponent) {
        const calls = collectNamedCallsInBody(candidate.body);
        facts.push({
          factKind: "component",
          name: candidate.name,
          exported,
          line,
          isComponent: true,
          hookCalls: calls.filter((call) => isHookName(call)),
          effectCalls: calls.filter((call) => isEffectName(call)),
        });
      } else if (isHook) {
        const deps = collectHookDependencies(candidate.body);
        facts.push({
          factKind: "hook",
          name: candidate.name,
          exported,
          line,
          dependencies: [...new Set(deps)].sort(),
        });
      }
    }
  });

  return facts;
}

interface FuncCandidate {
  name: string;
  body: ts.Node | undefined;
}

function functionCandidates(node: ts.Node): FuncCandidate[] {
  const results: FuncCandidate[] = [];
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    results.push({ name: node.name.text, body: node.body });
  }
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.initializer !== undefined &&
        (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
      ) {
        results.push({ name: decl.name.text, body: decl.initializer.body });
      }
    }
  }
  return results;
}

function startsWithUppercase(name: string): boolean {
  const first = name.codePointAt(0);
  return first !== undefined && first >= 65 && first <= 90;
}

function bodyContainsJsx(body: ts.Node | undefined): boolean {
  if (body === undefined) return false;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      found = true;
      return;
    }
    if (
      ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isTypeAssertionExpression(n)
    ) {
      ts.forEachChild(n, visit);
      return;
    }
    if (!isFunctionBoundary(n)) {
      ts.forEachChild(n, visit);
    }
  };
  visit(body);
  return found;
}

function isFunctionBoundary(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isHookName(name: string): boolean {
  if (!name.startsWith("use")) return false;
  const next = name.codePointAt(3);
  return next !== undefined && ((next >= 65 && next <= 90) || (next >= 48 && next <= 57));
}

function isEffectName(name: string): boolean {
  return name === "useEffect" || name === "useLayoutEffect" || name === "useInsertionEffect";
}

function collectNamedCallsInBody(body: ts.Node | undefined): string[] {
  if (body === undefined) return [];
  const names: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      if (ts.isIdentifier(n.expression)) {
        names.push(n.expression.text);
      } else if (ts.isPropertyAccessExpression(n.expression)) {
        // React.useState, React.useMemo, etc.
        names.push(n.expression.name.text);
      }
    }
    if (!isFunctionBoundary(n)) {
      ts.forEachChild(n, visit);
    }
  };
  visit(body);
  return names;
}

function collectHookDependencies(body: ts.Node | undefined): string[] {
  if (body === undefined) return [];
  const deps: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      deps.push(n.text);
    }
    if (!isFunctionBoundary(n)) {
      ts.forEachChild(n, visit);
    }
  };
  visit(body);
  return deps;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
