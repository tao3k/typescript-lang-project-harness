/**
 * Compiler option fact extraction for TypeScript projects.
 *
 * This module normalizes native compiler options into compact parser-owned
 * facts used by policy and search surfaces.
 */
import path from "node:path";

import ts from "typescript";

import type { TypeScriptCompilerOptionFacts, TypeScriptProjectConfigFacts } from "../model.js";

export function defaultCompilerOptionFacts(): TypeScriptCompilerOptionFacts {
  return {
    rootDirs: [],
    allowJs: false,
    checkJs: false,
    noEmit: false,
    composite: false,
    declaration: false,
    emitDeclarationOnly: false,
    declarationMap: false,
    sourceMap: false,
  };
}

export function compilerOptionFacts(options: ts.CompilerOptions): TypeScriptCompilerOptionFacts {
  const facts: TypeScriptCompilerOptionFacts = {
    rootDirs: (options.rootDirs ?? []).map((rootDir) => path.resolve(rootDir)).sort(),
    allowJs: options.allowJs === true,
    checkJs: options.checkJs === true,
    noEmit: options.noEmit === true,
    composite: options.composite === true,
    declaration: options.declaration === true,
    emitDeclarationOnly: options.emitDeclarationOnly === true,
    declarationMap: options.declarationMap === true,
    sourceMap: options.sourceMap === true,
  };
  const withRootDir =
    options.rootDir === undefined ? facts : { ...facts, rootDir: path.resolve(options.rootDir) };
  const withOutDir =
    options.outDir === undefined
      ? withRootDir
      : { ...withRootDir, outDir: path.resolve(options.outDir) };
  const withJsx =
    options.jsx === undefined ? withOutDir : { ...withOutDir, jsx: jsxEmitLabel(options.jsx) };
  const withModule =
    options.module === undefined
      ? withJsx
      : { ...withJsx, module: moduleKindLabel(options.module) };
  const effectiveModuleResolution = effectiveModuleResolutionKind(options);
  const withModuleResolution =
    effectiveModuleResolution === undefined
      ? withModule
      : { ...withModule, moduleResolution: moduleResolutionKindLabel(effectiveModuleResolution) };
  return options.target === undefined
    ? withModuleResolution
    : { ...withModuleResolution, target: scriptTargetLabel(options.target) };
}

export function pathAliasFacts(
  paths: ts.MapLike<string[]> | undefined,
  baseUrl: string,
): TypeScriptProjectConfigFacts["pathAliases"] {
  if (paths === undefined) {
    return [];
  }
  return Object.entries(paths)
    .map(([pattern, targets]) => ({
      pattern,
      targets: [...targets],
      baseUrl,
    }))
    .sort((left, right) => left.pattern.localeCompare(right.pattern));
}

function jsxEmitLabel(jsx: ts.JsxEmit): string {
  switch (jsx) {
    case ts.JsxEmit.None:
      return "none";
    case ts.JsxEmit.Preserve:
      return "preserve";
    case ts.JsxEmit.React:
      return "react";
    case ts.JsxEmit.ReactNative:
      return "react-native";
    case ts.JsxEmit.ReactJSX:
      return "react-jsx";
    case ts.JsxEmit.ReactJSXDev:
      return "react-jsxdev";
  }
}

function moduleKindLabel(moduleKind: ts.ModuleKind): string {
  return ts.ModuleKind[moduleKind] ?? String(moduleKind);
}

function moduleResolutionKindLabel(moduleResolutionKind: ts.ModuleResolutionKind): string {
  return ts.ModuleResolutionKind[moduleResolutionKind] ?? String(moduleResolutionKind);
}

function scriptTargetLabel(scriptTarget: ts.ScriptTarget): string {
  return ts.ScriptTarget[scriptTarget] ?? String(scriptTarget);
}

interface TypeScriptRuntimeModuleResolutionApi {
  readonly getEmitModuleResolutionKind?: (
    options: ts.CompilerOptions,
  ) => ts.ModuleResolutionKind | undefined;
}

function effectiveModuleResolutionKind(
  options: ts.CompilerOptions,
): ts.ModuleResolutionKind | undefined {
  const runtimeApi = ts as typeof ts & TypeScriptRuntimeModuleResolutionApi;
  return runtimeApi.getEmitModuleResolutionKind?.(options) ?? options.moduleResolution;
}
