import type { SourceLocation } from "../model.js";
import type { TypeScriptPackageDependencySource } from "./package_dependencies.js";

export type TypeScriptPackageExtensionName = "effect" | "react" | "shadcn";

export type TypeScriptPackageExtensionActivation =
  | "dependency"
  | "config-enabled"
  | "config-enabled-missing-dependency";

export type TypeScriptPackageExtensionDependencySource = TypeScriptPackageDependencySource;

export type TypeScriptPackageExtensionConfigSource =
  | "typescriptProjectHarness"
  | "typescriptLangProjectHarness"
  | "typescript-lang-project-harness";

export type TypeScriptPackageExtensionCoverage = "project";

export interface TypeScriptPackageExtensionFact {
  readonly name: TypeScriptPackageExtensionName;
  readonly displayName: string;
  readonly packageName: string;
  readonly activation: TypeScriptPackageExtensionActivation;
  readonly coverage: TypeScriptPackageExtensionCoverage;
  readonly capabilities: readonly string[];
  readonly location: SourceLocation;
  readonly dependencySource?: TypeScriptPackageExtensionDependencySource;
  readonly configSource?: TypeScriptPackageExtensionConfigSource;
}
