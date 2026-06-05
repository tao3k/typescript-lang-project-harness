/**
 * Effect parser fact facade for TypeScript native syntax projections.
 *
 * This module re-exports Effect-specific fact types and collectors used by the
 * extension policy pack.
 */
export type {
  TypeScriptEffectConcurrencySignalFact,
  TypeScriptEffectConcurrencySignalKind,
  TypeScriptEffectErrorChannelKind,
  TypeScriptEffectProductionBoundaryMissingCapability,
  TypeScriptEffectProductionBoundarySignalFact,
  TypeScriptEffectProductionBoundarySignalKind,
  TypeScriptEffectPromiseInteropRiskFact,
  TypeScriptEffectPromiseInteropRiskKind,
  TypeScriptEffectResourceScopeRiskFact,
  TypeScriptEffectRuntimeBoundaryKind,
  TypeScriptEffectRuntimeCallFact,
  TypeScriptEffectRuntimeCallKind,
  TypeScriptEffectSchemaBoundarySignalFact,
  TypeScriptEffectSchemaBoundarySignalKind,
  TypeScriptEffectServiceContainerKind,
  TypeScriptEffectServiceMethodFact,
  TypeScriptPublicAsyncEffectSurfaceFact,
} from "../model.js";
export { collectEffectRuntimeCalls } from "./native_syntax/effect.js";
export { collectEffectPromiseInteropRisks } from "./native_syntax/effect.js";
export { collectEffectServiceMethods } from "./native_syntax/effect.js";
export { collectEffectConcurrencySignals } from "./native_syntax/effect_concurrency.js";
export { collectEffectProductionBoundarySignals } from "./native_syntax/effect_production.js";
export { collectEffectResourceScopeRisks } from "./native_syntax/effect_resources.js";
export { collectEffectSchemaBoundarySignals } from "./native_syntax/effect_schema.js";
