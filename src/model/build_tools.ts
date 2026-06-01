import type {
  SourceLocation,
  TypeScriptPackageDependencySource,
  TypeScriptPackageExtensionConfigSource,
} from "../model.js";

export type TypeScriptPackageBuildToolName = "rspack" | "rsbuild";

export type TypeScriptPackageBuildToolSignalKind =
  | "dependency"
  | "script"
  | "config"
  | "harness-config";

export type TypeScriptPackageBuildToolDependencySource = TypeScriptPackageDependencySource;

export type TypeScriptPackageBuildToolConfigSource = TypeScriptPackageExtensionConfigSource;

export interface TypeScriptPackageBuildToolSignalFact {
  readonly kind: TypeScriptPackageBuildToolSignalKind;
  readonly value: string;
  readonly location: SourceLocation;
  readonly source?: string;
}

export interface TypeScriptPackageBuildToolFact {
  readonly name: TypeScriptPackageBuildToolName;
  readonly displayName: string;
  readonly packageNames: readonly string[];
  readonly configFiles: readonly string[];
  readonly scriptNames: readonly string[];
  readonly capabilities: readonly string[];
  readonly signals: readonly TypeScriptPackageBuildToolSignalFact[];
  readonly location: SourceLocation;
}
