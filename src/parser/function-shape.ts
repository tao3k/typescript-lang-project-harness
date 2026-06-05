/**
 * Function shape parser facade.
 *
 * This module re-exports public function parameter, tuple, and control-flow
 * fact collectors used by agent policy rules.
 */
export type {
  TypeScriptPublicFunctionControlFlowFact,
  TypeScriptPublicFunctionParamFact,
  TypeScriptPublicTupleApiSurfaceFact,
} from "../model.js";
export {
  collectPublicFunctionParams,
  collectPublicTupleApiSurfaces,
} from "./native_syntax/api_shape.js";
export { collectPublicFunctionControlFlows } from "./native_syntax/control_flow.js";
