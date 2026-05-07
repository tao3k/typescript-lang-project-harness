import ts from "typescript";

import type {
  TypeScriptPublicDataFieldFact,
  TypeScriptPublicFunctionControlFlowFact,
  TypeScriptPublicFunctionParamFact,
  TypeScriptPublicTupleApiSurfaceFact,
} from "../../model.js";
import { collectPublicFunctionParams, collectPublicTupleApiSurfaces } from "./api_shape.js";
import { collectPublicFunctionControlFlows } from "./control_flow.js";
import { collectPublicDataFields } from "./data_shape.js";

export interface TypeScriptNativeSyntaxFacts {
  readonly publicFunctionParams: readonly TypeScriptPublicFunctionParamFact[];
  readonly publicTupleApiSurfaces: readonly TypeScriptPublicTupleApiSurfaceFact[];
  readonly publicDataFields: readonly TypeScriptPublicDataFieldFact[];
  readonly publicFunctionControlFlows: readonly TypeScriptPublicFunctionControlFlowFact[];
}

export function collectTypeScriptNativeSyntaxFacts(
  sourceFile: ts.SourceFile,
): TypeScriptNativeSyntaxFacts {
  return {
    publicFunctionParams: collectPublicFunctionParams(sourceFile),
    publicTupleApiSurfaces: collectPublicTupleApiSurfaces(sourceFile),
    publicDataFields: collectPublicDataFields(sourceFile),
    publicFunctionControlFlows: collectPublicFunctionControlFlows(sourceFile),
  };
}
