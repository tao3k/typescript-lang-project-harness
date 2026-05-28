import type { TypeScriptReasoningTree } from "../../../model.js";

/** Check if the shadcn extension is active on this project. */
export function shadcnPolicyIsActive(tree: TypeScriptReasoningTree): boolean {
  return tree.packageExtensions.some((ext) => ext.name === "shadcn");
}
