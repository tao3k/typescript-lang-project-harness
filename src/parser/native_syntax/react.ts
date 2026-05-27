import ts from "typescript";

import type {
  TypeScriptReactHookCallSignalFact,
  TypeScriptReactHookCallViolationKind,
  TypeScriptReactRenderOwnerKind,
  TypeScriptReactRenderPuritySignalFact,
  TypeScriptReactRenderPuritySignalKind,
  TypeScriptReactStaticDefinitionSignalFact,
  TypeScriptReactStaticDefinitionSignalKind,
} from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import type { FunctionLikeWithBody } from "./helpers.js";
import { bindingNameText, publicFunctionLikeDeclarations, sourceLineField } from "./helpers.js";

interface ReactRenderOwner {
  readonly node: FunctionLikeWithBody;
  readonly name: string;
  readonly ownerKind: TypeScriptReactRenderOwnerKind;
}

interface ReactHookCallContext {
  readonly afterConditionalReturn: boolean;
  readonly conditional: boolean;
  readonly loop: boolean;
  readonly nestedFunctionDepth: number;
  readonly tryCatchFinally: boolean;
}

export function collectReactRenderPuritySignals(
  sourceFile: ts.SourceFile,
): TypeScriptReactRenderPuritySignalFact[] {
  return reactRenderOwners(sourceFile).flatMap((owner) =>
    reactRenderPuritySignalsForOwner(owner, sourceFile),
  );
}

export function collectReactHookCallSignals(
  sourceFile: ts.SourceFile,
): TypeScriptReactHookCallSignalFact[] {
  return reactRenderOwners(sourceFile).flatMap((owner) =>
    reactHookCallSignalsForOwner(owner, sourceFile),
  );
}

export function collectReactStaticDefinitionSignals(
  sourceFile: ts.SourceFile,
): TypeScriptReactStaticDefinitionSignalFact[] {
  return reactRenderOwners(sourceFile).flatMap((owner) =>
    reactStaticDefinitionSignalsForOwner(owner, sourceFile),
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

function reactHookCallSignalsForOwner(
  owner: ReactRenderOwner,
  sourceFile: ts.SourceFile,
): TypeScriptReactHookCallSignalFact[] {
  const ownerLine = locationForNode(sourceFile, owner.node).line;
  const signals: TypeScriptReactHookCallSignalFact[] = [];
  const visit = (node: ts.Node, context: ReactHookCallContext): void => {
    if (isFunctionLikeBoundary(owner.node, node)) {
      ts.forEachChild(node, (child) =>
        visit(child, {
          ...context,
          nestedFunctionDepth: context.nestedFunctionDepth + 1,
        }),
      );
      return;
    }
    if (ts.isCallExpression(node)) {
      const hookName = reactHookCallName(node, sourceFile);
      if (hookName !== undefined) {
        const violationKinds = hookCallViolationKinds(hookName, context);
        if (violationKinds.length > 0) {
          signals.push({
            ownerName: owner.name,
            ownerLine,
            ownerKind: owner.ownerKind,
            hookName,
            violationKinds,
            location: locationForNode(sourceFile, node),
            ...sourceLineField(sourceFile, node),
          });
        }
      }
    }
    visitChildrenWithHookContext(node, context, visit);
  };
  visitOwnerBody(owner, (node, afterConditionalReturn) =>
    visit(node, {
      afterConditionalReturn,
      conditional: false,
      loop: false,
      nestedFunctionDepth: 0,
      tryCatchFinally: false,
    }),
  );
  return signals;
}

function reactStaticDefinitionSignalsForOwner(
  owner: ReactRenderOwner,
  sourceFile: ts.SourceFile,
): TypeScriptReactStaticDefinitionSignalFact[] {
  const ownerLine = locationForNode(sourceFile, owner.node).line;
  const signals: TypeScriptReactStaticDefinitionSignalFact[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLikeBoundary(owner.node, node)) {
      const nestedName = functionLikeName(node, sourceFile);
      const nestedKind = nestedName === undefined ? undefined : reactRenderOwnerKind(nestedName);
      if (nestedName !== undefined && nestedKind !== undefined) {
        signals.push(
          reactStaticDefinitionSignal(owner, ownerLine, nestedName, nestedKind, node, sourceFile),
        );
      }
    }
    if (ts.isVariableDeclaration(node) && isFunctionLikeExpression(node.initializer)) {
      const nestedName = bindingNameText(node.name, sourceFile);
      const nestedKind = reactRenderOwnerKind(nestedName);
      if (nestedKind !== undefined) {
        signals.push(
          reactStaticDefinitionSignal(owner, ownerLine, nestedName, nestedKind, node, sourceFile),
        );
      }
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

function reactHookCallName(node: ts.CallExpression, sourceFile: ts.SourceFile): string | undefined {
  const callee = callExpressionName(node, sourceFile);
  const terminalName = callee.split(".").at(-1) ?? callee;
  return terminalName === "use" || isReactHookName(terminalName) ? terminalName : undefined;
}

function hookCallViolationKinds(
  hookName: string,
  context: ReactHookCallContext,
): readonly TypeScriptReactHookCallViolationKind[] {
  const violations: TypeScriptReactHookCallViolationKind[] = [];
  if (context.nestedFunctionDepth > 0) {
    violations.push("nested-function");
  }
  if (context.tryCatchFinally) {
    violations.push("try-catch-finally");
  }
  if (hookName !== "use") {
    if (context.conditional) {
      violations.push("conditional");
    }
    if (context.loop) {
      violations.push("loop");
    }
    if (context.afterConditionalReturn) {
      violations.push("after-conditional-return");
    }
  }
  return [...new Set(violations)].sort();
}

function visitChildrenWithHookContext(
  node: ts.Node,
  context: ReactHookCallContext,
  visit: (node: ts.Node, context: ReactHookCallContext) => void,
): void {
  if (ts.isIfStatement(node)) {
    visit(node.expression, { ...context, conditional: true });
    visit(node.thenStatement, { ...context, conditional: true });
    if (node.elseStatement !== undefined) {
      visit(node.elseStatement, { ...context, conditional: true });
    }
    return;
  }
  if (ts.isConditionalExpression(node) || isShortCircuitingBinaryExpression(node)) {
    ts.forEachChild(node, (child) => visit(child, { ...context, conditional: true }));
    return;
  }
  if (isLoopStatement(node)) {
    ts.forEachChild(node, (child) => visit(child, { ...context, loop: true }));
    return;
  }
  if (ts.isTryStatement(node)) {
    ts.forEachChild(node, (child) => visit(child, { ...context, tryCatchFinally: true }));
    return;
  }
  ts.forEachChild(node, (child) => visit(child, context));
}

function visitOwnerBody(
  owner: ReactRenderOwner,
  visit: (node: ts.Node, afterConditionalReturn: boolean) => void,
): void {
  const body = owner.node.body;
  if (body === undefined) {
    return;
  }
  if (!ts.isBlock(body)) {
    visit(body, false);
    return;
  }
  let afterConditionalReturn = false;
  for (const statement of body.statements) {
    visit(statement, afterConditionalReturn);
    if (statementMayReturnConditionally(statement)) {
      afterConditionalReturn = true;
    }
  }
}

function statementMayReturnConditionally(statement: ts.Statement): boolean {
  if (ts.isIfStatement(statement)) {
    return (
      statementContainsReturn(statement.thenStatement) ||
      statementContainsReturn(statement.elseStatement)
    );
  }
  if (ts.isSwitchStatement(statement)) {
    return statement.caseBlock.clauses.some((clause) =>
      clause.statements.some((candidate) => statementContainsReturn(candidate)),
    );
  }
  return false;
}

function statementContainsReturn(statement: ts.Statement | undefined): boolean {
  if (statement === undefined) {
    return false;
  }
  let containsReturn = false;
  const visit = (node: ts.Node): void => {
    if (containsReturn || isFunctionLikeNode(node)) {
      return;
    }
    if (ts.isReturnStatement(node)) {
      containsReturn = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return containsReturn;
}

function isShortCircuitingBinaryExpression(node: ts.Node): node is ts.BinaryExpression {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  );
}

function isLoopStatement(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

function reactStaticDefinitionSignal(
  owner: ReactRenderOwner,
  ownerLine: number,
  nestedName: string,
  nestedKind: TypeScriptReactRenderOwnerKind,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): TypeScriptReactStaticDefinitionSignalFact {
  return {
    ownerName: owner.name,
    ownerLine,
    ownerKind: owner.ownerKind,
    nestedName,
    nestedKind,
    signalKind: staticDefinitionSignalKind(nestedKind),
    location: locationForNode(sourceFile, node),
    ...sourceLineField(sourceFile, node),
  };
}

function staticDefinitionSignalKind(
  nestedKind: TypeScriptReactRenderOwnerKind,
): TypeScriptReactStaticDefinitionSignalKind {
  return nestedKind === "component" ? "nested-component" : "nested-hook";
}

function functionLikeName(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    return node.name?.text;
  }
  if (ts.isMethodDeclaration(node)) {
    return node.name.getText(sourceFile);
  }
  return undefined;
}

function isFunctionLikeExpression(
  node: ts.Expression | undefined,
): node is ts.ArrowFunction | ts.FunctionExpression {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
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
  return node !== root && isFunctionLikeNode(node);
}

function isFunctionLikeNode(node: ts.Node): boolean {
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
