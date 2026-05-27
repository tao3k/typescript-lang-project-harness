import type { SourceLocation } from "../model.js";

export interface TypeScriptPublicFunctionParamFact {
  readonly functionName: string;
  readonly functionLine: number;
  readonly paramName: string;
  readonly typeText?: string;
  readonly primitiveContractType?: string;
  readonly flagContractType?: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export interface TypeScriptPublicTupleApiSurfaceFact {
  readonly functionName: string;
  readonly functionLine: number;
  readonly surfaceName: string;
  readonly typeText: string;
  readonly elementContractTypes: readonly string[];
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export interface TypeScriptPublicDataFieldFact {
  readonly typeKind: "interface" | "type" | "class";
  readonly typeName: string;
  readonly typeLine: number;
  readonly fieldName: string;
  readonly typeText?: string;
  readonly primitiveContractType?: string;
  readonly flagContractType?: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export interface TypeScriptPublicTypeAliasFact {
  readonly aliasName: string;
  readonly targetTypeText: string;
  readonly primitiveContractType?: string;
  readonly flagContractType?: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export interface TypeScriptPublicDiscriminatedUnionVariantFieldFact {
  readonly unionName: string;
  readonly unionLine: number;
  readonly variantName: string;
  readonly variantLine: number;
  readonly discriminantName: string;
  readonly fieldName: string;
  readonly typeText?: string;
  readonly primitiveContractType?: string;
  readonly flagContractType?: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export interface TypeScriptPublicFunctionControlFlowFact {
  readonly functionName: string;
  readonly functionLine: number;
  readonly lineSpan: number;
  readonly statementCount: number;
  readonly branchCount: number;
  readonly loopCount: number;
  readonly maxNestingDepth: number;
  readonly maxBlockStatementCount: number;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export type TypeScriptEffectErrorChannelKind = "none" | "weak" | "domain";

export interface TypeScriptPublicAsyncEffectSurfaceFact {
  readonly functionName: string;
  readonly functionLine: number;
  readonly isAsync: boolean;
  readonly returnsPromise: boolean;
  readonly returnsEffect: boolean;
  readonly returnTypeText?: string;
  readonly successTypeText?: string;
  readonly errorTypeText?: string;
  readonly errorChannelKind?: TypeScriptEffectErrorChannelKind;
  readonly requirementsTypeText?: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export type TypeScriptEffectRuntimeCallKind =
  | "default-runtime"
  | "runtime-module"
  | "runtime-instance";

export interface TypeScriptEffectRuntimeCallFact {
  readonly callee: string;
  readonly callKind: TypeScriptEffectRuntimeCallKind;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export type TypeScriptEffectPromiseInteropRiskKind = "async-callback" | "throw" | "promise-reject";

export interface TypeScriptEffectPromiseInteropRiskFact {
  readonly ownerName: string;
  readonly ownerLine: number;
  readonly constructorName: "Effect.promise";
  readonly riskKinds: readonly TypeScriptEffectPromiseInteropRiskKind[];
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export interface TypeScriptEffectResourceScopeRiskFact {
  readonly ownerName: string;
  readonly ownerLine: number;
  readonly constructorName: "Effect.acquireRelease";
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export type TypeScriptEffectConcurrencySignalKind =
  | "effect-combinator-missing-concurrency"
  | "promise-combinator"
  | "sequential-await-loop";

export interface TypeScriptEffectConcurrencySignalFact {
  readonly ownerName: string;
  readonly ownerLine: number;
  readonly signalKind: TypeScriptEffectConcurrencySignalKind;
  readonly callee: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export type TypeScriptEffectSchemaBoundarySignalKind =
  | "json-parse-without-schema"
  | "response-json-without-schema";

export interface TypeScriptEffectSchemaBoundarySignalFact {
  readonly ownerName: string;
  readonly ownerLine: number;
  readonly signalKind: TypeScriptEffectSchemaBoundarySignalKind;
  readonly callee: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export type TypeScriptEffectProductionBoundarySignalKind =
  | "effect-async-interop"
  | "effect-promise-interop"
  | "effect-try-promise-interop"
  | "fetch-call";

export type TypeScriptEffectProductionBoundaryMissingCapability = "observability" | "resilience";

export interface TypeScriptEffectProductionBoundarySignalFact {
  readonly ownerName: string;
  readonly ownerLine: number;
  readonly signalKind: TypeScriptEffectProductionBoundarySignalKind;
  readonly callee: string;
  readonly missingCapabilities: readonly TypeScriptEffectProductionBoundaryMissingCapability[];
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}

export type TypeScriptEffectServiceContainerKind = "interface" | "type" | "class" | "effect-tag";

export interface TypeScriptEffectServiceMethodFact {
  readonly containerKind: TypeScriptEffectServiceContainerKind;
  readonly containerName: string;
  readonly methodName: string;
  readonly returnTypeText: string;
  readonly successTypeText?: string;
  readonly errorTypeText?: string;
  readonly errorChannelKind?: TypeScriptEffectErrorChannelKind;
  readonly requirementsTypeText?: string;
  readonly location: SourceLocation;
  readonly sourceLine?: string;
}
