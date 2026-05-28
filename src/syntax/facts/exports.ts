import ts from "typescript";
import type { TsExportFact } from "../model.js";

export function collectExports(sourceFile: ts.SourceFile): TsExportFact[] {
  const facts: TsExportFact[] = [];

  ts.forEachChild(sourceFile, (node) => {
    // `export function/class/const/let/var/enum/namespace/interface/type X`
    if (hasExportModifier(node)) {
      const fact = declarationExport(node, sourceFile);
      if (fact !== undefined) {
        facts.push(fact);
      }
    }

    // `export default X`
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      facts.push({
        name: "default",
        exportKind: "default",
        isTypeOnly: false,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }

    // `export { ... }` or `export type { ... }`
    if (ts.isExportDeclaration(node) && node.exportClause !== undefined) {
      const isTypeOnly = node.isTypeOnly;
      if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const reexportSource =
            node.moduleSpecifier !== undefined
              ? (node.moduleSpecifier as ts.StringLiteral).text
              : undefined;
          facts.push({
            name: element.name.text,
            exportKind: "reexport",
            isTypeOnly,
            line: sourceFile.getLineAndCharacterOfPosition(element.getStart()).line + 1,
            ...(reexportSource !== undefined ? { reexportSource } : {}),
          } as TsExportFact);
        }
      }
    }

    // `export * from "..."` or `export type * from "..."`
    if (ts.isExportDeclaration(node) && node.exportClause === undefined) {
      const reexportSource =
        node.moduleSpecifier !== undefined
          ? (node.moduleSpecifier as ts.StringLiteral).text
          : undefined;
      facts.push({
        name: "*",
        exportKind: "star",
        isTypeOnly: node.isTypeOnly,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        ...(reexportSource !== undefined ? { reexportSource } : {}),
      } as TsExportFact);
    }
  });

  return facts;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function declarationExport(node: ts.Node, sourceFile: ts.SourceFile): TsExportFact | undefined {
  let name: string | undefined;
  let kind: TsExportFact["exportKind"] | undefined;

  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    name = node.name.text;
    kind = "function";
  } else if (ts.isClassDeclaration(node) && node.name !== undefined) {
    name = node.name.text;
    kind = "class";
  } else if (ts.isInterfaceDeclaration(node)) {
    name = node.name.text;
    kind = "interface";
  } else if (ts.isTypeAliasDeclaration(node)) {
    name = node.name.text;
    kind = "type";
  } else if (ts.isEnumDeclaration(node)) {
    name = node.name.text;
    kind = "enum";
  } else if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        return {
          name: decl.name.text,
          exportKind: "variable",
          isTypeOnly: false,
          line: sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1,
        };
      }
    }
    return undefined;
  } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
    name = node.name.text;
    kind = "namespace";
  }

  if (name === undefined || kind === undefined) {
    return undefined;
  }
  return {
    name,
    exportKind: kind,
    isTypeOnly: false,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
  };
}
