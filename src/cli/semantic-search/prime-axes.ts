/**
 * TypeScript-specific axis nodes for the prime semantic-search view.
 */

import type { TypeScriptHarnessReport } from "../../model.js";
import type { SemanticSearchFieldValue, SemanticSearchNode } from "./types.js";
import { relPath } from "./utils.js";

export function primeTypeScriptAxisNodes(
  report: TypeScriptHarnessReport,
): readonly SemanticSearchNode[] {
  return [
    tsconfigPrimeNode(report),
    testSurfacePrimeNode(report),
    ...report.reasoningTree.packageExtensions.map((extension) => ({
      id: `X:${extension.name}`,
      kind: "extension" as const,
      path: extension.name,
      fields: compactFields({
        activation: extension.activation,
        coverage: extension.coverage,
        package: extension.packageName,
        capabilities: extension.capabilities,
        dependency: extension.dependencySource,
        config: extension.configSource,
        next: [`extension:${extension.name}`],
      }),
    })),
    ...report.reasoningTree.packageBuildTools.map((tool) => ({
      id: `B:${tool.name}`,
      kind: "build_tool" as const,
      path: tool.name,
      fields: compactFields({
        packages: tool.packageNames,
        configs: tool.configFiles,
        scripts: tool.scriptNames,
        capabilities: tool.capabilities,
        next: [`build-tool:${tool.name}`],
      }),
    })),
  ];
}

function tsconfigPrimeNode(report: TypeScriptHarnessReport): SemanticSearchNode {
  const tree = report.reasoningTree;
  const options = tree.compilerOptions;
  const configPath =
    tree.configPath === undefined ? "tsconfig.json" : relPath(report, tree.configPath);
  return {
    id: "TSCONFIG:project",
    kind: "tsconfig",
    path: configPath,
    fields: compactFields({
      source: tree.configPath === undefined ? "missing" : "typescript-config-parser",
      module: options.module,
      moduleResolution: options.moduleResolution,
      target: options.target,
      jsx: options.jsx,
      allowJs: options.allowJs,
      checkJs: options.checkJs,
      noEmit: options.noEmit,
      composite: options.composite,
      declaration: options.declaration,
      pathAliases: tree.pathAliases.length,
      paths: tree.pathAliases.map((alias) => alias.pattern).slice(0, 8),
      projectReferences: tree.projectReferences.length,
      diagnostics: tree.diagnostics.filter((diagnostic) => diagnostic.phase === "config").length,
    }),
  };
}

function testSurfacePrimeNode(report: TypeScriptHarnessReport): SemanticSearchNode {
  const testModules = report.reasoningTree.modules.filter(
    (moduleReport) => moduleReport.role === "test",
  );
  const storyModules = report.reasoningTree.modules.filter((moduleReport) =>
    /\.(stories|story)\.[cm]?[jt]sx?$/u.test(moduleReport.path),
  );
  const e2eModules = testModules.filter((moduleReport) =>
    /(^|\/)e2e(\/|$)/u.test(relPath(report, moduleReport.path)),
  );
  return {
    id: "SURFACE:test",
    kind: "test_surface",
    path: ".",
    fields: compactFields({
      roots: report.reasoningTree.testRoots.map((root) => relPath(report, root)).slice(0, 8),
      tests: testModules.length,
      stories: storyModules.length,
      e2e: e2eModules.length,
      next: ["tests:."],
    }),
  };
}

function compactFields(
  fields: Readonly<Record<string, SemanticSearchFieldValue | undefined>>,
): Record<string, SemanticSearchFieldValue> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Record<string, SemanticSearchFieldValue>;
}
