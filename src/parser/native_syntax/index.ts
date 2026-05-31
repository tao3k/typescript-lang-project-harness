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
    publicFunctionParams: collectSafely(() => collectPublicFunctionParams(sourceFile)),
    publicTupleApiSurfaces: collectSafely(() => collectPublicTupleApiSurfaces(sourceFile)),
    publicDataFields: collectSafely(() => collectPublicDataFields(sourceFile)),
    publicTypeAliases: collectSafely(() => collectPublicTypeAliases(sourceFile)),
    publicDiscriminatedUnionVariantFields: collectSafely(() =>
      collectPublicDiscriminatedUnionVariantFields(sourceFile),
    ),
    publicFunctionControlFlows: collectSafely(() => collectPublicFunctionControlFlows(sourceFile)),
    publicAsyncEffectSurfaces: collectSafely(() => collectPublicAsyncEffectSurfaces(sourceFile)),
    effectRuntimeCalls: collectSafely(() => collectEffectRuntimeCalls(sourceFile)),
    effectPromiseInteropRisks: collectSafely(() => collectEffectPromiseInteropRisks(sourceFile)),
    effectResourceScopeRisks: collectSafely(() => collectEffectResourceScopeRisks(sourceFile)),
    effectConcurrencySignals: collectSafely(() => collectEffectConcurrencySignals(sourceFile)),
    effectSchemaBoundarySignals: collectSafely(() =>
      collectEffectSchemaBoundarySignals(sourceFile),
    ),
    effectProductionBoundarySignals: collectSafely(() =>
      collectEffectProductionBoundarySignals(sourceFile),
    ),
    effectServiceMethods: collectSafely(() => collectEffectServiceMethods(sourceFile)),
    reactRenderPuritySignals: collectSafely(() => collectReactRenderPuritySignals(sourceFile)),
    reactHookCallSignals: collectSafely(() => collectReactHookCallSignals(sourceFile)),
    reactStaticDefinitionSignals: collectSafely(() =>
      collectReactStaticDefinitionSignals(sourceFile),
    ),
  };
}

function collectSafely<T>(collector: () => readonly T[]): readonly T[] {
  try {
    return collector();
  } catch {
    return [];
  }
}
