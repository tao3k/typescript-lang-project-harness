import type { SourceLocation } from "../model.js";

export type TypeScriptPackageExtensionName = "effect";

export type TypeScriptPackageExtensionActivation =
  | "dependency"
  | "config-enabled"
  | "config-enabled-missing-dependency";

export type TypeScriptPackageExtensionDependencySource =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

export type TypeScriptPackageExtensionConfigSource =
  | "typescriptProjectHarness"
  | "typescriptLangProjectHarness"
  | "typescript-lang-project-harness";

export interface TypeScriptPackageExtensionFact {
  readonly name: TypeScriptPackageExtensionName;
  readonly displayName: string;
  readonly packageName: string;
  readonly activation: TypeScriptPackageExtensionActivation;
  readonly capabilities: readonly string[];
  readonly location: SourceLocation;
  readonly dependencySource?: TypeScriptPackageExtensionDependencySource;
  readonly configSource?: TypeScriptPackageExtensionConfigSource;
}
