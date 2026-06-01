import ts from "typescript";

import type {
  TypeScriptModuleResponsibilityFact,
  TypeScriptModuleResponsibilityKind,
} from "../../model.js";
import { locationForNode } from "../diagnostics.js";
import { bindingNameText, isExported, propertyNameText, sourceLineField } from "./helpers.js";

export function collectModuleResponsibilities(
  sourceFile: ts.SourceFile,
): TypeScriptModuleResponsibilityFact[] {
  return sourceFile.statements.flatMap((statement) =>
    moduleResponsibilitiesForStatement(sourceFile, statement),
  );
}

function moduleResponsibilitiesForStatement(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
): TypeScriptModuleResponsibilityFact[] {
  if (ts.isFunctionDeclaration(statement)) {
    return [
      responsibilityFact(sourceFile, statement, "function", statement.name?.text ?? "default"),
    ];
  }
  if (ts.isClassDeclaration(statement)) {
    return [responsibilityFact(sourceFile, statement, "class", statement.name?.text ?? "default")];
  }
  if (ts.isInterfaceDeclaration(statement)) {
    return [responsibilityFact(sourceFile, statement, "interface", statement.name.text)];
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    return [responsibilityFact(sourceFile, statement, "type", statement.name.text)];
  }
  if (ts.isEnumDeclaration(statement)) {
    return [responsibilityFact(sourceFile, statement, "enum", statement.name.text)];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => {
      const name = bindingNameText(declaration.name, sourceFile);
      const initializer = declaration.initializer;
      if (
        initializer !== undefined &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ) {
        return [responsibilityFact(sourceFile, declaration, "function", name)];
      }
      return isExported(statement)
        ? [responsibilityFact(sourceFile, declaration, "value", name)]
        : [];
    });
  }
  if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
    return [
      responsibilityFact(
        sourceFile,
        statement.expression,
        "call",
        topLevelCallResponsibilityName(sourceFile, statement.expression),
      ),
    ];
  }
  if (ts.isExportDeclaration(statement)) {
    return [
      responsibilityFact(
        sourceFile,
        statement,
        "export",
        statement.moduleSpecifier?.getText(sourceFile) ?? "export",
      ),
    ];
  }
  return [];
}

function responsibilityFact(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: TypeScriptModuleResponsibilityKind,
  name: string,
): TypeScriptModuleResponsibilityFact {
  return {
    kind,
    name,
    lineSpan: lineSpan(sourceFile, node),
    location: locationForNode(sourceFile, node),
    ...sourceLineField(sourceFile, node),
  };
}

function topLevelCallResponsibilityName(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
): string {
  const callee = expressionName(call.expression, sourceFile);
  const label = call.arguments[0];
  if (label !== undefined && ts.isStringLiteralLike(label)) {
    return `${callee}:${label.text}`;
  }
  return callee;
}

function expressionName(expression: ts.Expression, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const left = expressionName(expression.expression, sourceFile);
    return `${left}.${propertyNameText(expression.name, sourceFile)}`;
  }
  if (ts.isElementAccessExpression(expression)) {
    return `${expressionName(expression.expression, sourceFile)}[]`;
  }
  return expression.getText(sourceFile);
}

function lineSpan(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
  return end - start + 1;
}
