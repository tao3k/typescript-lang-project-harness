import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { TsParsedModule, TsSourceKind } from "./model.js";
import { collectImports } from "./facts/imports.js";
import { collectExports } from "./facts/exports.js";
import { collectPublicItems } from "./facts/public-items.js";
import { collectFunctionShapes } from "./facts/function-shape.js";
import { collectReactFacts } from "./facts/react.js";
import { collectEffectFacts } from "./facts/effect.js";

export function parseModule(filePath: string): TsParsedModule {
  const absolute = path.resolve(filePath);

  let raw: string;
  try {
    raw = fs.readFileSync(absolute, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      path: absolute,
      isValid: false,
      sourceKind: sourceKindFromPath(absolute),
      imports: [],
      exports: [],
      publicItems: [],
      functions: [],
      reactFacts: [],
      effectFacts: [],
      parseError: message,
    } as TsParsedModule;
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      absolute,
      raw,
      ts.ScriptTarget.Latest,
      true,
      tsScriptKind(sourceKindFromPath(absolute)),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      path: absolute,
      isValid: false,
      sourceKind: sourceKindFromPath(absolute),
      imports: [],
      exports: [],
      publicItems: [],
      functions: [],
      reactFacts: [],
      effectFacts: [],
      parseError: message,
    } as TsParsedModule;
  }

  // Check for syntax diagnostics (parseDiagnostics exists at runtime but not in TS types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseDiags = (sourceFile as unknown as Record<string, unknown>)["parseDiagnostics"] as
    | ts.Diagnostic[]
    | undefined;
  const diagnostics = parseDiags?.filter((d) => d.category === ts.DiagnosticCategory.Error);

  if (diagnostics !== undefined && diagnostics.length > 0) {
    return {
      path: absolute,
      isValid: false,
      sourceKind: sourceKindFromPath(absolute),
      imports: [],
      exports: [],
      publicItems: [],
      functions: [],
      reactFacts: [],
      effectFacts: [],
      parseError: ts.formatDiagnostics(diagnostics, {
        getCurrentDirectory: () => path.dirname(absolute),
        getCanonicalFileName: (f) => f,
        getNewLine: () => " ",
      }),
    } as TsParsedModule;
  }

  return {
    path: absolute,
    isValid: true,
    sourceKind: sourceKindFromPath(absolute),
    sourceText: raw,
    imports: collectImports(sourceFile),
    exports: collectExports(sourceFile),
    publicItems: collectPublicItems(sourceFile),
    functions: collectFunctionShapes(sourceFile),
    reactFacts: collectReactFacts(sourceFile),
    effectFacts: collectEffectFacts(sourceFile),
  };
}

function tsScriptKind(kind: TsSourceKind): ts.ScriptKind {
  switch (kind) {
    case "tsx":
      return ts.ScriptKind.TSX;
    case "mts":
      return ts.ScriptKind.TS;
    case "cts":
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.TS;
  }
}

function sourceKindFromPath(filePath: string): TsSourceKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx") return "tsx";
  if (ext === ".mts") return "mts";
  if (ext === ".cts") return "cts";
  return "ts";
}
