import ts from "typescript";

import type {
  TypeScriptEffectPromiseInteropRiskFact,
  TypeScriptEffectResourceScopeRiskFact,
  TypeScriptEffectRuntimeCallFact,
  TypeScriptEffectServiceMethodFact,
  TypeScriptEffectConcurrencySignalFact,
  TypeScriptPublicAsyncEffectSurfaceFact,
  TypeScriptPublicDiscriminatedUnionVariantFieldFact,
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicFunctionControlFlowFact,
  TypeScriptPublicFunctionParamFact,
  TypeScriptPublicTypeAliasFact,
  TypeScriptPublicTupleApiSurfaceFact,
} from "../../model.js";
import { collectPublicFunctionParams, collectPublicTupleApiSurfaces } from "./api_shape.js";
import { collectPublicAsyncEffectSurfaces } from "./async_effects.js";
import { collectPublicFunctionControlFlows } from "./control_flow.js";
import {
  collectPublicDataFields,
  collectPublicDiscriminatedUnionVariantFields,
  collectPublicTypeAliases,
} from "./data_shape.js";
import {
  collectEffectPromiseInteropRisks,
  collectEffectRuntimeCalls,
  collectEffectServiceMethods,
} from "./effect.js";
import { collectEffectConcurrencySignals } from "./effect_concurrency.js";
import { collectEffectResourceScopeRisks } from "./effect_resources.js";

export interface TypeScriptNativeSyntaxFacts {
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

export function collectTypeScriptNativeSyntaxFacts(
  sourceFile: ts.SourceFile,
): TypeScriptNativeSyntaxFacts {
  return {
    publicFunctionParams: collectPublicFunctionParams(sourceFile),
    publicTupleApiSurfaces: collectPublicTupleApiSurfaces(sourceFile),
    publicDataFields: collectPublicDataFields(sourceFile),
    publicTypeAliases: collectPublicTypeAliases(sourceFile),
    publicDiscriminatedUnionVariantFields: collectPublicDiscriminatedUnionVariantFields(sourceFile),
    publicFunctionControlFlows: collectPublicFunctionControlFlows(sourceFile),
    publicAsyncEffectSurfaces: collectPublicAsyncEffectSurfaces(sourceFile),
    effectRuntimeCalls: collectEffectRuntimeCalls(sourceFile),
    effectPromiseInteropRisks: collectEffectPromiseInteropRisks(sourceFile),
    effectResourceScopeRisks: collectEffectResourceScopeRisks(sourceFile),
    effectConcurrencySignals: collectEffectConcurrencySignals(sourceFile),
    effectServiceMethods: collectEffectServiceMethods(sourceFile),
  };
}
