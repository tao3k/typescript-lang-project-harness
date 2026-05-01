import type ts from "typescript";

import type { TypeScriptNativeDiagnostic } from "../model.js";

export interface ParsedPackageJson {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly main?: unknown;
  readonly module?: unknown;
  readonly types?: unknown;
  readonly typings?: unknown;
  readonly browser?: unknown;
  readonly exports?: unknown;
  readonly imports?: unknown;
  readonly bin?: unknown;
  readonly scripts?: unknown;
  readonly workspaces?: unknown;
}

export interface TypeScriptProgramInputs {
  readonly options: ts.CompilerOptions;
  readonly projectReferences?: readonly ts.ProjectReference[];
}

export interface ParsedPackageJsonDocument {
  readonly packageJson: ParsedPackageJson;
  readonly sourceFile: ts.JsonSourceFile;
  readonly rootObject?: ts.ObjectLiteralExpression;
  readonly diagnostics: readonly TypeScriptNativeDiagnostic[];
}
