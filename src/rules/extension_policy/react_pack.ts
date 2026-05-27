import type {
  TypeScriptHarnessFinding,
  TypeScriptHarnessRule,
  TypeScriptReasoningTree,
} from "../../model.js";
import {
  evaluateReactConfigurationFindings,
  evaluateReactHookCallFindings,
  evaluateReactRenderPurityAdvice,
  evaluateReactStaticDefinitionAdvice,
  TS_EXT_REACT_R001,
  TS_EXT_REACT_R002,
  TS_EXT_REACT_R003,
  TS_EXT_REACT_R004,
} from "./react_purity.js";

export function typeScriptReactExtensionPolicyRules(): readonly TypeScriptHarnessRule[] {
  return [TS_EXT_REACT_R001, TS_EXT_REACT_R002, TS_EXT_REACT_R003, TS_EXT_REACT_R004];
}

export function evaluateReactExtensionPolicyRules(
  reasoningTree: TypeScriptReasoningTree,
): readonly TypeScriptHarnessFinding[] {
  return [
    ...evaluateReactConfigurationFindings(reasoningTree),
    ...evaluateReactRenderPurityAdvice(reasoningTree),
    ...evaluateReactHookCallFindings(reasoningTree),
    ...evaluateReactStaticDefinitionAdvice(reasoningTree),
  ];
}
