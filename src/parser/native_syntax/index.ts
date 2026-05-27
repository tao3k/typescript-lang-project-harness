import ts from "typescript";

import type {
  TypeScriptEffectPromiseInteropRiskFact,
  TypeScriptEffectProductionBoundarySignalFact,
  TypeScriptEffectResourceScopeRiskFact,
  TypeScriptEffectRuntimeCallFact,
  TypeScriptEffectSchemaBoundarySignalFact,
  TypeScriptEffectServiceMethodFact,
  TypeScriptEffectConcurrencySignalFact,
  TypeScriptPublicAsyncEffectSurfaceFact,
  TypeScriptPublicDiscriminatedUnionVariantFieldFact,
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicFunctionControlFlowFact,
  TypeScriptPublicFunctionParamFact,
  TypeScriptReactHookCallSignalFact,
  TypeScriptReactRenderPuritySignalFact,
  TypeScriptReactStaticDefinitionSignalFact,
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
import { collectEffectSchemaBoundarySignals } from "./effect_schema.js";
import { collectEffectProductionBoundarySignals } from "./effect_production.js";
import {
  collectReactHookCallSignals,
  collectReactRenderPuritySignals,
  collectReactStaticDefinitionSignals,
} from "./react.js";

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
  readonly effectSchemaBoundarySignals: readonly TypeScriptEffectSchemaBoundarySignalFact[];
  readonly effectProductionBoundarySignals: readonly TypeScriptEffectProductionBoundarySignalFact[];
  readonly effectServiceMethods: readonly TypeScriptEffectServiceMethodFact[];
  readonly reactRenderPuritySignals: readonly TypeScriptReactRenderPuritySignalFact[];
  readonly reactHookCallSignals: readonly TypeScriptReactHookCallSignalFact[];
  readonly reactStaticDefinitionSignals: readonly TypeScriptReactStaticDefinitionSignalFact[];
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
    effectSchemaBoundarySignals: collectEffectSchemaBoundarySignals(sourceFile),
    effectProductionBoundarySignals: collectEffectProductionBoundarySignals(sourceFile),
    effectServiceMethods: collectEffectServiceMethods(sourceFile),
    reactRenderPuritySignals: collectReactRenderPuritySignals(sourceFile),
    reactHookCallSignals: collectReactHookCallSignals(sourceFile),
    reactStaticDefinitionSignals: collectReactStaticDefinitionSignals(sourceFile),
  };
}
