import type {
  TypeScriptPackageExtensionFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningTree,
} from "../../model.js";

export function activeReactExtension(
  extensions: readonly TypeScriptPackageExtensionFact[],
): TypeScriptPackageExtensionFact | undefined {
  return extensions.find(
    (extension) =>
      extension.name === "react" && extension.activation !== "config-enabled-missing-dependency",
  );
}

export function reactPolicyIsActive(
  extensions: readonly TypeScriptPackageExtensionFact[],
): boolean {
  return activeReactExtension(extensions) !== undefined;
}

export function reactPolicySourceModules(
  tree: TypeScriptReasoningTree,
): readonly TypeScriptReasoningModule[] {
  return tree.modules.filter(
    (moduleReport) =>
      moduleReport.isValid &&
      moduleReport.role !== "test" &&
      moduleReport.role !== "declaration" &&
      moduleReport.role !== "config",
  );
}
