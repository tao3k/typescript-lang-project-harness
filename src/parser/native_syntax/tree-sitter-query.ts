import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

import { discoverTypeScriptFiles } from "../files.js";
const SEMANTIC_TREE_SITTER_QUERY_SCHEMA_ID =
  "agent.semantic-protocols.semantic-tree-sitter-query" as const;
const TYPE_SCRIPT_LANGUAGE_ID = "typescript" as const;
const TYPE_SCRIPT_PROVIDER_ID = "ts-harness" as const;
const TYPE_SCRIPT_BINARY = "ts-harness" as const;
const TYPE_SCRIPT_PROVIDER_NAMESPACE =
  "agent.semantic-protocols.languages.typescript.ts-harness" as const;
export const TYPE_SCRIPT_TREE_SITTER_GRAMMAR_ID = "tree-sitter-typescript" as const;
export const TYPE_SCRIPT_TREE_SITTER_GRAMMAR_PROFILE_VERSION = "2026-06-05.v1" as const;
export const TYPE_SCRIPT_TREE_SITTER_GRAMMAR_PROFILE_PATH =
  "tree-sitter/tree-sitter-typescript/grammar-profile.json" as const;

export interface TypeScriptTreeSitterQueryOptions {
  readonly catalogId?: string | undefined;
  readonly treeSitterQuery?: string | undefined;
  readonly terms: readonly string[];
  readonly selector?: string | undefined;
  readonly aspSyntaxQueryPlan?: SyntaxQueryPlan | undefined;
  readonly json: boolean;
  readonly codeOnly: boolean;
}

export interface SyntaxQueryPlan {
  readonly captures: readonly string[];
  readonly nodeTypes: readonly string[];
  readonly fields: readonly string[];
}

interface Catalog {
  readonly id: string;
  readonly path: string;
  readonly source: string;
  readonly captures: readonly string[];
  readonly nodeTypes: readonly string[];
  readonly fields: readonly string[];
}

interface SyntaxRow {
  readonly capture: string;
  readonly node: string;
  readonly name: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly itemStartLine: number;
  readonly itemEndLine: number;
  readonly itemCode: string;
  readonly nativeFactRef: string;
}

const catalogs: readonly Catalog[] = [
  {
    id: "declarations",
    path: "tree-sitter/tree-sitter-typescript/queries/declarations.scm",
    captures: [
      "function.definition",
      "function.name",
      "class.definition",
      "class.name",
      "interface.definition",
      "interface.name",
      "type.definition",
      "type.name",
      "enum.definition",
      "enum.name",
      "variable.definition",
      "variable.name",
      "import.declaration",
      "import.source",
      "export.declaration",
    ],
    nodeTypes: [
      "function_declaration",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
      "lexical_declaration",
      "variable_declarator",
      "import_statement",
      "export_statement",
    ],
    fields: ["name", "source"],
    source: [
      "(function_declaration name: (identifier) @function.name) @function.definition",
      "(class_declaration name: (type_identifier) @class.name) @class.definition",
      "(interface_declaration name: (type_identifier) @interface.name) @interface.definition",
      "(type_alias_declaration name: (type_identifier) @type.name) @type.definition",
      "(enum_declaration name: (identifier) @enum.name) @enum.definition",
      "(lexical_declaration (variable_declarator name: (identifier) @variable.name)) @variable.definition",
      "(import_statement source: (string) @import.source) @import.declaration",
      "(export_statement) @export.declaration",
    ].join("\n"),
  },
  {
    id: "imports",
    path: "tree-sitter/tree-sitter-typescript/queries/imports.scm",
    captures: ["import.declaration", "import.source", "export.declaration", "export.source"],
    nodeTypes: ["import_statement", "export_statement"],
    fields: ["source"],
    source: [
      "(import_statement source: (string) @import.source) @import.declaration",
      "(export_statement source: (string) @export.source) @export.declaration",
    ].join("\n"),
  },
  {
    id: "calls",
    path: "tree-sitter/tree-sitter-typescript/queries/calls.scm",
    captures: ["call.expression", "call.target"],
    nodeTypes: ["call_expression"],
    fields: ["function"],
    source: "(call_expression function: (_) @call.target) @call.expression",
  },
];

const supportedNodes = new Set([
  "function_declaration",
  "class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "lexical_declaration",
  "variable_declarator",
  "import_statement",
  "export_statement",
  "call_expression",
]);

export function renderTypeScriptTreeSitterQuery(
  projectRoot: string,
  options: TypeScriptTreeSitterQueryOptions,
): string {
  const query = resolveQuery(options);
  const rows = collectSyntaxRows(projectRoot, query, options);
  if (options.json) return `${JSON.stringify(packet(projectRoot, query, rows, options))}\n`;
  if (options.codeOnly) {
    return rows
      .map((row) => row.itemCode)
      .filter((code) => code.trim() !== "")
      .join("\n\n");
  }
  if (rows.length === 0) {
    return [
      `|syntax-query inputForm=${query.inputForm} input=${shellToken(query.input)} grammar=${TYPE_SCRIPT_TREE_SITTER_GRAMMAR_ID} grammarProfile=${TYPE_SCRIPT_TREE_SITTER_GRAMMAR_PROFILE_VERSION} dialect=tree-sitter-query mode=native-parser-projection matchStatus=miss rows=0 captures=${query.captures.join(",") || "-"}`,
      `|syntax-query-unsupported nodes=${query.unsupportedNodes.join(",") || "-"} supported=${query.supportedNodes.join(",") || "-"}`,
    ].join("\n");
  }
  return rows.map(renderSyntaxRow).join("\n\n");
}

function resolveQuery(options: TypeScriptTreeSitterQueryOptions): {
  readonly inputForm: "catalog-id" | "s-expression";
  readonly input: string;
  readonly source: string;
  readonly captures: readonly string[];
  readonly fields: readonly string[];
  readonly supportedNodes: readonly string[];
  readonly unsupportedNodes: readonly string[];
  readonly catalog?: Catalog;
} {
  if (options.catalogId !== undefined) {
    const catalog = catalogs.find((candidate) => candidate.id === options.catalogId);
    if (catalog === undefined)
      throw new Error(`unknown TypeScript tree-sitter query catalog: ${options.catalogId}`);
    return queryShape(
      "catalog-id",
      catalog.id,
      catalog.source,
      options.aspSyntaxQueryPlan ?? catalog,
      catalog,
    );
  }
  if (options.treeSitterQuery === undefined) {
    throw new Error("query requires --catalog <id> or --treesitter-query <s-expression>");
  }
  if (options.aspSyntaxQueryPlan === undefined) {
    throw new Error(
      "tree-sitter query projection requires ASP-compiled query plan; use `asp typescript query --treesitter-query ...` so ASP owns query ABI compilation",
    );
  }
  return queryShape(
    "s-expression",
    options.treeSitterQuery,
    options.treeSitterQuery,
    options.aspSyntaxQueryPlan,
  );
}

function queryShape(
  inputForm: "catalog-id" | "s-expression",
  input: string,
  source: string,
  plan: SyntaxQueryPlan,
  catalog?: Catalog,
): ReturnType<typeof resolveQuery> {
  const supported = plan.nodeTypes.filter((node) => supportedNodes.has(node));
  return {
    inputForm,
    input,
    source,
    captures: unique(plan.captures),
    fields: unique(plan.fields),
    supportedNodes: unique(supported),
    unsupportedNodes:
      supported.length === 0
        ? unique(plan.nodeTypes.filter((node) => !supportedNodes.has(node)))
        : [],
    ...(catalog === undefined ? {} : { catalog }),
  };
}

function collectSyntaxRows(
  projectRoot: string,
  query: ReturnType<typeof resolveQuery>,
  options: TypeScriptTreeSitterQueryOptions,
): readonly SyntaxRow[] {
  const queryNodes = query.supportedNodes;
  const captures = new Set(query.captures);
  const selector = parseSelector(options.selector);
  const rows: SyntaxRow[] = [];
  for (const filePath of discoverTypeScriptFiles([projectRoot])) {
    const normalizedPath = path.relative(projectRoot, filePath).replace(/\\/gu, "/");
    if (selector !== undefined && !selectorMatchesPath(selector.path, normalizedPath)) continue;
    const sourceText = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      normalizedPath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(normalizedPath),
    );
    rows.push(...rowsForSourceFile(sourceFile, sourceText, normalizedPath, queryNodes, captures));
  }
  return rows
    .filter((row) => selector === undefined || selectorOverlapsRow(selector, row))
    .filter((row) => termMatches(row, options.terms))
    .sort((left, right) => left.path.localeCompare(right.path) || left.startLine - right.startLine);
}

function rowsForSourceFile(
  sourceFile: ts.SourceFile,
  sourceText: string,
  relativePath: string,
  queryNodes: readonly string[],
  captures: ReadonlySet<string>,
): readonly SyntaxRow[] {
  const rows: SyntaxRow[] = [];
  const wants = (node: string) => queryNodes.length === 0 || queryNodes.includes(node);
  for (const statement of sourceFile.statements) {
    const nodeType = nodeTypeForStatement(statement);
    if (nodeType !== undefined && wants(nodeType)) {
      rows.push(
        ...declarationRows(sourceFile, sourceText, relativePath, statement, nodeType, captures),
      );
    }
  }
  if (wants("call_expression")) {
    collectCallRows(sourceFile, sourceFile, sourceText, relativePath, captures, rows);
  }
  return rows;
}

function declarationRows(
  sourceFile: ts.SourceFile,
  sourceText: string,
  relativePath: string,
  node: ts.Statement,
  nodeType: string,
  captures: ReadonlySet<string>,
): readonly SyntaxRow[] {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.flatMap((declaration) => {
      const name = bindingNameText(declaration.name);
      return name === undefined
        ? []
        : rowForNode(
            sourceFile,
            sourceText,
            relativePath,
            node,
            "variable_declarator",
            name,
            captures,
          );
    });
  }
  const name = declarationName(node);
  if (name === undefined) return [];
  return rowForNode(sourceFile, sourceText, relativePath, node, nodeType, name, captures);
}

function collectCallRows(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  sourceText: string,
  relativePath: string,
  captures: ReadonlySet<string>,
  rows: SyntaxRow[],
): void {
  if (ts.isCallExpression(node)) {
    rows.push(
      ...rowForNode(
        sourceFile,
        sourceText,
        relativePath,
        node,
        "call_expression",
        callName(node),
        captures,
      ),
    );
  }
  node.forEachChild((child) =>
    collectCallRows(sourceFile, child, sourceText, relativePath, captures, rows),
  );
}

function rowForNode(
  sourceFile: ts.SourceFile,
  sourceText: string,
  relativePath: string,
  node: ts.Node,
  nodeType: string,
  name: string,
  captures: ReadonlySet<string>,
): readonly SyntaxRow[] {
  const capture = captureForNode(nodeType, captures);
  if (capture === undefined) return [];
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  const startLine = start.line + 1;
  const endLine = end.line + 1;
  const itemCode = sourceCompactCode(sourceText, startLine, endLine);
  return [
    {
      capture,
      node: nodeType,
      name,
      path: relativePath,
      startLine,
      endLine,
      itemStartLine: startLine,
      itemEndLine: endLine,
      itemCode,
      nativeFactRef: `typescript:item:${relativePath}:${startLine}:${endLine}:${name}`,
    },
  ];
}

function packet(
  projectRoot: string,
  query: ReturnType<typeof resolveQuery>,
  rows: readonly SyntaxRow[],
  options: TypeScriptTreeSitterQueryOptions,
): Record<string, unknown> {
  const nativeFactRefs = unique(rows.map((row) => row.nativeFactRef));
  return {
    schemaId: SEMANTIC_TREE_SITTER_QUERY_SCHEMA_ID,
    schemaVersion: "1",
    protocolId: "agent.semantic-protocols.semantic-tree-sitter-query",
    protocolVersion: "1",
    languageId: TYPE_SCRIPT_LANGUAGE_ID,
    providerId: TYPE_SCRIPT_PROVIDER_ID,
    binary: TYPE_SCRIPT_BINARY,
    namespace: TYPE_SCRIPT_PROVIDER_NAMESPACE,
    projectRoot,
    grammarId: TYPE_SCRIPT_TREE_SITTER_GRAMMAR_ID,
    grammarProfileVersion: TYPE_SCRIPT_TREE_SITTER_GRAMMAR_PROFILE_VERSION,
    sourceAuthority: "native-parser-adapter",
    adapterMode: "native-projection",
    compatibilityLevel: "native-only",
    method: "query",
    query: {
      input: query.input,
      inputForm: query.inputForm,
      dialect: "tree-sitter-query",
      compiledSource: query.source,
      patternCount: Math.max(1, (query.source.match(/\(/gu) ?? []).length),
      ...(query.catalog === undefined
        ? {}
        : {
            catalogId: query.catalog.id,
            catalogPath: query.catalog.path,
            grammarProfilePath: TYPE_SCRIPT_TREE_SITTER_GRAMMAR_PROFILE_PATH,
          }),
      fields: {
        captures: query.captures,
        fields: query.fields,
        supportedNodes: query.supportedNodes,
        unsupportedNodes: query.unsupportedNodes,
        terms: [...options.terms],
        ...(options.selector === undefined ? {} : { selector: options.selector }),
      },
    },
    matches: rows.map((row, index) => ({
      id: `match:${index + 1}`,
      patternIndex: 0,
      range: rangeForRow(row),
      captures: [captureForRow(row, index)],
      nativeFactRefs: [row.nativeFactRef],
      fields: { name: row.name, node: row.node },
    })),
    nativeFactRefs,
    truncated: false,
    cache: {
      cacheStatus: "miss",
      requestFingerprint: digest(
        [query.source, ...options.terms, options.selector ?? ""].join("\n"),
      ),
      generationId: digest([projectRoot, query.source, String(rows.length)].join("\n")),
      artifactId: `semantic-tree-sitter-query/${query.inputForm}-${digest(query.input).slice(0, 16)}.json`,
      artifactKind: "semantic-tree-sitter-query",
      catalogFingerprint: digest(catalogs.map((catalog) => catalog.source).join("\n---\n")),
      grammarProfileFingerprint: TYPE_SCRIPT_TREE_SITTER_GRAMMAR_PROFILE_VERSION,
      rawSourceStored: false,
    },
  };
}

function captureForRow(row: SyntaxRow, index: number): Record<string, unknown> {
  return {
    id: `capture:${index + 1}`,
    name: row.capture,
    nodeType: row.node,
    named: true,
    range: rangeForRow(row),
    nativeFactRefs: [row.nativeFactRef],
    fields: {
      name: row.name,
      locator: `${row.path}:${row.startLine}:${row.endLine}`,
      read: `${row.path}:${row.itemStartLine}:${row.itemEndLine}`,
      frontier: "code",
    },
  };
}

function rangeForRow(row: SyntaxRow): Record<string, unknown> {
  return {
    path: row.path,
    lineRange: { start: row.startLine, end: row.endLine },
  };
}

function renderSyntaxRow(row: SyntaxRow): string {
  return `${syntaxLineLocator(row.path, row.startLine, row.endLine)}\n${captureTextForRow(row)}`;
}

function captureForNode(nodeType: string, captures: ReadonlySet<string>): string | undefined {
  const candidates =
    nodeType === "function_declaration"
      ? ["function.name", "function.definition"]
      : nodeType === "class_declaration"
        ? ["class.name", "class.definition"]
        : nodeType === "interface_declaration"
          ? ["interface.name", "interface.definition"]
          : nodeType === "type_alias_declaration"
            ? ["type.name", "type.definition"]
            : nodeType === "enum_declaration"
              ? ["enum.name", "enum.definition"]
              : nodeType === "variable_declarator" || nodeType === "lexical_declaration"
                ? ["variable.name", "variable.definition"]
                : nodeType === "import_statement"
                  ? ["import.source", "import.declaration"]
                  : nodeType === "export_statement"
                    ? ["export.source", "export.declaration"]
                    : nodeType === "call_expression"
                      ? ["call.target", "call.expression"]
                      : [];
  return candidates.find((capture) => captures.size === 0 || captures.has(capture));
}

function nodeTypeForStatement(node: ts.Statement): string | undefined {
  if (ts.isFunctionDeclaration(node)) return "function_declaration";
  if (ts.isClassDeclaration(node)) return "class_declaration";
  if (ts.isInterfaceDeclaration(node)) return "interface_declaration";
  if (ts.isTypeAliasDeclaration(node)) return "type_alias_declaration";
  if (ts.isEnumDeclaration(node)) return "enum_declaration";
  if (ts.isVariableStatement(node)) return "lexical_declaration";
  if (ts.isImportDeclaration(node)) return "import_statement";
  if (ts.isExportDeclaration(node)) return "export_statement";
  return undefined;
}

function declarationName(node: ts.Statement): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.text;
  }
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isExportDeclaration(node)) {
    return node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : "export";
  }
  return undefined;
}

function callName(node: ts.CallExpression): string {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return expression.getText();
}

function bindingNameText(name: ts.BindingName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  const text = name.getText();
  return text.length > 0 ? text : undefined;
}

function parseSelector(
  selector: string | undefined,
): { readonly path: string; readonly start?: number; readonly end?: number } | undefined {
  if (selector === undefined) return undefined;
  const match = /^(.*?)(?::(\d+)(?::(\d+))?)?$/u.exec(selector);
  if (match === null) return { path: selector };
  return {
    path: match[1]!.replace(/\\/gu, "/"),
    ...(match[2] === undefined ? {} : { start: Number(match[2]) }),
    ...(match[3] === undefined ? {} : { end: Number(match[3]) }),
  };
}

function selectorMatchesPath(selectorPath: string, rowPath: string): boolean {
  const normalized = selectorPath.replace(/\\/gu, "/");
  return (
    rowPath === normalized ||
    rowPath.endsWith(`/${normalized}`) ||
    normalized.endsWith(`/${rowPath}`)
  );
}

function selectorOverlapsRow(
  selector: { readonly path: string; readonly start?: number; readonly end?: number },
  row: SyntaxRow,
): boolean {
  if (!selectorMatchesPath(selector.path, row.path)) return false;
  if (selector.start === undefined) return true;
  const selectorEnd = selector.end ?? selector.start;
  return row.startLine <= selectorEnd && row.endLine >= selector.start;
}

function termMatches(row: SyntaxRow, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = `${row.name}\n${row.node}\n${row.capture}\n${row.itemCode}`.toLowerCase();
  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

function sourceCompactCode(sourceText: string, lineStart: number, lineEnd: number): string {
  return sourceText
    .split(/\r?\n/u)
    .slice(lineStart - 1, lineEnd)
    .join("\n")
    .trimEnd();
}

function syntaxLineLocator(filePath: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${filePath}:${startLine}` : `${filePath}:${startLine}:${endLine}`;
}

function captureTextForRow(row: SyntaxRow): string {
  if (
    row.capture.endsWith(".name") ||
    row.capture.endsWith(".target") ||
    row.capture.endsWith(".method") ||
    row.capture.endsWith(".source")
  ) {
    return row.name;
  }
  if (row.capture.endsWith(".definition")) {
    return row.itemCode;
  }
  return (
    row.itemCode
      .split(/\r?\n/u)
      .find((line) => line.trim() !== "")
      ?.trim() ?? row.name
  );
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function digest(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function shellToken(input: string): string {
  return input.replace(/\s+/gu, "_");
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
