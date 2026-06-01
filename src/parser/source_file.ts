import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import type {
  TypeScriptExportFact,
  TypeScriptImportFact,
  TypeScriptModuleReport,
  TypeScriptNativeDiagnostic,
  TypeScriptNativeImportResolutionFact,
} from "../model.js";
import {
  locationForNode,
  nativeDiagnosticFromTsDiagnostic,
  parseDiagnosticsForSourceFile,
} from "./diagnostics.js";
import {
  collectTypeScriptNativeSyntaxFacts,
  type TypeScriptNativeSyntaxFacts,
} from "./native_syntax/index.js";
import { forEachDescendant } from "./native_syntax/helpers.js";
import { collectSourceTextFixtureFacts } from "./source_text_fixtures.js";

export interface TypeScriptSourceFileParseOptions {
  readonly collectNativeSyntaxFacts?: boolean;
}

export function parseTypeScriptSourceFile(
  filePathInput: string,
  options: TypeScriptSourceFileParseOptions = {},
): TypeScriptModuleReport {
  const filePath = path.resolve(filePathInput);
  const sourceText = fs.readFileSync(filePath, "utf8");
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      toCompilerScriptKind(scriptKindForPath(filePath)),
    );
  } catch (error) {
    return invalidModuleReport(filePath, sourceText, error);
  }
  const diagnostics = parseDiagnosticsForSourceFile(sourceFile).map((diagnostic) =>
    nativeDiagnosticFromTsDiagnostic(diagnostic, filePath, sourceText),
  );
  return moduleReportFromSourceFile(sourceFile, diagnostics, [], [], undefined, options);
}

function invalidModuleReport(
  filePath: string,
  sourceText: string,
  error: unknown,
): TypeScriptModuleReport {
  const message = error instanceof Error ? error.message : String(error);
  return {
    path: filePath,
    isValid: false,
    scriptKind: scriptKindForPath(filePath),
    isDeclarationFile: filePath.endsWith(".d.ts") || filePath.endsWith(".d.mts"),
    hasIntentDoc: false,
    lineCount: sourceText.split(/\r\n|\r|\n/u).length,
    diagnostics: [
      {
        code: 0,
        message,
        category: "error",
        location: { path: filePath, line: 1, column: 0 },
        sourceLine: sourceText.split(/\r\n|\r|\n/u)[0] ?? "",
        relatedInformation: [],
      },
    ],
    semanticDiagnostics: [],
    sourceTextFixtures: [],
    imports: [],
    importResolutions: [],
    exports: [],
    publicFunctionParams: [],
    publicTupleApiSurfaces: [],
    publicDataFields: [],
    publicTypeAliases: [],
    publicDiscriminatedUnionVariantFields: [],
    publicFunctionControlFlows: [],
    publicReturnObjectShapes: [],
    moduleResponsibilities: [],
    publicAsyncEffectSurfaces: [],
    effectRuntimeCalls: [],
    effectPromiseInteropRisks: [],
    effectResourceScopeRisks: [],
    effectConcurrencySignals: [],
    effectSchemaBoundarySignals: [],
    effectProductionBoundarySignals: [],
    effectServiceMethods: [],
    reactRenderPuritySignals: [],
    reactHookCallSignals: [],
    reactStaticDefinitionSignals: [],
  };
}

export function moduleReportFromSourceFile(
  sourceFile: ts.SourceFile,
  diagnostics: readonly TypeScriptNativeDiagnostic[],
  semanticDiagnostics: readonly TypeScriptNativeDiagnostic[],
  importResolutions: readonly TypeScriptNativeImportResolutionFact[],
  imports: readonly TypeScriptImportFact[] = collectImportFacts(sourceFile),
  options: TypeScriptSourceFileParseOptions = {},
): TypeScriptModuleReport {
  const nativeSyntaxFacts =
    options.collectNativeSyntaxFacts === false
      ? emptyTypeScriptNativeSyntaxFacts()
      : collectTypeScriptNativeSyntaxFacts(sourceFile);
  return {
    path: path.resolve(sourceFile.fileName),
    isValid: diagnostics.length === 0,
    scriptKind: scriptKindForPath(sourceFile.fileName),
    isDeclarationFile: sourceFile.isDeclarationFile,
    hasIntentDoc: hasLeadingIntentDoc(sourceFile, sourceFile.text),
    lineCount: sourceFile.getLineStarts().length,
    diagnostics,
    semanticDiagnostics,
    sourceTextFixtures: collectSourceTextFixtureFacts(sourceFile),
    imports,
    importResolutions,
    exports: collectExportFacts(sourceFile),
    publicFunctionParams: nativeSyntaxFacts.publicFunctionParams,
    publicTupleApiSurfaces: nativeSyntaxFacts.publicTupleApiSurfaces,
    publicDataFields: nativeSyntaxFacts.publicDataFields,
    publicTypeAliases: nativeSyntaxFacts.publicTypeAliases,
    publicDiscriminatedUnionVariantFields: nativeSyntaxFacts.publicDiscriminatedUnionVariantFields,
    publicFunctionControlFlows: nativeSyntaxFacts.publicFunctionControlFlows,
    publicReturnObjectShapes: nativeSyntaxFacts.publicReturnObjectShapes,
    moduleResponsibilities: nativeSyntaxFacts.moduleResponsibilities,
    publicAsyncEffectSurfaces: nativeSyntaxFacts.publicAsyncEffectSurfaces,
    effectRuntimeCalls: nativeSyntaxFacts.effectRuntimeCalls,
    effectPromiseInteropRisks: nativeSyntaxFacts.effectPromiseInteropRisks,
    effectResourceScopeRisks: nativeSyntaxFacts.effectResourceScopeRisks,
    effectConcurrencySignals: nativeSyntaxFacts.effectConcurrencySignals,
    effectSchemaBoundarySignals: nativeSyntaxFacts.effectSchemaBoundarySignals,
    effectProductionBoundarySignals: nativeSyntaxFacts.effectProductionBoundarySignals,
    effectServiceMethods: nativeSyntaxFacts.effectServiceMethods,
    reactRenderPuritySignals: nativeSyntaxFacts.reactRenderPuritySignals,
    reactHookCallSignals: nativeSyntaxFacts.reactHookCallSignals,
    reactStaticDefinitionSignals: nativeSyntaxFacts.reactStaticDefinitionSignals,
  };
}

function emptyTypeScriptNativeSyntaxFacts(): TypeScriptNativeSyntaxFacts {
  return {
    publicFunctionParams: [],
    publicTupleApiSurfaces: [],
    publicDataFields: [],
    publicTypeAliases: [],
    publicDiscriminatedUnionVariantFields: [],
    publicFunctionControlFlows: [],
    publicReturnObjectShapes: [],
    moduleResponsibilities: [],
    publicAsyncEffectSurfaces: [],
    effectRuntimeCalls: [],
    effectPromiseInteropRisks: [],
    effectResourceScopeRisks: [],
    effectConcurrencySignals: [],
    effectSchemaBoundarySignals: [],
    effectProductionBoundarySignals: [],
    effectServiceMethods: [],
    reactRenderPuritySignals: [],
    reactHookCallSignals: [],
    reactStaticDefinitionSignals: [],
  };
}

export function collectImportFacts(sourceFile: ts.SourceFile): TypeScriptImportFact[] {
  const facts: TypeScriptImportFact[] = [];
  forEachDescendant(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      facts.push({
        moduleSpecifier: node.moduleSpecifier.text,
        kind: "import",
        isTypeOnly: importDeclarationIsTypeOnly(node),
        location: locationForNode(sourceFile, node),
      });
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (ts.isStringLiteral(expression)) {
        facts.push({
          moduleSpecifier: expression.text,
          kind: "import",
          isTypeOnly: node.isTypeOnly,
          location: locationForNode(sourceFile, node),
        });
      }
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        facts.push({
          moduleSpecifier: node.moduleSpecifier.text,
          kind: "export",
          isTypeOnly: exportDeclarationIsTypeOnly(node),
          location: locationForNode(sourceFile, node),
        });
      }
    }
    if (ts.isImportTypeNode(node)) {
      const moduleSpecifier = moduleSpecifierFromImportTypeNode(node);
      if (moduleSpecifier !== undefined) {
        facts.push({
          moduleSpecifier,
          kind: "import",
          isTypeOnly: true,
          location: locationForNode(sourceFile, node),
        });
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [firstArgument] = node.arguments;
      if (firstArgument !== undefined && ts.isStringLiteral(firstArgument)) {
        facts.push({
          moduleSpecifier: firstArgument.text,
          kind: "dynamic-import",
          isTypeOnly: false,
          location: locationForNode(sourceFile, node),
        });
      }
    }
  });
  return facts;
}

export function scriptKindForPath(filePath: string): TypeScriptModuleReport["scriptKind"] {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".tsx")) {
    return "tsx";
  }
  if (lowerPath.endsWith(".jsx")) {
    return "jsx";
  }
  if (lowerPath.endsWith(".mts")) {
    return "mts";
  }
  if (lowerPath.endsWith(".mjs")) {
    return "mjs";
  }
  if (lowerPath.endsWith(".cts")) {
    return "cts";
  }
  if (lowerPath.endsWith(".cjs")) {
    return "cjs";
  }
  if (lowerPath.endsWith(".ts")) {
    return "ts";
  }
  if (lowerPath.endsWith(".js")) {
    return "js";
  }
  return "unknown";
}

function toCompilerScriptKind(scriptKind: TypeScriptModuleReport["scriptKind"]): ts.ScriptKind {
  switch (scriptKind) {
    case "tsx":
      return ts.ScriptKind.TSX;
    case "jsx":
      return ts.ScriptKind.JSX;
    case "mts":
      return ts.ScriptKind.TS;
    case "mjs":
      return ts.ScriptKind.JS;
    case "cts":
      return ts.ScriptKind.TS;
    case "cjs":
      return ts.ScriptKind.JS;
    case "ts":
      return ts.ScriptKind.TS;
    case "js":
      return ts.ScriptKind.JS;
    case "unknown":
      return ts.ScriptKind.Unknown;
  }
}

function importDeclarationIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const importClause = node.importClause;
  if (importClause === undefined) {
    return false;
  }
  if (importClause.isTypeOnly) {
    return true;
  }
  if (importClause.name !== undefined) {
    return false;
  }
  const namedBindings = importClause.namedBindings;
  return (
    namedBindings !== undefined &&
    ts.isNamedImports(namedBindings) &&
    namedBindings.elements.length > 0 &&
    namedBindings.elements.every((element) => element.isTypeOnly)
  );
}

function exportDeclarationIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) {
    return true;
  }
  const exportClause = node.exportClause;
  return (
    exportClause !== undefined &&
    ts.isNamedExports(exportClause) &&
    exportClause.elements.length > 0 &&
    exportClause.elements.every((element) => element.isTypeOnly)
  );
}

function moduleSpecifierFromImportTypeNode(node: ts.ImportTypeNode): string | undefined {
  const argument = node.argument;
  if (!ts.isLiteralTypeNode(argument)) {
    return undefined;
  }
  const literal = argument.literal;
  if (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)) {
    return literal.text;
  }
  return undefined;
}

function collectExportFacts(sourceFile: ts.SourceFile): TypeScriptExportFact[] {
  const facts: TypeScriptExportFact[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isNamespaceExportDeclaration(statement)) {
      facts.push({
        name: statement.name.text,
        kind: "global-namespace",
        isTypeOnly: false,
        location: locationForNode(sourceFile, statement),
      });
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      const isExportEquals = statement.isExportEquals === true;
      facts.push({
        name: isExportEquals ? statement.expression.getText(sourceFile) : "default",
        kind: isExportEquals ? "export-assignment" : "default",
        isTypeOnly: false,
        location: locationForNode(sourceFile, statement),
      });
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      const isTypeOnly = exportDeclarationIsTypeOnly(statement);
      if (statement.exportClause === undefined) {
        facts.push({
          name: "*",
          kind: "star",
          isTypeOnly,
          location: locationForNode(sourceFile, statement),
        });
        continue;
      }
      if (ts.isNamespaceExport(statement.exportClause)) {
        facts.push({
          name: statement.exportClause.name.text,
          kind: "namespace-reexport",
          isTypeOnly,
          location: locationForNode(sourceFile, statement.exportClause),
        });
        continue;
      }
      if (ts.isNamedExports(statement.exportClause)) {
        const exportKind = statement.moduleSpecifier === undefined ? "export-list" : "reexport";
        for (const element of statement.exportClause.elements) {
          facts.push({
            name: element.name.text,
            kind: exportKind,
            isTypeOnly: isTypeOnly || element.isTypeOnly,
            location: locationForNode(sourceFile, element),
          });
        }
      }
      continue;
    }
    if (hasExportModifier(statement)) {
      facts.push(...exportFactsForStatement(sourceFile, statement));
    }
  }
  return facts;
}

function exportFactsForStatement(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
): TypeScriptExportFact[] {
  const location = locationForNode(sourceFile, statement);
  if (ts.isFunctionDeclaration(statement)) {
    return [
      { name: statement.name?.text ?? "default", kind: "function", isTypeOnly: false, location },
    ];
  }
  if (ts.isClassDeclaration(statement)) {
    return [
      { name: statement.name?.text ?? "default", kind: "class", isTypeOnly: false, location },
    ];
  }
  if (ts.isInterfaceDeclaration(statement)) {
    return [{ name: statement.name.text, kind: "interface", isTypeOnly: true, location }];
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    return [{ name: statement.name.text, kind: "type", isTypeOnly: true, location }];
  }
  if (ts.isEnumDeclaration(statement)) {
    return [{ name: statement.name.text, kind: "enum", isTypeOnly: false, location }];
  }
  if (ts.isModuleDeclaration(statement)) {
    return [
      { name: statement.name.getText(sourceFile), kind: "namespace", isTypeOnly: false, location },
    ];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      bindingNames(declaration.name).map((name) => ({
        name,
        kind: "variable" as const,
        isTypeOnly: false,
        location: locationForNode(sourceFile, declaration),
      })),
    );
  }
  return [];
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  );
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return name.elements.flatMap((element) => {
    if (ts.isOmittedExpression(element)) {
      return [];
    }
    return bindingNames(element.name);
  });
}

function hasLeadingIntentDoc(sourceFile: ts.SourceFile, sourceText: string): boolean {
  const firstStatement = sourceFile.statements[0];
  if (firstStatement === undefined) {
    return false;
  }
  const commentRanges = ts.getLeadingCommentRanges(sourceText, firstStatement.pos) ?? [];
  return commentRanges.some((commentRange) => {
    const commentText = sourceText.slice(commentRange.pos, commentRange.end);
    return commentText.startsWith("/**") || commentText.startsWith("//!");
  });
}
