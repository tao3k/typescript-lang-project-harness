import type {
  TsEffectFact,
  TsExportFact,
  TsModuleRole,
  TsParsedModule,
  TsPublicItemFact,
  TsReactFact,
} from "./model.js";

export function classifyRole(mod: TsParsedModule): TsModuleRole {
  return (
    classifyTestRole(mod) ??
    classifyReactRole(mod) ??
    classifyEffectRole(mod) ??
    classifyConfigRole(mod) ??
    classifyStructuralRole(mod)
  );
}

function classifyTestRole(mod: TsParsedModule): TsModuleRole | undefined {
  if (
    mod.path.includes(".test.") ||
    mod.path.includes("/__tests__/") ||
    mod.path.includes(".spec.")
  ) {
    return "test-entrypoint";
  }
  return undefined;
}

function classifyReactRole(mod: TsParsedModule): TsModuleRole | undefined {
  if (mod.reactFacts.some((f: TsReactFact) => f.factKind === "component")) return "react-component";
  if (mod.reactFacts.some((f: TsReactFact) => f.factKind === "hook")) return "react-hook";
  return undefined;
}

function classifyEffectRole(mod: TsParsedModule): TsModuleRole | undefined {
  if (mod.effectFacts.some((f: TsEffectFact) => f.factKind === "layer")) return "effect-layer";
  if (mod.effectFacts.some((f: TsEffectFact) => f.factKind === "context")) return "effect-service";
  return undefined;
}

function classifyConfigRole(mod: TsParsedModule): TsModuleRole | undefined {
  if (isConfigFile(mod) || isAllVariableExports(mod)) return "config";
  return undefined;
}

function classifyStructuralRole(mod: TsParsedModule): TsModuleRole {
  const hasExports = mod.exports.filter((e: TsExportFact) => e.exportKind !== "star").length > 0;
  const hasPublicItems = mod.publicItems.filter((p: TsPublicItemFact) => p.exported).length > 0;
  const hasImports = mod.imports.length > 0;
  const reexportCount = mod.exports.filter((e: TsExportFact) => e.exportKind === "reexport").length;
  const starCount = mod.exports.filter((e: TsExportFact) => e.exportKind === "star").length;

  if (isFacade(reexportCount, starCount, mod)) return "facade";
  if (isEntrypointName(mod)) return "entrypoint";
  if (mod.effectFacts.some((f: TsEffectFact) => f.factKind === "runtime")) return "entrypoint";
  if ((hasExports || hasPublicItems) && !hasImports) return "leaf";
  if (hasImports && (hasExports || hasPublicItems)) return "branch";
  if (!hasExports && !hasPublicItems) return "internal";
  return "leaf";
}

function isFacade(reexportCount: number, starCount: number, mod: TsParsedModule): boolean {
  return (
    reexportCount + starCount >= 2 &&
    mod.publicItems.filter((p: TsPublicItemFact) => p.exported).length <= 2
  );
}

function isEntrypointName(mod: TsParsedModule): boolean {
  const basename = mod.path.split("/").at(-1)?.toLowerCase() ?? "";
  return (
    basename === "main.ts" ||
    basename === "main.tsx" ||
    basename === "cli.ts" ||
    basename === "cli.tsx" ||
    basename === "index.ts" ||
    basename === "index.tsx"
  );
}

function isConfigFile(mod: TsParsedModule): boolean {
  const basename = mod.path.split("/").at(-1)?.toLowerCase() ?? "";
  return basename.includes("config") || basename.includes(".config");
}

function isAllVariableExports(mod: TsParsedModule): boolean {
  const named = mod.exports.filter(
    (e: TsExportFact) => e.exportKind !== "star" && e.exportKind !== "reexport",
  );
  return named.length > 0 && named.every((e: TsExportFact) => e.exportKind === "variable");
}
