/**
 * React parser fact facade for native syntax projections.
 *
 * This module re-exports React render, hook, and static definition facts owned
 * by the TypeScript parser layer.
 */
export type {
  TypeScriptReactHookCallSignalFact,
  TypeScriptReactHookCallViolationKind,
  TypeScriptReactRenderOwnerKind,
  TypeScriptReactRenderPuritySignalFact,
  TypeScriptReactRenderPuritySignalKind,
  TypeScriptReactStaticDefinitionSignalFact,
  TypeScriptReactStaticDefinitionSignalKind,
} from "../model.js";
export {
  collectReactRenderPuritySignals,
  collectReactHookCallSignals,
  collectReactStaticDefinitionSignals,
} from "./native_syntax/react.js";
