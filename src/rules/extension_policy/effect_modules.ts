import type {
  TypeScriptPackageExtensionFact,
  TypeScriptReasoningModule,
  TypeScriptReasoningTree,
} from "../../model.js";

export function activeEffectExtension(
  extensions: readonly TypeScriptPackageExtensionFact[],
): TypeScriptPackageExtensionFact | undefined {
  return extensions.find(
    (extension) =>
      extension.name === "effect" && extension.activation !== "config-enabled-missing-dependency",
  );
}

export function effectPolicyIsActive(
  extensions: readonly TypeScriptPackageExtensionFact[],
): boolean {
  return activeEffectExtension(extensions) !== undefined;
}

export function sourceModules(tree: TypeScriptReasoningTree): readonly TypeScriptReasoningModule[] {
  return effectPolicySourceModules(tree).filter(
    (moduleReport) => moduleReport.role !== "entrypoint",
  );
}

export function effectPolicySourceModules(
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
