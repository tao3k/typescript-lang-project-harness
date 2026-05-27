import type {
  TypeScriptExportFact,
  TypeScriptImportFact,
  TypeScriptNativeDiagnostic,
  TypeScriptNativeImportResolutionFact,
} from "../model.js";
import type {
  TypeScriptEffectPromiseInteropRiskFact,
  TypeScriptEffectResourceScopeRiskFact,
  TypeScriptEffectRuntimeCallFact,
  TypeScriptEffectServiceMethodFact,
  TypeScriptEffectConcurrencySignalFact,
  TypeScriptPublicAsyncEffectSurfaceFact,
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicDiscriminatedUnionVariantFieldFact,
  TypeScriptPublicFunctionControlFlowFact,
  TypeScriptPublicFunctionParamFact,
  TypeScriptPublicTupleApiSurfaceFact,
  TypeScriptPublicTypeAliasFact,
} from "./native_syntax.js";

export type TypeScriptModuleRole =
  | "source"
  | "test"
  | "config"
  | "declaration"
  | "facade"
  | "entrypoint"
  | "unknown";

export type TypeScriptModuleLayer =
  | "parser"
  | "reasoning"
  | "policy"
  | "render"
  | "model"
  | "harness"
  | "test"
  | "config"
  | "unknown";

export interface TypeScriptModuleReport {
  readonly path: string;
  readonly isValid: boolean;
  readonly scriptKind: "ts" | "tsx" | "mts" | "cts" | "js" | "jsx" | "mjs" | "cjs" | "unknown";
  readonly isDeclarationFile: boolean;
  readonly hasIntentDoc: boolean;
  readonly lineCount: number;
  readonly diagnostics: readonly TypeScriptNativeDiagnostic[];
  readonly semanticDiagnostics: readonly TypeScriptNativeDiagnostic[];
  readonly imports: readonly TypeScriptImportFact[];
  readonly importResolutions: readonly TypeScriptNativeImportResolutionFact[];
  readonly exports: readonly TypeScriptExportFact[];
  readonly publicFunctionParams: readonly TypeScriptPublicFunctionParamFact[];
  readonly publicTupleApiSurfaces: readonly TypeScriptPublicTupleApiSurfaceFact[];
  readonly publicDataFields: readonly TypeScriptPublicDataFieldFact[];
  readonly publicTypeAliases: readonly TypeScriptPublicTypeAliasFact[];
  readonly publicDiscriminatedUnionVariantFields: readonly TypeScriptPublicDiscriminatedUnionVariantFieldFact[];
  readonly publicFunctionControlFlows: readonly TypeScriptPublicFunctionControlFlowFact[];
  readonly publicAsyncEffectSurfaces: readonly TypeScriptPublicAsyncEffectSurfaceFact[];
  readonly effectRuntimeCalls: readonly TypeScriptEffectRuntimeCallFact[];
  readonly effectPromiseInteropRisks: readonly TypeScriptEffectPromiseInteropRiskFact[];
  readonly effectResourceScopeRisks: readonly TypeScriptEffectResourceScopeRiskFact[];
  readonly effectConcurrencySignals: readonly TypeScriptEffectConcurrencySignalFact[];
  readonly effectServiceMethods: readonly TypeScriptEffectServiceMethodFact[];
}

export interface TypeScriptReasoningModule {
  readonly path: string;
  readonly role: TypeScriptModuleRole;
  readonly layer: TypeScriptModuleLayer;
  readonly isValid: boolean;
  readonly hasIntentDoc: boolean;
  readonly lineCount: number;
  readonly syntaxDiagnosticCount: number;
  readonly semanticDiagnosticCount: number;
  readonly exportNames: readonly string[];
  readonly typeOnlyExportNames: readonly string[];
  readonly importSpecifiers: readonly string[];
  readonly publicFunctionParams: readonly TypeScriptPublicFunctionParamFact[];
  readonly publicTupleApiSurfaces: readonly TypeScriptPublicTupleApiSurfaceFact[];
  readonly publicDataFields: readonly TypeScriptPublicDataFieldFact[];
  readonly publicTypeAliases: readonly TypeScriptPublicTypeAliasFact[];
  readonly publicDiscriminatedUnionVariantFields: readonly TypeScriptPublicDiscriminatedUnionVariantFieldFact[];
  readonly publicFunctionControlFlows: readonly TypeScriptPublicFunctionControlFlowFact[];
  readonly publicAsyncEffectSurfaces: readonly TypeScriptPublicAsyncEffectSurfaceFact[];
  readonly effectRuntimeCalls: readonly TypeScriptEffectRuntimeCallFact[];
  readonly effectPromiseInteropRisks: readonly TypeScriptEffectPromiseInteropRiskFact[];
  readonly effectResourceScopeRisks: readonly TypeScriptEffectResourceScopeRiskFact[];
  readonly effectConcurrencySignals: readonly TypeScriptEffectConcurrencySignalFact[];
  readonly effectServiceMethods: readonly TypeScriptEffectServiceMethodFact[];
}
