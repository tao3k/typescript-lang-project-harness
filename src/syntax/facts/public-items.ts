import ts from "typescript";
import type { TsPublicItemFact } from "../model.js";

type ItemKind = TsPublicItemFact["itemKind"];

interface DeclarationGuard {
  readonly kind: ItemKind;
  readonly match: (node: ts.Node) => boolean;
  readonly getName: (node: ts.Node) => string | undefined;
}

const DECLARATION_GUARDS: readonly DeclarationGuard[] = [
  {
    kind: "interface",
    match: ts.isInterfaceDeclaration,
    getName: (n) => (n as ts.InterfaceDeclaration).name.text,
  },
  {
    kind: "type",
    match: ts.isTypeAliasDeclaration,
    getName: (n) => (n as ts.TypeAliasDeclaration).name.text,
  },
  {
    kind: "enum",
    match: ts.isEnumDeclaration,
    getName: (n) => (n as ts.EnumDeclaration).name.text,
  },
  {
    kind: "namespace",
    match: (n) => ts.isModuleDeclaration(n) && ts.isIdentifier((n as ts.ModuleDeclaration).name),
    getName: (n) => (n as ts.ModuleDeclaration).name.text,
  },
  {
    kind: "function",
    match: ts.isFunctionDeclaration,
    getName: (n) => (n as ts.FunctionDeclaration).name?.text,
  },
  {
    kind: "class",
    match: ts.isClassDeclaration,
    getName: (n) => (n as ts.ClassDeclaration).name?.text,
  },
];

export function collectPublicItems(sourceFile: ts.SourceFile): TsPublicItemFact[] {
  const facts: TsPublicItemFact[] = [];

  ts.forEachChild(sourceFile, (node) => {
    const exported = hasExportModifier(node);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    const guard = DECLARATION_GUARDS.find((g) => g.match(node));
    if (guard !== undefined) {
      const name = guard.getName(node);
      if (name !== undefined) {
        facts.push({ name, itemKind: guard.kind, exported, line });
      }
      return;
    }

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          facts.push({ name: decl.name.text, itemKind: "variable", exported, line });
        }
      }
    }
  });

  return facts;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
