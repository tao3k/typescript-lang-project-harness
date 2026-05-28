import ts from "typescript";
import type { TsImportFact } from "../model.js";

export function collectImports(sourceFile: ts.SourceFile): TsImportFact[] {
  const facts: TsImportFact[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isImportDeclaration(node)) {
      return;
    }
    const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
    const importClause = node.importClause;
    const isTypeOnly = node.importClause?.isTypeOnly ?? false;

    if (importClause === undefined) {
      // side-effect import: `import "foo"`
      facts.push({
        moduleSpecifier,
        names: [],
        importKind: "side-effect",
        isTypeOnly: false,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      return;
    }

    // Default import
    if (importClause.name !== undefined) {
      facts.push({
        moduleSpecifier,
        names: [importClause.name.text],
        importKind: "default",
        isTypeOnly,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }

    // Named bindings
    if (importClause.namedBindings !== undefined) {
      if (ts.isNamedImports(importClause.namedBindings)) {
        const names = importClause.namedBindings.elements.map((e) => e.name.text);
        facts.push({
          moduleSpecifier,
          names,
          importKind: "named",
          isTypeOnly,
          line:
            sourceFile.getLineAndCharacterOfPosition(importClause.namedBindings.getStart()).line +
            1,
        });
      } else if (ts.isNamespaceImport(importClause.namedBindings)) {
        facts.push({
          moduleSpecifier,
          names: [importClause.namedBindings.name.text],
          importKind: "namespace",
          isTypeOnly,
          line:
            sourceFile.getLineAndCharacterOfPosition(importClause.namedBindings.getStart()).line +
            1,
        });
      }
    }
  });
  return facts;
}
